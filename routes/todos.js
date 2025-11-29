const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

// 1. GET ALL (Lấy danh sách)
/**
 * @swagger
 * /api/todos:
 *   get:
 *     summary: Lấy danh sách công việc
 *     tags: [Todos]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Danh sách công việc
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { type: array, items: { $ref: '#/components/schemas/Todo' } }
 */
router.get('/', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM todos WHERE user_id = $1 AND is_deleted = false ORDER BY created_at DESC',
            [req.user.id]
        );
        res.json({ success: true, data: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 2. GET SINGLE (Chi tiết)
/**
 * @swagger
 * /api/todos/{id}:
 *   get:
 *     summary: Lấy chi tiết công việc
 *     tags: [Todos]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Chi tiết công việc
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { $ref: '#/components/schemas/Todo' }
 *       404:
 *         description: Không tìm thấy
 */
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM todos WHERE id = $1 AND user_id = $2',
            [req.params.id, req.user.id]
        );
        if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Không tìm thấy' });
        res.json({ success: true, data: result.rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 3. POST (Thêm mới)
/**
 * @swagger
 * /api/todos:
 *   post:
 *     summary: Tạo công việc mới
 *     tags: [Todos]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title]
 *             properties:
 *               title: { type: string }
 *               description: { type: string }
 *               priority: { type: string, enum: ['low', 'medium', 'high'] }
 *               due_date: { type: string, format: date-time }
 *               reminder_time: { type: string, format: date-time }
 *               tags: { type: array, items: { type: string } }
 *               category_id: { type: integer }
 *     responses:
 *       200:
 *         description: Tạo thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { $ref: '#/components/schemas/Todo' }
 */
router.post('/', authenticateToken, async (req, res) => {
    const { title, description, priority, due_date, reminder_time, tags, category_id } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO todos (user_id, title, description, priority, due_date, reminder_time, tags, category_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
            [req.user.id, title, description, priority, due_date, reminder_time, tags, category_id]
        );
        res.json({ success: true, data: result.rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 4. PUT (Sửa)
/**
 * @swagger
 * /api/todos/{id}:
 *   put:
 *     summary: Cập nhật công việc
 *     tags: [Todos]
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
 *               title: { type: string }
 *               description: { type: string }
 *               priority: { type: string, enum: ['low', 'medium', 'high'] }
 *               is_completed: { type: boolean }
 *               due_date: { type: string, format: date-time }
 *               reminder_time: { type: string, format: date-time }
 *               tags: { type: array, items: { type: string } }
 *               category_id: { type: integer }
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { $ref: '#/components/schemas/Todo' }
 */
router.put('/:id', authenticateToken, async (req, res) => {
    const { title, description, priority, is_completed, due_date, reminder_time, tags, category_id } = req.body;
    try {
        const result = await pool.query(
            `UPDATE todos 
             SET title = $1, description = $2, priority = $3, is_completed = $4, 
                 due_date = $5, reminder_time = $6, tags = $7, category_id = $8,
                 updated_at = NOW() 
             WHERE id = $9 AND user_id = $10 
             RETURNING *`,
            [title, description, priority, is_completed, due_date, reminder_time, tags, category_id, req.params.id, req.user.id]
        );
        if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Không tìm thấy hoặc không có quyền' });
        res.json({ success: true, data: result.rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 5. PATCH (Toggle Complete)
/**
 * @swagger
 * /api/todos/{id}/toggle:
 *   patch:
 *     summary: Đổi trạng thái hoàn thành
 *     tags: [Todos]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *   delete:
 *     summary: Xóa công việc (Soft delete)
 *     tags: [Todos]
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
router.delete('/:id', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(
            'UPDATE todos SET is_deleted = true, deleted_at = NOW() WHERE id = $1 AND user_id = $2 RETURNING id',
            [req.params.id, req.user.id]
        );
        if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Lỗi khi xóa' });
        res.json({ success: true, message: 'Đã xóa thành công' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;