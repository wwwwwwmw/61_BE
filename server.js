const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
require('dotenv').config();

// Import routes
const authRoutes = require('./routes/auth');
const todoRoutes = require('./routes/todos');
const expenseRoutes = require('./routes/expenses');
const eventRoutes = require('./routes/events');
const categoryRoutes = require('./routes/categories');
const budgetRoutes = require('./routes/budgets');

// Initialize express app
const app = express();
// Database pool (for health & startup check)
const { pool } = require('./config/database');
// HTTP + Socket.io setup
const http = require('http');
const server = http.createServer(app);
const { Server } = require('socket.io');
const io = new Server(server, {
    cors: {
        origin: process.env.CORS_ORIGIN || '*',
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
    }
});

io.on('connection', (socket) => {
    console.log('🔌 Socket connected:', socket.id);
    socket.on('disconnect', () => console.log('🔌 Socket disconnected:', socket.id));
});

// Security middleware
app.use(helmet());

// Swagger docs
try {
    const { swaggerUi, swaggerSpec } = require('./swagger');
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, { explorer: true }));
    console.log('📄 Swagger UI available at /api-docs');
} catch (e) {
    console.warn('Swagger not initialized:', e.message);
}

// CORS configuration
app.use(cors({
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true
}));

// Body parser middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Compression middleware
app.use(compression());

// Request logging middleware
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

// Health check endpoint
app.get('/health', async (req, res) => {
    let dbOk = false;
    try {
        await pool.query('SELECT 1');
        dbOk = true;
    } catch (e) {
        dbOk = false;
    }
    res.json({
        success: true,
        message: 'Server is running',
        timestamp: new Date().toISOString(),
        database: dbOk ? 'connected' : 'error'
    });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/todos', todoRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/budgets', budgetRoutes);

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'Endpoint not found'
    });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('Global error handler:', err);

    res.status(err.status || 500).json({
        success: false,
        message: err.message || 'Internal server error',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
});

// Start server only after DB check (with simple retry)
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0'; // Listen on all network interfaces

// Reminder scan: emits events for upcoming reminders (runs every minute)
const scanReminders = async () => {
    try {
        // Todos with reminder_time within next minute and not completed
        const todosRes = await pool.query(`SELECT id, title, reminder_time FROM todos 
          WHERE reminder_time IS NOT NULL 
            AND reminder_time <= CURRENT_TIMESTAMP + INTERVAL '1 minute'
            AND reminder_time > CURRENT_TIMESTAMP
            AND is_completed = false AND is_deleted = false`);
        todosRes.rows.forEach(t => {
            io.emit('todo_reminder', { id: t.id, title: t.title, reminderTime: t.reminder_time });
        });
        // Events starting within next minute
        const eventsRes = await pool.query(`SELECT id, title, event_date FROM events 
          WHERE event_date <= CURRENT_TIMESTAMP + INTERVAL '1 minute'
            AND event_date > CURRENT_TIMESTAMP
            AND is_deleted = false`);
        eventsRes.rows.forEach(e => {
            io.emit('event_due', { id: e.id, title: e.title, eventDate: e.event_date });
        });
    } catch (err) {
        console.error('Reminder scan error:', err.message);
    }
};
setInterval(scanReminders, 60_000);

const startServer = async (retries = 5) => {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            await pool.query('SELECT 1');
            server.listen(PORT, HOST, () => {
                console.log('');
                console.log('╔════════════════════════════════════════════╗');
                console.log('║   Personal Utility API Server              ║');
                console.log('╚════════════════════════════════════════════╝');
                console.log('');
                console.log(`🚀 Server running on port ${PORT}`);
                console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
                console.log(`📍 Local: http://localhost:${PORT}`);
                console.log(`📱 LAN:   http://${process.env.DEVICE_IP || 'YOUR_PC_IP'}:${PORT}`);
                console.log(`📄 API Docs: http://localhost:${PORT}/api-docs`);
                console.log('');
                console.log('✓ Ready to accept connections from mobile devices');
                console.log('✓ Socket.io ready for real-time notifications');
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

startServer();

module.exports = app;
