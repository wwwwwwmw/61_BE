const express = require('express');
const router = express.Router();
const { query, pool } = require('../config/database'); // Import cả pool để dùng cho transaction sync
const { authenticateToken } = require('../middleware/auth');

router.use(authenticateToken);

// 1. GET ALL (Hỗ trợ lọc theo Tag)
router.get('/', async (req, res) => {
    try {
        const userId = req.user.id;
        const { tag, completed } = req.query;

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
    const { title, description, priority, due_date, reminder_time, tags, category_id, client_id } = req.body;
    try {
        // Idempotency by client_id
        if (client_id) {
            const exists = await query('SELECT * FROM todos WHERE user_id = $1 AND client_id = $2', [req.user.id, client_id]);
            if (exists.rows.length) {
                return res.json({ success: true, data: exists.rows[0] });
            }
        }

        const result = await query(
            `INSERT INTO todos (user_id, title, description, priority, due_date, reminder_time, tags, category_id, client_id) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
            [req.user.id, title, description, priority, due_date, reminder_time, tags || [], category_id, client_id || null]
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
        // Dynamic update query
        // Cập nhật các trường nếu chúng có tồn tại trong body, nếu không giữ nguyên giá trị cũ (COALESCE)
        const result = await query(
            `UPDATE todos SET 
                title = COALESCE($1, title),
                description = COALESCE($2, description),
                priority = COALESCE($3, priority),
                is_completed = COALESCE($4, is_completed),
                due_date = COALESCE($5, due_date),
                reminder_time = COALESCE($6, reminder_time),
                tags = COALESCE($7, tags),
                category_id = COALESCE($8, category_id),
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

// 6. SYNC ROUTE (Đồng bộ dữ liệu)
router.post('/sync', async (req, res) => {
    // Sử dụng pool.connect() để tạo transaction an toàn
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const userId = req.user.id;
        const { lastSyncTime } = req.body;

        // Lấy dữ liệu thay đổi từ Server (để trả về cho Client)
        const serverChangesRes = await client.query(
            `SELECT * FROM todos WHERE user_id = $1 AND updated_at > $2`,
            [userId, lastSyncTime || '1970-01-01']
        );

        await client.query('COMMIT');

        res.json({
            success: true,
            data: {
                serverChanges: serverChangesRes.rows,
                syncTime: new Date().toISOString()
            }
        });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Sync Todos Error:', error);
        res.status(500).json({ success: false, message: error.message });
    } finally {
        client.release();
    }
});

module.exports = router;