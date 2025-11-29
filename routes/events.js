const express = require('express');
const { body, validationResult } = require('express-validator');
const { query, getClient } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Validation rules
const eventValidation = [
    body('title').trim().notEmpty().withMessage('Tiêu đề không được để trống'),
    body('event_date').isISO8601().withMessage('Ngày sự kiện không hợp lệ')
];

// @route   GET /api/events
// @desc    Get all events for user
// @access  Private
/**
 * @swagger
 * /api/events:
 *   get:
 *     summary: Lấy danh sách sự kiện
 *     tags: [Events]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: event_type
 *         schema: { type: string }
 *       - in: query
 *         name: upcoming
 *         schema: { type: boolean }
 *     responses:
 *       200:
 *         description: Danh sách sự kiện
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { type: array, items: { $ref: '#/components/schemas/Event' } }
 */
router.get('/', async (req, res) => {
    try {
        const userId = req.user.id;
        const {
            event_type,
            upcoming = false,
            includeDeleted = false
        } = req.query;

        let queryText = `
      SELECT *,
        CASE 
          WHEN event_date > CURRENT_TIMESTAMP THEN
            EXTRACT(EPOCH FROM (event_date - CURRENT_TIMESTAMP))
          ELSE 0
        END as seconds_remaining
      FROM events
      WHERE user_id = $1
    `;
        const params = [userId];
        let paramIndex = 2;

        // Filter by deleted status
        if (includeDeleted !== 'true') {
            queryText += ` AND is_deleted = false`;
        }

        // Filter by event type
        if (event_type) {
            queryText += ` AND event_type = $${paramIndex}`;
            params.push(event_type);
            paramIndex++;
        }

        // Filter upcoming events
        if (upcoming === 'true') {
            queryText += ` AND event_date > CURRENT_TIMESTAMP`;
        }

        queryText += ` ORDER BY event_date ASC`;

        const result = await query(queryText, params);

        res.json({
            success: true,
            data: result.rows
        });
    } catch (error) {
        console.error('Get events error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy danh sách sự kiện',
            error: error.message
        });
    }
});

// @route   GET /api/events/:id
// @desc    Get single event
// @access  Private
/**
 * @swagger
 * /api/events/{id}:
 *   get:
 *     summary: Lấy chi tiết sự kiện
 *     tags: [Events]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Chi tiết sự kiện
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { $ref: '#/components/schemas/Event' }
 *       404:
 *         description: Không tìm thấy
 */
router.get('/:id', async (req, res) => {
    try {
        const userId = req.user.id;
        const eventId = req.params.id;

        const result = await query(
            `SELECT *,
        CASE 
          WHEN event_date > CURRENT_TIMESTAMP THEN
            EXTRACT(EPOCH FROM (event_date - CURRENT_TIMESTAMP))
          ELSE 0
        END as seconds_remaining
       FROM events 
       WHERE id = $1 AND user_id = $2`,
            [eventId, userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy sự kiện'
            });
        }

        res.json({
            success: true,
            data: result.rows[0]
        });
    } catch (error) {
        console.error('Get event error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy thông tin sự kiện',
            error: error.message
        });
    }
});

// @route   POST /api/events
// @desc    Create new event
// @access  Private
/**
 * @swagger
 * /api/events:
 *   post:
 *     summary: Tạo sự kiện mới
 *     tags: [Events]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, event_date]
 *             properties:
 *               title: { type: string }
 *               description: { type: string }
 *               event_date: { type: string, format: date-time }
 *               event_type: { type: string }
 *               color: { type: string }
 *               is_recurring: { type: boolean }
 *               notification_enabled: { type: boolean }
 *     responses:
 *       201:
 *         description: Tạo thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { $ref: '#/components/schemas/Event' }
 */
