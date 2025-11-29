const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

router.use(authenticateToken);

// 1. GET ALL (Hỗ trợ lọc theo Tag)
/**
 * @swagger
 * /api/todos:
 * get:
 * parameters:
 * - in: query
 * name: tag
 * schema: { type: string }
 * description: Lọc theo tên tag
 */
router.get('/', async (req, res) => {
    try {
        const userId = req.user.id;
        const { tag, completed } = req.query; // tag='work'

        let sql = `SELECT * FROM todos WHERE user_id = $1 AND is_deleted = false`;
        const params = [userId];
        let idx = 2;

        // Logic lọc tag trong mảng PostgreSQL
        if (tag) {
            sql += ` AND $${idx++} = ANY(tags)`;
            params.push(tag);
        }

        if (completed !== undefined) {
            sql += ` AND is_completed = $${idx++}`;
            params.push(completed === 'true');
        }

        sql += ` ORDER BY created_at DESC`;

        const result = await query(sql, params);
        res.json({ success: true, data: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 2. GET SINGLE
router.get('/:id', async (req, res) => {
    try {
        const result = await query(
            'SELECT * FROM todos WHERE id = $1 AND user_id = $2',
            [req.params.id, req.user.id]
        );
        if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Not found' });
        res.json({ success: true, data: result.rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 3. POST (Create)
router.post('/', async (req, res) => {
    const { title, description, priority, due_date, reminder_time, tags, category_id } = req.body;
    try {
        // tags phải là mảng strings ["work", "urgent"]
        const result = await query(
            `INSERT INTO todos (user_id, title, description, priority, due_date, reminder_time, tags, category_id) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
            [req.user.id, title, description, priority, due_date, reminder_time, tags || [], category_id]
        );
        res.json({ success: true, data: result.rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 4. PUT (Update)
router.put('/:id', async (req, res) => {
    const { title, description, priority, is_completed, due_date, reminder_time, tags, category_id } = req.body;
    try {
        const result = await query(
            `UPDATE todos 
             SET title = $1, description = $2, priority = $3, is_completed = $4, 
                 due_date = $5, reminder_time = $6, tags = $7, category_id = $8,
                 updated_at = NOW() 
             WHERE id = $9 AND user_id = $10 
             RETURNING *`,
            [title, description, priority, is_completed, due_date, reminder_time, tags, category_id, req.params.id, req.user.id]
        );
        if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Not found' });
        res.json({ success: true, data: result.rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 5. DELETE (Soft delete)
router.delete('/:id', async (req, res) => {
    try {
        const result = await query(
            'UPDATE todos SET is_deleted = true, deleted_at = NOW() WHERE id = $1 AND user_id = $2 RETURNING id',
            [req.params.id, req.user.id]
        );
        if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Not found' });
        res.json({ success: true, message: 'Deleted successfully' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;