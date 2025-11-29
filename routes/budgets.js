const express = require('express');
const { body, validationResult } = require('express-validator');
const { query } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Validation rules
const budgetValidation = [
    body('amount').isFloat({ min: 0 }).withMessage('Số tiền phải lớn hơn hoặc bằng 0'),
    body('period').isIn(['daily', 'weekly', 'monthly', 'yearly']).withMessage('Chu kỳ không hợp lệ')
];

// @route   GET /api/budgets
// @desc    Get all budgets for user
// @access  Private
/**
 * @swagger
 * /api/budgets:
 *   get:
 *     summary: Lấy danh sách ngân sách
 *     tags: [Budgets]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: is_active
 *         schema: { type: boolean }
 *     responses:
 *       200:
 *         description: Danh sách ngân sách
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { type: array, items: { $ref: '#/components/schemas/Budget' } }
 */
router.get('/', async (req, res) => {
    try {
        const userId = req.user.id;
        const { is_active } = req.query;

        let queryText = `
      SELECT b.*, c.name as category_name, c.color as category_color
      FROM budgets b
      LEFT JOIN categories c ON b.category_id = c.id
      WHERE b.user_id = $1
    `;
        const params = [userId];

        if (is_active !== undefined) {
            queryText += ' AND b.is_active = $2';
            params.push(is_active === 'true');
        }

        queryText += ' ORDER BY b.created_at DESC';

        const result = await query(queryText, params);

        res.json({
            success: true,
            data: result.rows
        });
    } catch (error) {
        console.error('Get budgets error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy danh sách ngân sách',
            error: error.message
        });
    }
});

// @route   GET /api/budgets/:id
// @desc    Get single budget
// @access  Private
/**
 * @swagger
 * /api/budgets/{id}:
 *   get:
 *     summary: Lấy chi tiết ngân sách
 *     tags: [Budgets]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Chi tiết ngân sách
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { $ref: '#/components/schemas/Budget' }
 *       404:
 *         description: Không tìm thấy
 */
router.get('/:id', async (req, res) => {
    try {
        const userId = req.user.id;
        const budgetId = req.params.id;
        const result = await query(
            `SELECT b.*, c.name as category_name, c.color as category_color
             FROM budgets b
             LEFT JOIN categories c ON b.category_id = c.id
             WHERE b.id = $1 AND b.user_id = $2`,
            [budgetId, userId]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy ngân sách' });
        }
        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        console.error('Get single budget error:', error);
        res.status(500).json({ success: false, message: 'Lỗi khi lấy ngân sách', error: error.message });
    }
});

// @route   GET /api/budgets/:id/status
// @desc    Get budget status with current spending
// @access  Private
/**
 * @swagger
 * /api/budgets/{id}/status:
 *   get:
 *     summary: Lấy trạng thái chi tiêu của ngân sách
 *     tags: [Budgets]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Trạng thái ngân sách
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     budget: { $ref: '#/components/schemas/Budget' }
 *                     spending:
 *                       type: object
 *                       properties:
 *                         totalSpent: { type: number }
 *                         budgetAmount: { type: number }
 *                         remaining: { type: number }
 *                         percentage: { type: string }
 *                         isOverBudget: { type: boolean }
 */
router.get('/:id/status', async (req, res) => {
    try {
        const userId = req.user.id;
        const budgetId = req.params.id;

        // Get budget info
        const budgetResult = await query(
            `SELECT b.*, c.name as category_name
       FROM budgets b
       LEFT JOIN categories c ON b.category_id = c.id
       WHERE b.id = $1 AND b.user_id = $2`,
            [budgetId, userId]
        );

        if (budgetResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy ngân sách'
            });
        }

        const budget = budgetResult.rows[0];

        // Calculate date range based on period
        const now = new Date();
        let startDate, endDate;

        switch (budget.period) {
            case 'daily':
                startDate = new Date(now.setHours(0, 0, 0, 0));
                endDate = new Date(now.setHours(23, 59, 59, 999));
                break;
            case 'weekly':
                const dayOfWeek = now.getDay();
                startDate = new Date(now);
                startDate.setDate(now.getDate() - dayOfWeek);
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

        // Get current spending
        const spendingResult = await query(
            `SELECT COALESCE(SUM(amount), 0) as total_spent
       FROM expenses
       WHERE user_id = $1 
         AND type = 'expense'
         AND category_id = $2
         AND date >= $3 
         AND date <= $4
         AND is_deleted = false`,
            [userId, budget.category_id, startDate, endDate]
        );

        const totalSpent = parseFloat(spendingResult.rows[0].total_spent);
        const budgetAmount = parseFloat(budget.amount);
        const percentage = budgetAmount > 0 ? (totalSpent / budgetAmount) * 100 : 0;
        const remaining = budgetAmount - totalSpent;
        const isOverBudget = totalSpent > budgetAmount;
        const alertThresholdAmount = (budgetAmount * budget.alert_threshold) / 100;
        const shouldAlert = totalSpent >= alertThresholdAmount;

        res.json({
            success: true,
            data: {
                budget,
                spending: {
                    totalSpent,
                    budgetAmount,
                    remaining,
                    percentage: percentage.toFixed(2),
                    isOverBudget,
                    shouldAlert,
                    alertThreshold: budget.alert_threshold,
                    period: {
                        startDate,
                        endDate
                    }
                }
            }
        });
    } catch (error) {
        console.error('Get budget status error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy trạng thái ngân sách',
            error: error.message
        });
    }
});

