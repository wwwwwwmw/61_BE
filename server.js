const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { Server } = require('socket.io');
const { pool } = require('./config/database'); // Import pool kết nối DB
require('dotenv').config();

// Set Node process timezone to GMT+7 (Vietnam)
process.env.TZ = 'Asia/Ho_Chi_Minh';

// Routes Imports
const authRoutes = require('./routes/auth');
const todoRoutes = require('./routes/todos');
const expenseRoutes = require('./routes/expenses');
const eventRoutes = require('./routes/events');
const categoryRoutes = require('./routes/categories');
const budgetRoutes = require('./routes/budgets');

// App Setup
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: process.env.CORS_ORIGIN || '*',
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
    }
});

// Middleware
app.use(helmet());
app.use(compression());
app.use(cors({ origin: process.env.CORS_ORIGIN || '*', credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

// Swagger Setup
try {
    const { swaggerUi, swaggerSpec } = require('./swagger');
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
    console.log('📄 Swagger UI: /api-docs');
} catch (e) {
    console.warn('Swagger not initialized:', e.message);
}

// Socket Connection
io.on('connection', (socket) => {
    console.log(`🔌 Socket connected: ${socket.id}`);
    socket.on('disconnect', () => console.log(`🔌 Socket disconnected: ${socket.id}`));
});

// Health Check
app.get('/health', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        res.json({ status: 'ok', db: 'connected' });
    } catch (e) {
        res.status(500).json({ status: 'error', db: 'disconnected' });
    }
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/todos', todoRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/budgets', budgetRoutes);

// --- REMINDER / DEADLINE SCANNER (CRON JOB) ---
// Quét DB mỗi phút để tìm:
//  - Todos đến giờ reminder_time
//  - Todos sắp tới hạn (due_date trong vòng 1 phút tới, chưa hoàn thành)
//  - Events sắp diễn ra (event_date trong vòng 1 phút tới)
const scanReminders = async () => {
    try {
        // Reminder cho công việc (reminder_time)
          const nowTz = "NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh'";
          const todoReminderQuery = `
            SELECT id, title, reminder_time FROM todos
            WHERE reminder_time IS NOT NULL
              AND reminder_time <= ${nowTz}
              AND reminder_time > ${nowTz} - INTERVAL '1 minute'
              AND is_completed = false AND is_deleted = false
        `;

        // Các công việc chuẩn bị đến hạn chót (due_date)
          const todoDeadlineQuery = `
            SELECT id, title, due_date FROM todos
            WHERE due_date IS NOT NULL
              AND due_date <= ${nowTz}
              AND due_date > ${nowTz} - INTERVAL '1 minute'
              AND is_completed = false AND is_deleted = false
        `;

        // Sự kiện sắp diễn ra
                // Thông báo đúng thời điểm (không sớm 1 phút):
                // Chọn sự kiện vừa đến hạn trong vòng 1 phút trở lại đây.
                const eventQuery = `
                        SELECT id, title, event_date, is_recurring, recurrence_pattern FROM events
                        WHERE event_date <= ${nowTz}
                            AND event_date > ${nowTz} - INTERVAL '1 minute'
                            AND is_deleted = false
                `;

        const [todoReminderRes, todoDeadlineRes, eventsRes] = await Promise.all([
            pool.query(todoReminderQuery),
            pool.query(todoDeadlineQuery),
            pool.query(eventQuery)
        ]);

        if (todoReminderRes.rows.length) {
            console.log(`🔔 Todo reminders: ${todoReminderRes.rows.length}`);
        }
        if (todoDeadlineRes.rows.length) {
            console.log(`⏰ Todo deadlines: ${todoDeadlineRes.rows.length}`);
        }
        if (eventsRes.rows.length) {
            console.log(`🎉 Event alerts: ${eventsRes.rows.length}`);
        }

        // Emit reminder events
        todoReminderRes.rows.forEach(t => {
            io.emit('todo_reminder', {
                id: t.id,
                title: 'Nhắc nhở công việc',
                message: `Nhắc nhở: ${t.title}`,
                time: t.reminder_time
            });
        });

        // Emit deadline events
        todoDeadlineRes.rows.forEach(t => {
            io.emit('todo_deadline', {
                id: t.id,
                title: 'Công việc đến hạn',
                message: `Công việc "${t.title}" đã đến hạn chót!`,
                time: t.due_date
            });
        });

        // Emit event due notifications
        for (const e of eventsRes.rows) {
            io.emit('event_due', {
                id: e.id,
                title: 'Sự kiện sắp diễn ra',
                message: `Sự kiện: ${e.title}`,
                time: e.event_date
            });

            // Auto-advance recurring events after due
            if (e.is_recurring) {
                let interval = null;
                switch (e.recurrence_pattern) {
                    case 'daily':
                        interval = "INTERVAL '1 day'";
                        break;
                    case 'weekly':
                        interval = "INTERVAL '1 week'";
                        break;
                    case 'monthly':
                        interval = "INTERVAL '1 month'";
                        break;
                    case 'yearly':
                        interval = "INTERVAL '1 year'";
                        break;
                }
                if (interval) {
                    try {
                        await pool.query(
                            `UPDATE events SET event_date = event_date + ${interval}, updated_at = NOW() WHERE id = $1`,
                            [e.id]
                        );
                    } catch (advErr) {
                        console.error('Advance recurring event failed:', advErr.message);
                    }
                }
            }
        }
    } catch (err) {
        console.error('Scan Error:', err.message);
    }
};

// [FUNCTION KHỞI TẠO DATABASE]
const initializeDatabase = async () => {
    try {
        const schemaPath = path.join(__dirname, 'database', 'schema.sql');

        if (fs.existsSync(schemaPath)) {
            console.log('🔄 Đang kiểm tra cấu trúc database...');
            const schema = fs.readFileSync(schemaPath, 'utf8');
            await pool.query(schema);
            console.log('✅ Database đã sẵn sàng!');
        } else {
            console.warn(`⚠️ Không tìm thấy file schema tại: ${schemaPath}`);
        }
    } catch (err) {
        console.error('❌ Lỗi khởi tạo database:', err.message);
    }
};

// Start Server
const startServer = async (retries = 5) => {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            await pool.query('SELECT 1');
            console.log('✅ Kết nối Database thành công');

            await initializeDatabase();

            // Bắt đầu quét nhắc nhở mỗi 60 giây
            setInterval(scanReminders, 60000);

            const PORT = process.env.PORT || 3000;
            server.listen(PORT, '0.0.0.0', () => {
                console.log('');
                console.log('╔════════════════════════════════════════════╗');
                console.log('║   Personal Utility API Server              ║');
                console.log('╚════════════════════════════════════════════╝');
                console.log('');
                console.log(`🚀 Server running on port ${PORT}`);
                console.log(`🌍 Local: http://localhost:${PORT}`);
                console.log('');
            });
            return;
        } catch (err) {
            console.error(`DB connection failed (attempt ${attempt}/${retries}):`, err.message);
            if (attempt === retries) process.exit(1);
            await new Promise(r => setTimeout(r, 2000));
        }
    }
};

startServer();

module.exports = app;