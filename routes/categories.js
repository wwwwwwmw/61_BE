const express = require('express');
const { body, validationResult } = require('express-validator');
const { query } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Validation rules
const categoryValidation = [
    body('name').trim().notEmpty().withMessage('Tên danh mục không được để trống'),
    body('type').isIn(['todo', 'expense', 'both']).withMessage('Loại danh mục không hợp lệ')
];

// @route   GET /api/categories
// @desc    Get all categories for user
// @access  Private
/**
 * @swagger
 * /api/categories:
 *   get:
 *     summary: Lấy danh sách danh mục
 *     tags: [Categories]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: type
 *         schema: { type: string, enum: [todo, expense, both] }
 *     responses:
 *       200:
 *         description: Danh sách danh mục
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { type: array, items: { $ref: '#/components/schemas/Category' } }
 */
router.get('/', async (req, res) => {
    try {
        const userId = req.user.id;
        const { type } = req.query;

        let queryText = 'SELECT * FROM categories WHERE user_id = $1';
        const params = [userId];

        if (type) {
            queryText += ' AND (type = $2 OR type = \'both\')';
            params.push(type);
        }

        queryText += ' ORDER BY created_at DESC';

        const result = await query(queryText, params);

        res.json({
            success: true,
            data: result.rows
        });
    } catch (error) {
        console.error('Get categories error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy danh sách danh mục',
            error: error.message
        });
    }
});

// @route   POST /api/categories
// @desc    Create new category
// @access  Private
/**
 * @swagger
 * /api/categories:
 *   post:
 *     summary: Tạo danh mục mới
 *     tags: [Categories]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string }
 *               color: { type: string }
 *               icon: { type: string }
 *               type: { type: string, enum: [todo, expense, both] }
 *     responses:
 *       201:
 *         description: Tạo thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { $ref: '#/components/schemas/Category' }
 */
router.post('/', categoryValidation, async (req, res) => {
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
            name,
            color = '#3498db',
            icon = 'folder',
            type = 'both'
        } = req.body;

        const result = await query(
            `INSERT INTO categories (user_id, name, color, icon, type)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
            [userId, name, color, icon, type]
        );

        res.status(201).json({
            success: true,
            message: 'Tạo danh mục thành công',
            data: result.rows[0]
        });
    } catch (error) {
        console.error('Create category error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi tạo danh mục',
            error: error.message
        });
    }
});

// @route   PUT /api/categories/:id
// @desc    Update category
// @access  Private
/**
 * @swagger
 * /api/categories/{id}:
 *   put:
 *     summary: Cập nhật danh mục
 *     tags: [Categories]
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
 *               name: { type: string }
 *               color: { type: string }
 *               icon: { type: string }
 *               type: { type: string, enum: [todo, expense, both] }
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { $ref: '#/components/schemas/Category' }
 */
router.put('/:id', categoryValidation, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const userId = req.user.id;
        const categoryId = req.params.id;
        const { name, color, icon, type } = req.body;

        const result = await query(
            `UPDATE categories 
       SET name = $1, color = $2, icon = $3, type = $4
       WHERE id = $5 AND user_id = $6
       RETURNING *`,
            [name, color, icon, type, categoryId, userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy danh mục'
            });
        }

        res.json({
            success: true,
            message: 'Cập nhật danh mục thành công',
            data: result.rows[0]
        });
    } catch (error) {
        console.error('Update category error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi cập nhật danh mục',
            error: error.message
        });
    }
});

// @route   DELETE /api/categories/:id
// @desc    Delete category
// @access  Private
/**
 * @swagger
 * /api/categories/{id}:
 *   delete:
 *     summary: Xóa danh mục
 *     tags: [Categories]
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
        const categoryId = req.params.id;

        // Check if category is used
        const usedInTodos = await query(
            'SELECT id FROM todos WHERE category_id = $1 AND user_id = $2 LIMIT 1',
            [categoryId, userId]
        );

        const usedInExpenses = await query(
            'SELECT id FROM expenses WHERE category_id = $1 AND user_id = $2 LIMIT 1',
            [categoryId, userId]
        );

        if (usedInTodos.rows.length > 0 || usedInExpenses.rows.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Không thể xóa danh mục đang được sử dụng'
            });
        }

        const result = await query(
            'DELETE FROM categories WHERE id = $1 AND user_id = $2 RETURNING id',
            [categoryId, userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy danh mục'
            });
        }

        res.json({
            success: true,
            message: 'Xóa danh mục thành công'
        });
    } catch (error) {
        console.error('Delete category error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi xóa danh mục',
            error: error.message
        });
    }
});

module.exports = router;
