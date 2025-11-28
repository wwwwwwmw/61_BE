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
                    startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                    endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
                    break;
                case 'weekly':
                    const day = now.getDay();
                    startDate = new Date(now);
                    startDate.setDate(now.getDate() - day);
                    startDate.setHours(0, 0, 0, 0);
                    endDate = new Date(startDate);
                    endDate.setDate(startDate.getDate() + 6);
                    endDate.setHours(23, 59, 59, 999);
                    break;
                case 'yearly':
                    startDate = new Date(now.getFullYear(), 0, 1);
                    endDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
                    break;
                case 'monthly':
                default:
                    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                    endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
                    break;
            }
        }

        // Prepare parameters
        const params = [userId, startDate, endDate];

        // Get total income and expense
        const totalResult = await query(
            `SELECT type, SUM(amount) as total
             FROM expenses
             WHERE user_id = $1 AND is_deleted = false
               AND date >= $2 AND date <= $3
             GROUP BY type`, params);

        // Get by category (for pie chart / distribution)
        const categoryResult = await query(
            `SELECT e.type, c.name as category_name, c.color as category_color, c.icon as category_icon,
                    SUM(e.amount) as total, COUNT(e.id) as count
             FROM expenses e
             LEFT JOIN categories c ON e.category_id = c.id
             WHERE e.user_id = $1 AND e.is_deleted = false
               AND e.date >= $2 AND e.date <= $3
             GROUP BY e.type, c.id, c.name, c.color, c.icon
             ORDER BY total DESC`, params);

        // Daily trend (for line chart)
        const trendResult = await query(
            `SELECT DATE(date) as day, type, SUM(amount) as total
             FROM expenses
             WHERE user_id = $1 AND is_deleted = false
               AND date >= $2 AND date <= $3
             GROUP BY DATE(date), type
             ORDER BY day ASC`, params);

        // Build daily totals structure
        const dailyMap = {};
        trendResult.rows.forEach(r => {
            const day = r.day.toISOString().split('T')[0];
            if (!dailyMap[day]) dailyMap[day] = { income: 0, expense: 0 };
            dailyMap[day][r.type] = parseFloat(r.total);
        });
        const dailyTotals = Object.entries(dailyMap).map(([day, v]) => ({ day, income: v.income, expense: v.expense }));

        // Category totals for chart
        const categoryTotals = categoryResult.rows.map(r => ({
            type: r.type,
            category: r.category_name,
            color: r.category_color,
            icon: r.category_icon,
            total: parseFloat(r.total),
            count: parseInt(r.count)
        }));

        const totals = totalResult.rows.reduce((acc, row) => {
            acc[row.type] = parseFloat(row.total);
            return acc;
        }, { income: 0, expense: 0 });

        res.json({
            success: true,
            data: {
                range: { startDate, endDate, period },
                summary: {
                    totalIncome: totals.income || 0,
                    totalExpense: totals.expense || 0,
                    balance: (totals.income || 0) - (totals.expense || 0)
                },
                categoryTotals,
                dailyTotals
            }
        });
    } catch (error) {
        console.error('Get statistics error:', error);
        res.status(500).json({ success: false, message: 'Lỗi khi lấy thống kê', error: error.message });
    }
});

// @route   POST /api/expenses
// @desc    Create new expense
// @access  Private
router.post('/', expenseValidation, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const userId = req.user.id;
        const {
            amount,
            type,
            category_id,
            description,
            date = new Date(),
            payment_method,
            client_id
        } = req.body;

        const result = await query(
            `INSERT INTO expenses (
        user_id, amount, type, category_id, description,
        date, payment_method, client_id, last_synced_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
      RETURNING *`,
            [userId, amount, type, category_id, description, date, payment_method, client_id]
        );

        res.status(201).json({
            success: true,
            message: 'Tạo giao dịch thành công',
            data: result.rows[0]
        });
    } catch (error) {
        console.error('Create expense error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi tạo giao dịch',
            error: error.message
        });
    }
});

