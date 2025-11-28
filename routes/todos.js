const express = require('express');
const { body, validationResult } = require('express-validator');
const { query, getClient } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Validation rules
const todoValidation = [
    body('title').trim().notEmpty().withMessage('Tiêu đề không được để trống'),
    body('priority').optional().isIn(['low', 'medium', 'high']).withMessage('Độ ưu tiên không hợp lệ')
];

// @route   GET /api/todos
// @desc    Get all todos for user
// @access  Private
router.get('/', async (req, res) => {
    try {
        const userId = req.user.id;
        const {
            completed,
            category_id,
            priority,
            includeDeleted = false
        } = req.query;

        let queryText = `
      SELECT t.*, c.name as category_name, c.color as category_color
      FROM todos t
      LEFT JOIN categories c ON t.category_id = c.id
      WHERE t.user_id = $1
    `;
        const params = [userId];
        let paramIndex = 2;

        // Filter by deleted status
        if (includeDeleted !== 'true') {
            queryText += ` AND t.is_deleted = false`;
        }

        // Filter by completion status
        if (completed !== undefined) {
            queryText += ` AND t.is_completed = $${paramIndex}`;
            params.push(completed === 'true');
            paramIndex++;
        }

        // Filter by category
        if (category_id) {
            queryText += ` AND t.category_id = $${paramIndex}`;
            params.push(category_id);
            paramIndex++;
        }

        // Filter by priority
        if (priority) {
            queryText += ` AND t.priority = $${paramIndex}`;
            params.push(priority);
            paramIndex++;
        }

        queryText += ' ORDER BY t.position ASC, t.created_at DESC';

        const result = await query(queryText, params);

        res.json({
            success: true,
            data: result.rows
        });
    } catch (error) {
        console.error('Get todos error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy danh sách công việc',
            error: error.message
        });
    }
});

// @route   GET /api/todos/:id
// @desc    Get single todo
// @access  Private
router.get('/:id', async (req, res) => {
    try {
        const userId = req.user.id;
        const todoId = req.params.id;

        const result = await query(
            `SELECT t.*, c.name as category_name, c.color as category_color
       FROM todos t
       LEFT JOIN categories c ON t.category_id = c.id
       WHERE t.id = $1 AND t.user_id = $2`,
            [todoId, userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy công việc'
            });
        }

        res.json({
            success: true,
            data: result.rows[0]
        });
    } catch (error) {
        console.error('Get todo error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy thông tin công việc',
            error: error.message
        });
    }
});

// @route   POST /api/todos
// @desc    Create new todo
// @access  Private
router.post('/', todoValidation, async (req, res) => {
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
            category_id,
            priority = 'medium',
            tags = [],
            due_date,
            reminder_time,
            client_id
        } = req.body;

        const result = await query(
            `INSERT INTO todos (
        user_id, title, description, category_id, priority, 
        tags, due_date, reminder_time, client_id, last_synced_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)
      RETURNING *`,
            [userId, title, description, category_id, priority, tags, due_date, reminder_time, client_id]
        );

        res.status(201).json({
            success: true,
            message: 'Tạo công việc thành công',
            data: result.rows[0]
        });
    } catch (error) {
        console.error('Create todo error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi tạo công việc',
            error: error.message
        });
    }
});

// @route   PUT /api/todos/:id
// @desc    Update todo
// @access  Private
router.put('/:id', todoValidation, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const userId = req.user.id;
        const todoId = req.params.id;
        const {
            title,
            description,
            category_id,
            priority,
            tags,
            due_date,
            reminder_time,
            is_completed
        } = req.body;

        const result = await query(
            `UPDATE todos 
       SET title = $1, description = $2, category_id = $3, 
           priority = $4, tags = $5, due_date = $6, 
           reminder_time = $7, is_completed = $8,
           completed_at = CASE WHEN $8 = true THEN CURRENT_TIMESTAMP ELSE NULL END,
           version = version + 1, last_synced_at = CURRENT_TIMESTAMP
       WHERE id = $9 AND user_id = $10 AND is_deleted = false
       RETURNING *`,
            [title, description, category_id, priority, tags, due_date, reminder_time,
                is_completed, todoId, userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy công việc'
            });
        }

        res.json({
            success: true,
            message: 'Cập nhật công việc thành công',
            data: result.rows[0]
        });
    } catch (error) {
        console.error('Update todo error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi cập nhật công việc',
            error: error.message
        });
    }
});

