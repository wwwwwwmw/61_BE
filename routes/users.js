const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { pool } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

// Ensure upload directory exists
const uploadDir = path.join(__dirname, '..', 'uploads', 'avatars');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.png';
    cb(null, `user_${req.user.id}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  if (/image\/(png|jpe?g|webp)/.test(file.mimetype)) cb(null, true); else cb(new Error('Chỉ hỗ trợ định dạng PNG/JPG/WebP')); 
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 2 * 1024 * 1024 } }); // 2MB

// GET current user profile
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, email, full_name, avatar_url FROM users WHERE id = $1', [req.user.id]);
    if (!result.rows.length) return res.status(404).json({ success: false, message: 'User không tồn tại' });
    const u = result.rows[0];
    res.json({ success: true, data: { id: u.id, email: u.email, name: u.full_name, avatarUrl: u.avatar_url || null } });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// PATCH avatar upload (multipart/form-data: field name 'avatar')
router.patch('/me/avatar', authenticateToken, upload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'Chưa chọn file' });
    const relativePath = `/uploads/avatars/${req.file.filename}`;
    await pool.query('UPDATE users SET avatar_url = $1, updated_at = NOW() WHERE id = $2', [relativePath, req.user.id]);
    const result = await pool.query('SELECT id, email, full_name, avatar_url FROM users WHERE id = $1', [req.user.id]);
    const u = result.rows[0];
    res.json({ success: true, message: 'Cập nhật avatar thành công', data: { id: u.id, email: u.email, name: u.full_name, avatarUrl: u.avatar_url } });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message || 'Lỗi server' });
  }
});

module.exports = router;