// @route   PUT /api/expenses/:id
// @desc    Update expense
// @access  Private
router.put('/:id', expenseValidation, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const userId = req.user.id;
        const expenseId = req.params.id;
        const {
            amount,
            type,
            category_id,
            description,
            date,
            payment_method
        } = req.body;

        const result = await query(
            `UPDATE expenses 
       SET amount = $1, type = $2, category_id = $3, description = $4,
           date = $5, payment_method = $6,
           version = version + 1, last_synced_at = CURRENT_TIMESTAMP
       WHERE id = $7 AND user_id = $8 AND is_deleted = false
       RETURNING *`,
            [amount, type, category_id, description, date, payment_method, expenseId, userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy giao dịch'
            });
        }

        res.json({
            success: true,
            message: 'Cập nhật giao dịch thành công',
            data: result.rows[0]
        });
    } catch (error) {
        console.error('Update expense error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi cập nhật giao dịch',
            error: error.message
        });
    }
});

// @route   DELETE /api/expenses/:id
// @desc    Soft delete expense
// @access  Private
router.delete('/:id', async (req, res) => {
    try {
        const userId = req.user.id;
        const expenseId = req.params.id;
        const { permanent = false } = req.query;

        let result;

        if (permanent === 'true') {
            result = await query(
                'DELETE FROM expenses WHERE id = $1 AND user_id = $2 RETURNING id',
                [expenseId, userId]
            );
        } else {
            result = await query(
                `UPDATE expenses 
         SET is_deleted = true, deleted_at = CURRENT_TIMESTAMP,
             version = version + 1, last_synced_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND user_id = $2
         RETURNING id`,
                [expenseId, userId]
            );
        }

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy giao dịch'
            });
        }

        res.json({
            success: true,
            message: 'Xóa giao dịch thành công'
        });
    } catch (error) {
        console.error('Delete expense error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi xóa giao dịch',
            error: error.message
        });
    }
});

// @route   POST /api/expenses/sync
// @desc    Sync expenses from client
// @access  Private
router.post('/sync', async (req, res) => {
    const client = await getClient();

    try {
        await client.query('BEGIN');

        const userId = req.user.id;
        const { expenses, lastSyncTime } = req.body;

        // Get server changes since last sync
        const serverChanges = await client.query(
            `SELECT * FROM expenses 
       WHERE user_id = $1 AND last_synced_at > $2
       ORDER BY last_synced_at ASC`,
            [userId, lastSyncTime || '1970-01-01']
        );

        const syncedExpenses = [];

        for (const expense of expenses) {
            if (expense.id) {
                // Update existing
                const result = await client.query(
                    `UPDATE expenses 
           SET amount = $1, type = $2, category_id = $3, description = $4,
               date = $5, payment_method = $6,
               version = version + 1, last_synced_at = CURRENT_TIMESTAMP
           WHERE id = $7 AND user_id = $8
           RETURNING *`,
                    [expense.amount, expense.type, expense.category_id, expense.description,
                    expense.date, expense.payment_method, expense.id, userId]
                );
                if (result.rows.length > 0) {
                    syncedExpenses.push(result.rows[0]);
                }
            } else {
                // Insert new
                const result = await client.query(
                    `INSERT INTO expenses (
            user_id, amount, type, category_id, description,
            date, payment_method, client_id, last_synced_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
          RETURNING *`,
                    [userId, expense.amount, expense.type, expense.category_id,
                        expense.description, expense.date, expense.payment_method, expense.client_id]
                );
                syncedExpenses.push(result.rows[0]);
            }
        }

        await client.query('COMMIT');

        res.json({
            success: true,
            data: {
                serverChanges: serverChanges.rows,
                syncedExpenses,
                syncTime: new Date().toISOString()
            }
        });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Sync error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi đồng bộ dữ liệu',
            error: error.message
        });
    } finally {
        client.release();
    }
});

module.exports = router;