router.post('/', eventValidation, async (req, res) => {
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
            title,
            description,
            event_date,
            event_type,
            color = '#3498db',
            is_recurring = false,
            notification_enabled = true
        } = req.body;

        const result = await query(
            `INSERT INTO events (
        user_id, title, description, event_date, event_type, 
        color, is_recurring, notification_enabled
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
            [userId, title, description, event_date, event_type,
                color, is_recurring, notification_enabled]
        );

        res.status(201).json({
            success: true,
            message: 'Tạo sự kiện thành công',
            data: result.rows[0]
        });
    } catch (error) {
        console.error('Create event error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi tạo sự kiện',
            error: error.message
        });
    }
});

// @route   PUT /api/events/:id
// @desc    Update event
// @access  Private
/**
 * @swagger
 * /api/events/{id}:
 *   put:
 *     summary: Cập nhật sự kiện
 *     tags: [Events]
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
 *               event_date: { type: string, format: date-time }
 *               event_type: { type: string }
 *               color: { type: string }
 *               is_recurring: { type: boolean }
 *               notification_enabled: { type: boolean }
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { $ref: '#/components/schemas/Event' }
 */
router.put('/:id', eventValidation, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const userId = req.user.id;
        const eventId = req.params.id;
        const {
            title,
            description,
            event_date,
            event_type,
            color,
            is_recurring,
            notification_enabled
        } = req.body;

        const result = await query(
            `UPDATE events 
       SET title = $1, description = $2, event_date = $3, 
           event_type = $4, color = $5, is_recurring = $6, 
           notification_enabled = $7, updated_at = CURRENT_TIMESTAMP
       WHERE id = $8 AND user_id = $9
       RETURNING *`,
            [title, description, event_date, event_type, color,
                is_recurring, notification_enabled, eventId, userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy sự kiện'
            });
        }

        res.json({
            success: true,
            message: 'Cập nhật sự kiện thành công',
            data: result.rows[0]
        });
    } catch (error) {
        console.error('Update event error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi cập nhật sự kiện',
            error: error.message
        });
    }
});

// @route   DELETE /api/events/:id
// @desc    Soft delete event
// @access  Private
/**
 * @swagger
 * /api/events/{id}:
 *   delete:
 *     summary: Xóa sự kiện (Soft delete)
 *     tags: [Events]
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
        const eventId = req.params.id;
        const { permanent = false } = req.query;

        let result;

        if (permanent === 'true') {
            // Permanent delete
            result = await query(
                'DELETE FROM events WHERE id = $1 AND user_id = $2 RETURNING id',
                [eventId, userId]
            );
        } else {
            // Soft delete
            result = await query(
                `UPDATE events 
         SET is_deleted = true, deleted_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND user_id = $2
         RETURNING id`,
                [eventId, userId]
            );
        }

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy sự kiện'
            });
        }

        res.json({
            success: true,
            message: 'Xóa sự kiện thành công'
        });
    } catch (error) {
        console.error('Delete event error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi xóa sự kiện',
            error: error.message
        });
    }
});

// @route   POST /api/events/sync
// @desc    Sync events from client
// @access  Private
/**
 * @swagger
 * /api/events/sync:
 *   post:
 *     summary: Đồng bộ sự kiện
 *     tags: [Events]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               lastSyncTime: { type: string, format: date-time }
 *               events: { type: array, items: { $ref: '#/components/schemas/Event' } }
 *     responses:
 *       200:
 *         description: Đồng bộ thành công
 */
router.post('/sync', async (req, res) => {
    const client = await getClient();

    try {
        await client.query('BEGIN');

        const userId = req.user.id;
        const { events, lastSyncTime } = req.body;

        // Get server changes since last sync
        const serverChanges = await client.query(
            `SELECT * FROM events 
       WHERE user_id = $1 AND updated_at > $2
       ORDER BY updated_at ASC`,
            [userId, lastSyncTime || '1970-01-01']
        );

        // Process client changes
        const conflicts = [];
        const syncedEvents = [];

        for (const event of events) {
            if (event.id) {
                // Update existing
                const existing = await client.query(
                    'SELECT updated_at FROM events WHERE id = $1 AND user_id = $2',
                    [event.id, userId]
                );

                if (existing.rows.length > 0) {
                    if (new Date(existing.rows[0].updated_at) > new Date(event.updated_at)) {
                        // Conflict: server version is newer
                        conflicts.push({
                            clientEvent: event,
                            serverEvent: existing.rows[0]
                        });
                    } else {
                        // Client version is newer or same, update
                        const result = await client.query(
                            `UPDATE events 
               SET title = $1, description = $2, event_date = $3, 
                   event_type = $4, color = $5, is_recurring = $6, 
                   notification_enabled = $7, updated_at = CURRENT_TIMESTAMP
               WHERE id = $8 AND user_id = $9
               RETURNING *`,
                            [event.title, event.description, event.event_date,
                            event.event_type, event.color, event.is_recurring,
                            event.notification_enabled, event.id, userId]
                        );
                        syncedEvents.push(result.rows[0]);
                    }
                }
            } else {
                // Insert new
                const result = await client.query(
                    `INSERT INTO events (
            user_id, title, description, event_date, event_type, 
            color, is_recurring, notification_enabled
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING *`,
                    [userId, event.title, event.description, event.event_date,
                        event.event_type, event.color, event.is_recurring,
                        event.notification_enabled]
                );
                syncedEvents.push(result.rows[0]);
            }
        }

        await client.query('COMMIT');

        res.json({
            success: true,
            data: {
                serverChanges: serverChanges.rows,
                syncedEvents,
                conflicts,
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
