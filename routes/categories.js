const express = require('express');
const { body, validationResult } = require('express-validator');
const { query } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// @route   GET /api/categories
// @desc    Get all categories for user
// @access  Private
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

        queryText += ' ORDER BY name ASC';

        const result = await query(queryText, params);

        res.json({
            success: true,
            data: result.rows
        });
    } catch (error) {
        console.error('Get categories error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy danh mục',
            error: error.message
        });
    }
});

// @route   POST /api/categories
// @desc    Create new category
// @access  Private
router.post('/', [
    body('name').trim().notEmpty().withMessage('Tên danh mục không được để trống'),
    body('type').isIn(['todo', 'expense', 'both']).withMessage('Loại danh mục không hợp lệ')
], async (req, res) => {
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
            icon = 'category',
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
        if (error.code === '23505') { // Unique violation
            return res.status(400).json({
                success: false,
                message: 'Danh mục đã tồn tại'
            });
        }

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
router.put('/:id', [
    body('name').trim().notEmpty().withMessage('Tên danh mục không được để trống')
], async (req, res) => {
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
        const { name, color, icon } = req.body;

        const result = await query(
            `UPDATE categories 
       SET name = $1, color = $2, icon = $3
       WHERE id = $4 AND user_id = $5
       RETURNING *`,
            [name, color, icon, categoryId, userId]
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
router.delete('/:id', async (req, res) => {
    try {
        const userId = req.user.id;
        const categoryId = req.params.id;

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
