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

        // Filter upcoming events only
        if (upcoming === 'true') {
            queryText += ` AND event_date > CURRENT_TIMESTAMP`;
        }

        queryText += ' ORDER BY event_date ASC';

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
// @desc    Get single event with countdown
// @access  Private
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
        END as seconds_remaining,
        CASE 
          WHEN event_date > CURRENT_TIMESTAMP THEN true
          ELSE false
        END as is_upcoming
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
            event_type = 'other',
            color = '#e74c3c',
            icon = 'event',
            is_recurring = false,
            recurrence_pattern,
            notification_enabled = true,
            notification_times = [1440, 60, 0], // 1 day, 1 hour, at time
            client_id
        } = req.body;

        const result = await query(
            `INSERT INTO events (
        user_id, title, description, event_date, event_type,
        color, icon, is_recurring, recurrence_pattern,
        notification_enabled, notification_times, client_id, last_synced_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP)
      RETURNING *`,
            [userId, title, description, event_date, event_type, color, icon,
                is_recurring, recurrence_pattern, notification_enabled, notification_times, client_id]
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
            icon,
            is_recurring,
            recurrence_pattern,
            notification_enabled,
            notification_times
        } = req.body;

        const result = await query(
            `UPDATE events 
       SET title = $1, description = $2, event_date = $3, event_type = $4,
           color = $5, icon = $6, is_recurring = $7, recurrence_pattern = $8,
           notification_enabled = $9, notification_times = $10,
           version = version + 1, last_synced_at = CURRENT_TIMESTAMP
       WHERE id = $11 AND user_id = $12 AND is_deleted = false
       RETURNING *`,
            [title, description, event_date, event_type, color, icon, is_recurring,
                recurrence_pattern, notification_enabled, notification_times, eventId, userId]
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
router.delete('/:id', async (req, res) => {
    try {
        const userId = req.user.id;
        const eventId = req.params.id;
        const { permanent = false } = req.query;

        let result;

        if (permanent === 'true') {
            result = await query(
                'DELETE FROM events WHERE id = $1 AND user_id = $2 RETURNING id',
                [eventId, userId]
            );
        } else {
            result = await query(
                `UPDATE events 
         SET is_deleted = true, deleted_at = CURRENT_TIMESTAMP,
             version = version + 1, last_synced_at = CURRENT_TIMESTAMP
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
router.post('/sync', async (req, res) => {
    const client = await getClient();

    try {
        await client.query('BEGIN');

        const userId = req.user.id;
        const { events, lastSyncTime } = req.body;

        // Get server changes since last sync
        const serverChanges = await client.query(
            `SELECT * FROM events 
       WHERE user_id = $1 AND last_synced_at > $2
       ORDER BY last_synced_at ASC`,
            [userId, lastSyncTime || '1970-01-01']
        );

        const syncedEvents = [];

        for (const event of events) {
            if (event.id) {
                // Update existing
                const result = await client.query(
                    `UPDATE events 
           SET title = $1, description = $2, event_date = $3, event_type = $4,
               color = $5, icon = $6, is_recurring = $7, recurrence_pattern = $8,
               notification_enabled = $9, notification_times = $10,
               version = version + 1, last_synced_at = CURRENT_TIMESTAMP
           WHERE id = $11 AND user_id = $12
           RETURNING *`,
                    [event.title, event.description, event.event_date, event.event_type,
                    event.color, event.icon, event.is_recurring, event.recurrence_pattern,
                    event.notification_enabled, event.notification_times, event.id, userId]
                );
                if (result.rows.length > 0) {
                    syncedEvents.push(result.rows[0]);
                }
            } else {
                // Insert new
                const result = await client.query(
                    `INSERT INTO events (
            user_id, title, description, event_date, event_type,
            color, icon, is_recurring, recurrence_pattern,
            notification_enabled, notification_times, client_id, last_synced_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP)
          RETURNING *`,
                    [userId, event.title, event.description, event.event_date, event.event_type,
                        event.color, event.icon, event.is_recurring, event.recurrence_pattern,
                        event.notification_enabled, event.notification_times, event.client_id]
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