// @route   POST /api/budgets
// @desc    Create new budget
// @access  Private
/**
 * @swagger
 * /api/budgets:
 *   post:
 *     summary: Tạo ngân sách mới
 *     tags: [Budgets]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [category_id, amount, period]
 *             properties:
 *               category_id: { type: integer }
 *               amount: { type: number }
 *               period: { type: string, enum: [daily, weekly, monthly, yearly] }
 *               start_date: { type: string, format: date-time }
 *               end_date: { type: string, format: date-time }
 *               alert_threshold: { type: integer }
 *     responses:
 *       201:
 *         description: Tạo thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { $ref: '#/components/schemas/Budget' }
 */
router.post('/', budgetValidation, async (req, res) => {
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
            category_id,
            amount,
            period = 'monthly',
            start_date = new Date(),
            end_date,
            alert_threshold = 80
        } = req.body;

        const result = await query(
            `INSERT INTO budgets (
        user_id, category_id, amount, period, start_date, 
        end_date, alert_threshold
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
            [userId, category_id, amount, period, start_date, end_date, alert_threshold]
        );

        res.status(201).json({
            success: true,
            message: 'Tạo ngân sách thành công',
            data: result.rows[0]
        });
    } catch (error) {
        console.error('Create budget error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi tạo ngân sách',
            error: error.message
        });
    }
});

// @route   PUT /api/budgets/:id
// @desc    Update budget
// @access  Private
/**
 * @swagger
 * /api/budgets/{id}:
 *   put:
 *     summary: Cập nhật ngân sách
 *     tags: [Budgets]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               category_id: { type: integer }
 *               amount: { type: number }
 *               period: { type: string, enum: [daily, weekly, monthly, yearly] }
 *               start_date: { type: string, format: date-time }
 *               end_date: { type: string, format: date-time }
 *               alert_threshold: { type: integer }
 *               is_active: { type: boolean }
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { $ref: '#/components/schemas/Budget' }
 */
router.put('/:id', budgetValidation, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const userId = req.user.id;
        const budgetId = req.params.id;
        const {
            category_id,
            amount,
            period,
            start_date,
            end_date,
            alert_threshold,
            is_active
        } = req.body;

        const result = await query(
            `UPDATE budgets 
       SET category_id = $1, amount = $2, period = $3, 
           start_date = $4, end_date = $5, alert_threshold = $6,
           is_active = $7
       WHERE id = $8 AND user_id = $9
       RETURNING *`,
            [category_id, amount, period, start_date, end_date,
                alert_threshold, is_active, budgetId, userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy ngân sách'
            });
        }

        res.json({
            success: true,
            message: 'Cập nhật ngân sách thành công',
            data: result.rows[0]
        });
    } catch (error) {
        console.error('Update budget error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi cập nhật ngân sách',
            error: error.message
        });
    }
});

// @route   DELETE /api/budgets/:id
// @desc    Delete budget
// @access  Private
/**
 * @swagger
 * /api/budgets/{id}:
 *   delete:
 *     summary: Xóa ngân sách
 *     tags: [Budgets]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Xóa thành công
 */
router.delete('/:id', async (req, res) => {
    try {
        const userId = req.user.id;
        const budgetId = req.params.id;

        const result = await query(
            'DELETE FROM budgets WHERE id = $1 AND user_id = $2 RETURNING id',
            [budgetId, userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy ngân sách'
            });
        }

        res.json({
            success: true,
            message: 'Xóa ngân sách thành công'
        });
    } catch (error) {
        console.error('Delete budget error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi xóa ngân sách',
            error: error.message
        });
    }
});

module.exports = router;
