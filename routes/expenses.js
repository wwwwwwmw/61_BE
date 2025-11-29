const express = require('express');
const { body, validationResult } = require('express-validator');
const { query, getClient } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Validation rules
const expenseValidation = [
    body('amount').isFloat({ min: 0.01 }).withMessage('Số tiền phải lớn hơn 0'),
    body('type').isIn(['income', 'expense']).withMessage('Loại giao dịch không hợp lệ'),
    body('date').optional().isISO8601().withMessage('Ngày không hợp lệ')
];

// @route   GET /api/expenses
// @desc    Get all expenses for user
// @access  Private
router.get('/', async (req, res) => {
    try {
        const userId = req.user.id;
        const {
            type,
            category_id,
            start_date,
            end_date,
            includeDeleted = false
        } = req.query;

        let queryText = `
      SELECT e.*, c.name as category_name, c.color as category_color, c.icon as category_icon
      FROM expenses e
      LEFT JOIN categories c ON e.category_id = c.id
      WHERE e.user_id = $1
    `;
        const params = [userId];
        let paramIndex = 2;

        // Filter by deleted status
        if (includeDeleted !== 'true') {
            queryText += ` AND e.is_deleted = false`;
        }

        // Filter by type
        if (type) {
            queryText += ` AND e.type = $${paramIndex}`;
            params.push(type);
            paramIndex++;
        }

        // Filter by category
        if (category_id) {
            queryText += ` AND e.category_id = $${paramIndex}`;
            params.push(category_id);
            paramIndex++;
        }

        // Filter by date range
        if (start_date) {
            queryText += ` AND e.date >= $${paramIndex}`;
            params.push(start_date);
            paramIndex++;
        }

        if (end_date) {
            queryText += ` AND e.date <= $${paramIndex}`;
            params.push(end_date);
            paramIndex++;
        }

        queryText += ' ORDER BY e.date DESC, e.created_at DESC';

        const result = await query(queryText, params);

        res.json({
            success: true,
            data: result.rows
        });
    } catch (error) {
        console.error('Get expenses error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy danh sách giao dịch',
            error: error.message
        });
    }
});

// @route   GET /api/expenses/statistics
// @desc    Get expense statistics
// @access  Private
router.get('/statistics', async (req, res) => {
    try {
        const userId = req.user.id;
        const { period = 'monthly', start_date, end_date } = req.query;

        // Determine date range if not provided
        let startDate = start_date ? new Date(start_date) : new Date();
        let endDate = end_date ? new Date(end_date) : new Date();
        const now = new Date();
        if (!start_date || !end_date) {
            switch (period) {
                case 'daily':
                    startDate.setHours(0, 0, 0, 0);
                    endDate.setHours(23, 59, 59, 999);
                    break;
                case 'weekly':
                    const day = now.getDay();
                    const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
                    startDate = new Date(now.setDate(diff));
                    startDate.setHours(0, 0, 0, 0);
                    endDate = new Date(startDate);
                    endDate.setDate(startDate.getDate() + 6);
                    endDate.setHours(23, 59, 59, 999);
                    break;
                case 'monthly':
                    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                    endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
                    break;
                case 'yearly':
                    startDate = new Date(now.getFullYear(), 0, 1);
                    endDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
                    break;
            }
        }

        const result = await query(
            `SELECT 
                COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) as total_income,
                COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) as total_expense
             FROM expenses 
             WHERE user_id = $1 
             AND date >= $2 
             AND date <= $3
             AND is_deleted = false`,
            [userId, startDate, endDate]
        );

        const stats = result.rows[0];
        const totalIncome = parseFloat(stats.total_income);
        const totalExpense = parseFloat(stats.total_expense);
        const balance = totalIncome - totalExpense;

        res.json({
            success: true,
            data: {
                period,
                startDate,
                endDate,
                totalIncome,
                totalExpense,
                balance
            }
        });
    } catch (error) {
        console.error('Get statistics error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy thống kê',
            error: error.message
        });
    }
});

module.exports = router;