// @route   PATCH /api/todos/:id/toggle
// @desc    Toggle todo completion status
// @access  Private
router.patch('/:id/toggle', async (req, res) => {
    try {
        const userId = req.user.id;
        const todoId = req.params.id;

        const result = await query(
            `UPDATE todos 
       SET is_completed = NOT is_completed,
           completed_at = CASE WHEN is_completed = false THEN CURRENT_TIMESTAMP ELSE NULL END,
           version = version + 1, last_synced_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND user_id = $2 AND is_deleted = false
       RETURNING *`,
            [todoId, userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy công việc'
            });
        }

        res.json({
            success: true,
            message: 'Cập nhật trạng thái thành công',
            data: result.rows[0]
        });
    } catch (error) {
        console.error('Toggle todo error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi cập nhật trạng thái',
            error: error.message
        });
    }
});

// @route   DELETE /api/todos/:id
// @desc    Soft delete todo
// @access  Private
router.delete('/:id', async (req, res) => {
    try {
        const userId = req.user.id;
        const todoId = req.params.id;
        const { permanent = false } = req.query;

        let result;

        if (permanent === 'true') {
            // Permanent delete
            result = await query(
                'DELETE FROM todos WHERE id = $1 AND user_id = $2 RETURNING id',
                [todoId, userId]
            );
        } else {
            // Soft delete
            result = await query(
                `UPDATE todos 
         SET is_deleted = true, deleted_at = CURRENT_TIMESTAMP,
             version = version + 1, last_synced_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND user_id = $2
         RETURNING id`,
                [todoId, userId]
            );
        }

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy công việc'
            });
        }

        res.json({
            success: true,
            message: 'Xóa công việc thành công'
        });
    } catch (error) {
        console.error('Delete todo error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi xóa công việc',
            error: error.message
        });
    }
});

// @route   POST /api/todos/sync
// @desc    Sync todos from client
// @access  Private
router.post('/sync', async (req, res) => {
    const client = await getClient();

    try {
        await client.query('BEGIN');

        const userId = req.user.id;
        const { todos, lastSyncTime } = req.body;

        // Get server changes since last sync
        const serverChanges = await client.query(
            `SELECT * FROM todos 
       WHERE user_id = $1 AND last_synced_at > $2
       ORDER BY last_synced_at ASC`,
            [userId, lastSyncTime || '1970-01-01']
        );

        // Process client changes
        const conflicts = [];
        const syncedTodos = [];

        for (const todo of todos) {
            if (todo.id) {
                // Update existing
                const existing = await client.query(
                    'SELECT version FROM todos WHERE id = $1 AND user_id = $2',
                    [todo.id, userId]
                );

                if (existing.rows.length > 0) {
                    if (existing.rows[0].version > todo.version) {
                        // Conflict: server version is newer
                        conflicts.push({
                            clientTodo: todo,
                            serverTodo: existing.rows[0]
                        });
                    } else {
                        // Client version is newer or same, update
                        const result = await client.query(
                            `UPDATE todos 
               SET title = $1, description = $2, is_completed = $3,
                   category_id = $4, priority = $5, tags = $6,
                   due_date = $7, reminder_time = $8,
                   version = $9, last_synced_at = CURRENT_TIMESTAMP
               WHERE id = $10 AND user_id = $11
               RETURNING *`,
                            [todo.title, todo.description, todo.is_completed,
                            todo.category_id, todo.priority, todo.tags,
                            todo.due_date, todo.reminder_time, todo.version + 1,
                            todo.id, userId]
                        );
                        syncedTodos.push(result.rows[0]);
                    }
                }
            } else {
                // Insert new
                const result = await client.query(
                    `INSERT INTO todos (
            user_id, title, description, is_completed, category_id,
            priority, tags, due_date, reminder_time, client_id,
            last_synced_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP)
          RETURNING *`,
                    [userId, todo.title, todo.description, todo.is_completed,
                        todo.category_id, todo.priority, todo.tags, todo.due_date,
                        todo.reminder_time, todo.client_id]
                );
                syncedTodos.push(result.rows[0]);
            }
        }

        await client.query('COMMIT');

        res.json({
            success: true,
            data: {
                serverChanges: serverChanges.rows,
                syncedTodos,
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
