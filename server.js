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

// Security middleware
app.use(helmet());

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

const startServer = async (retries = 5) => {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            await pool.query('SELECT 1');
            app.listen(PORT, HOST, () => {
                console.log('');
                console.log('╔════════════════════════════════════════════╗');
                console.log('║   Personal Utility API Server              ║');
                console.log('╚════════════════════════════════════════════╝');
                console.log('');
                console.log(`🚀 Server running on port ${PORT}`);
                console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
                console.log(`📍 Local: http://localhost:${PORT}`);
                console.log(`📱 LAN:   http://${process.env.DEVICE_IP || 'YOUR_PC_IP'}:${PORT}`);
                console.log('');
                console.log('✓ Ready to accept connections from mobile devices');
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
