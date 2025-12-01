const express = require('express');
const { body, validationResult } = require('express-validator');
const { query, pool } = require('../config/database'); // [FIX] Import pool
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

router.use(authenticateToken);

const eventValidation = [
    body('title').trim().notEmpty().withMessage('Tiêu đề không được để trống'),
    body('event_date').isISO8601().withMessage('Ngày sự kiện không hợp lệ'),
    body('recurrence_pattern')
        .optional()
        .isIn(['daily', 'weekly', 'monthly', 'yearly'])
        .withMessage('Kiểu lặp lại không hợp lệ')
];

// @route   GET /api/events
router.get('/', async (req, res) => {
    try {
        const userId = req.user.id;
        const { event_type, upcoming, includeDeleted } = req.query;

        // Luôn so sánh theo giờ Việt Nam (Asia/Ho_Chi_Minh)
        const nowTz = "NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh'";
        let queryText = `
            SELECT 
                id, user_id, title, description,
                -- Chuẩn hóa event_date về giờ VN để trả ra client
                (event_date AT TIME ZONE 'Asia/Ho_Chi_Minh') AS event_date,
                event_type, color, is_recurring, recurrence_pattern, notification_enabled,
                created_at, updated_at, deleted_at, is_deleted,
                CASE 
                    WHEN event_date > ${nowTz} THEN
                        EXTRACT(EPOCH FROM (event_date - ${nowTz}))
                    ELSE 0
                END as seconds_remaining
            FROM events
            WHERE user_id = $1
        `;
        const params = [userId];
        let idx = 2;

        if (includeDeleted !== 'true') {
            queryText += ` AND is_deleted = false`;
        }
        if (event_type) {
            queryText += ` AND event_type = $${idx++}`;
            params.push(event_type);
        }
        if (upcoming === 'true') {
            queryText += ` AND event_date > ${nowTz}`;
        }

        queryText += ` ORDER BY event_date ASC`;

        const result = await query(queryText, params);
        res.json({ success: true, data: result.rows });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// @route   GET /api/events/:id
router.get('/:id', async (req, res) => {
    try {
        const result = await query(
            `SELECT 
                id, user_id, title, description,
                (event_date AT TIME ZONE 'Asia/Ho_Chi_Minh') AS event_date,
                event_type, color, is_recurring, recurrence_pattern, notification_enabled,
                created_at, updated_at, deleted_at, is_deleted
             FROM events WHERE id = $1 AND user_id = $2`,
            [req.params.id, req.user.id]
        );
        if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Not found' });
        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// @route   POST /api/events
router.post('/', eventValidation, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

        const userId = req.user.id;
        const { title, description, event_date, event_type, color, is_recurring, notification_enabled, recurrence_pattern } = req.body;

        // Lưu event_date như giờ địa phương VN: bỏ timezone để tránh lệch
        let result = await query(
            `INSERT INTO events (user_id, title, description, event_date, event_type, color, is_recurring, recurrence_pattern, notification_enabled)
             VALUES ($1, $2, $3, CAST($4 AS timestamp), $5, $6, $7, $8, $9) RETURNING *`,
            [
                userId,
                title,
                description,
                event_date,
                event_type,
                color || '#3498db',
                !!is_recurring,
                recurrence_pattern || null,
                notification_enabled ?? true
            ]
        );
        // Chuẩn hóa event_date sang giờ VN trong phản hồi
        const row = result.rows[0];
        const normalized = await query(
            `SELECT (event_date AT TIME ZONE 'Asia/Ho_Chi_Minh') AS event_date FROM events WHERE id = $1`,
            [row.id]
        );
        row.event_date = normalized.rows[0].event_date;
        res.status(201).json({ success: true, data: row });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// @route   PUT /api/events/:id
router.put('/:id', async (req, res) => {
    try {
        const { title, description, event_date, event_type, color, is_recurring, recurrence_pattern, notification_enabled } = req.body;
        let result = await query(
            `UPDATE events 
             SET title = $1, description = $2, event_date = CAST($3 AS timestamp), event_type = $4, 
                 color = $5, is_recurring = $6, recurrence_pattern = $7, notification_enabled = $8, updated_at = NOW()
             WHERE id = $9 AND user_id = $10 RETURNING *`,
            [
                title,
                description,
                event_date,
                event_type,
                color,
                !!is_recurring,
                recurrence_pattern || null,
                notification_enabled ?? true,
                req.params.id,
                req.user.id
            ]
        );
        if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Not found' });
        const row = result.rows[0];
        const normalized = await query(
            `SELECT (event_date AT TIME ZONE 'Asia/Ho_Chi_Minh') AS event_date FROM events WHERE id = $1`,
            [row.id]
        );
        row.event_date = normalized.rows[0].event_date;
        res.json({ success: true, data: row });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// @route   DELETE /api/events/:id
router.delete('/:id', async (req, res) => {
    try {
        const result = await query(
            'UPDATE events SET is_deleted = true, deleted_at = NOW() WHERE id = $1 AND user_id = $2 RETURNING id',
            [req.params.id, req.user.id]
        );
        if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Not found' });
        res.json({ success: true, message: 'Deleted' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// @route   POST /api/events/sync
// @desc    Đồng bộ sự kiện
router.post('/sync', async (req, res) => {
    // [FIX] Sửa dòng này: dùng pool.connect() thay vì getClient()
    const client = await pool.connect();

    try {
        await client.query('BEGIN');
        const userId = req.user.id;
        const { lastSyncTime } = req.body;

        // 1. Lấy dữ liệu mới từ Server
        const serverChanges = await client.query(
            `SELECT * FROM events WHERE user_id = $1 AND updated_at > $2`,
            [userId, lastSyncTime || '1970-01-01']
        );

        await client.query('COMMIT');

        res.json({
            success: true,
            data: {
                serverChanges: serverChanges.rows,
                syncTime: new Date().toISOString()
            }
        });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Sync Events Error:', error);
        res.status(500).json({ success: false, message: error.message });
    } finally {
        client.release();
    }
});

module.exports = router;