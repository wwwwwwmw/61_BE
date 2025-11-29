const express = require('express');
const { body, validationResult } = require('express-validator');
const { query } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Middleware xác thực cho tất cả các routes
router.use(authenticateToken);

// --- HELPER FUNCTIONS ---

// Tính ngày bắt đầu và kết thúc của chu kỳ ngân sách
const getBudgetPeriod = (period) => {
    const now = new Date();
    let start = new Date(now);
    let end = new Date(now);

    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);

    if (period === 'weekly') {
        const day = now.getDay();
        const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Thứ 2 là đầu tuần
        start.setDate(diff);
        end.setDate(start.getDate() + 6);
    } else if (period === 'monthly') {
        start.setDate(1);
        end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    } else if (period === 'yearly') {
        start.setMonth(0, 1);
        end.setMonth(11, 31);
    }
    return { start, end };
};

// Kiểm tra xem khoản chi mới có làm vượt ngân sách không
const checkBudgetOverflow = async (userId, categoryId, newAmount) => {
    try {
        // 1. Tìm ngân sách đang active cho danh mục này
        const budgetRes = await query(
            `SELECT * FROM budgets WHERE user_id = $1 AND category_id = $2 AND is_active = true`,
            [userId, categoryId]
        );

        if (budgetRes.rows.length === 0) return null; // Không có ngân sách => Không cảnh báo

        const budget = budgetRes.rows[0];
        const { start, end } = getBudgetPeriod(budget.period);

        // 2. Tính tổng chi tiêu hiện tại trong kỳ (chưa bao gồm khoản mới)
        const spendRes = await query(
            `SELECT COALESCE(SUM(amount), 0) as total FROM expenses 
             WHERE user_id = $1 AND category_id = $2 
             AND date >= $3 AND date <= $4 AND is_deleted = false`,
            [userId, categoryId, start, end]
        );

        const currentSpent = parseFloat(spendRes.rows[0].total);
        const amountToAdd = parseFloat(newAmount);
        const totalAfter = currentSpent + amountToAdd;
        const limit = parseFloat(budget.amount);
        const threshold = (limit * budget.alert_threshold) / 100;

        // 3. Logic cảnh báo
        if (totalAfter >= limit) {
            return {
                type: 'danger',
                message: `Cảnh báo: Khoản chi này làm vượt quá ngân sách ${budget.period} (${(totalAfter / limit * 100).toFixed(1)}%)!`
            };
        } else if (totalAfter >= threshold) {
            return {
                type: 'warning',
                message: `Chú ý: Bạn đã dùng ${(totalAfter / limit * 100).toFixed(1)}% ngân sách.`
            };
        }
        return null;
    } catch (e) {
        console.error("Budget check error:", e);
        return null;
    }
};

// --- API ROUTES ---

// @route   GET /api/expenses
// @desc    Lấy danh sách chi tiêu (có lọc)
router.get('/', async (req, res) => {
    try {
        const userId = req.user.id;
        const { type, category_id, start_date, end_date, includeDeleted } = req.query;

        let queryText = `
            SELECT e.*, c.name as category_name, c.color as category_color, c.icon as category_icon
            FROM expenses e
            LEFT JOIN categories c ON e.category_id = c.id
            WHERE e.user_id = $1
        `;
        const params = [userId];
        let idx = 2;

        if (includeDeleted !== 'true') {
            queryText += ` AND e.is_deleted = false`;
        }
        if (type) {
            queryText += ` AND e.type = $${idx++}`;
            params.push(type);
        }
        if (category_id) {
            queryText += ` AND e.category_id = $${idx++}`;
            params.push(category_id);
        }
        if (start_date) {
            queryText += ` AND e.date >= $${idx++}`;
            params.push(start_date);
        }
        if (end_date) {
            queryText += ` AND e.date <= $${idx++}`;
            params.push(end_date);
        }

        queryText += ' ORDER BY e.date DESC, e.created_at DESC';

        const result = await query(queryText, params);
        res.json({ success: true, data: result.rows });
    } catch (error) {
        console.error('Get expenses error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// @route   POST /api/expenses
// @desc    Tạo khoản thu/chi mới (Kèm kiểm tra ngân sách)
router.post('/', [
    body('amount').isFloat({ min: 0.01 }).withMessage('Số tiền không hợp lệ'),
    body('type').isIn(['income', 'expense']).withMessage('Loại không hợp lệ'),
    body('category_id').isInt().withMessage('Danh mục không hợp lệ')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

        const userId = req.user.id;
        const { amount, type, category_id, description, date, payment_method } = req.body;

        // 1. Insert vào DB
        const result = await query(
            `INSERT INTO expenses (user_id, amount, type, category_id, description, date, payment_method)
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
            [userId, amount, type, category_id, description, date || new Date(), payment_method]
        );

        const newExpense = result.rows[0];
        let budgetAlert = null;

        // 2. Kiểm tra ngân sách nếu là khoản chi
        if (type === 'expense') {
            budgetAlert = await checkBudgetOverflow(userId, category_id, amount);
        }

        res.status(201).json({
            success: true,
            data: newExpense,
            budgetAlert: budgetAlert // Client sẽ hiển thị popup nếu có dữ liệu này
        });
    } catch (error) {
        console.error('Create expense error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// @route   GET /api/expenses/statistics
// @desc    Thống kê thu chi
router.get('/statistics', async (req, res) => {
    try {
        const userId = req.user.id;
        const { start_date, end_date } = req.query;

        // Mặc định tháng hiện tại nếu không truyền ngày
        let startDate = start_date ? new Date(start_date) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
        let endDate = end_date ? new Date(end_date) : new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0, 23, 59, 59);

        const result = await query(
            `SELECT 
                COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) as total_income,
                COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) as total_expense
             FROM expenses 
             WHERE user_id = $1 
             AND date >= $2 AND date <= $3
             AND is_deleted = false`,
            [userId, startDate, endDate]
        );

        const stats = result.rows[0];
        res.json({
            success: true,
            data: {
                totalIncome: parseFloat(stats.total_income),
                totalExpense: parseFloat(stats.total_expense),
                balance: parseFloat(stats.total_income) - parseFloat(stats.total_expense)
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;