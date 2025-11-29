const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const http = require('http');
const fs = require('fs'); // [NEW] Thêm thư viện đọc file
const path = require('path'); // [NEW] Thêm thư viện xử lý đường dẫn
const { Server } = require('socket.io');
const { pool } = require('./config/database');
require('dotenv').config();

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

// Swagger
try {
    const { swaggerUi, swaggerSpec } = require('./swagger');
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, { explorer: true }));
    console.log('📄 Swagger UI: /api-docs');
} catch (e) {
    console.warn('Swagger not initialized:', e.message);
}

// Socket Connection
io.on('connection', (socket) => {
    console.log('🔌 Socket connected:', socket.id);
    socket.on('disconnect', () => console.log('🔌 Socket disconnected:', socket.id));
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

// --- REMINDER SCANNER (CRON JOB) ---
const scanReminders = async () => {
    try {
        const todoQuery = `
            SELECT id, title, reminder_time, user_id FROM todos 
            WHERE reminder_time IS NOT NULL 
            AND reminder_time >= NOW() 
            AND reminder_time < NOW() + INTERVAL '1 minute'
            AND is_completed = false AND is_deleted = false
        `;

        const eventQuery = `
            SELECT id, title, event_date, user_id FROM events 
            WHERE event_date >= NOW() 
            AND event_date < NOW() + INTERVAL '1 minute'
            AND is_deleted = false
        `;

        const [todosRes, eventsRes] = await Promise.all([
            pool.query(todoQuery),
            pool.query(eventQuery)
        ]);

        todosRes.rows.forEach(t => {
            console.log(`🔔 Sending Todo Reminder: ${t.title}`);
            io.emit('todo_reminder', {
                id: t.id,
                title: t.title,
                message: `Đến hạn công việc: ${t.title}`,
                time: t.reminder_time
            });
        });

        eventsRes.rows.forEach(e => {
            console.log(`🎉 Sending Event Alert: ${e.title}`);
            io.emit('event_due', {
                id: e.id,
                title: e.title,
                message: `Sự kiện diễn ra ngay bây giờ: ${e.title}`,
                time: e.event_date
            });
        });

    } catch (err) {
        console.error('Scan Error:', err.message);
    }
};

// [UPDATED] FUNCTION KHỞI TẠO DATABASE (AN TOÀN)
const initializeDatabase = async () => {
    try {
        const schemaPath = path.join(__dirname, 'database', 'schema.sql');

        if (fs.existsSync(schemaPath)) {
            console.log('🔄 Đang kiểm tra và cập nhật cấu trúc database...');
            const schema = fs.readFileSync(schemaPath, 'utf8');

            await pool.query(schema);

            console.log('✅ Cấu trúc Database đã sẵn sàng (Dữ liệu cũ được bảo toàn)!');
        } else {
            console.warn(`⚠️ Không tìm thấy file schema tại: ${schemaPath}`);
        }
    } catch (err) {
        console.error('❌ Lỗi khởi tạo database:', err.message);
    }
};

// [UPDATED] Start Server với Database Init
const startServer = async (retries = 5) => {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            await pool.query('SELECT 1');
            console.log('✅ Kết nối Database thành công');

            // --- GỌI HÀM INIT DATABASE Ở ĐÂY ---
            // Mặc định chạy mỗi lần start. 
            // Nếu muốn an toàn hơn, hãy bọc trong điều kiện: if (process.env.RESET_DB === 'true') { ... }
            await initializeDatabase();
            // ------------------------------------

            // Bắt đầu scanner
            setInterval(scanReminders, 60000);

            server.listen(PORT, HOST, () => {
                console.log('');
                console.log('╔════════════════════════════════════════════╗');
                console.log('║   Personal Utility API Server              ║');
                console.log('╚════════════════════════════════════════════╝');
                console.log('');
                console.log(`🚀 Server running on port ${PORT}`);
                console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
                console.log(`📍 Local: http://localhost:${PORT}`);
                console.log(`📄 API Docs: http://localhost:${PORT}/api-docs`);
                console.log('');
            });
            return;
        } catch (err) {
            console.error(`DB connection failed (attempt ${attempt}/${retries}):`, err.message);
            if (attempt === retries) {
                console.error('Exhausted retries. Exiting.');
                process.exit(1);
            }
            await new Promise(r => setTimeout(r, 2000));
        }
    }
};

// Config Host & Port
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

startServer();

module.exports = app;