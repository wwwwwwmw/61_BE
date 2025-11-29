const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');
const { sendOTPEmail } = require('../services/emailService');

// Tạo mã OTP ngẫu nhiên
const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Đăng ký tài khoản mới
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password, full_name]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string, minLength: 6 }
 *               full_name: { type: string }
 *     responses:
 *       200:
 *         description: Đăng ký thành công, OTP đã được gửi
 */
// 1. REGISTER: Lưu user (chưa active) và gửi OTP
router.post('/register', async (req, res) => {
    const { email, password, full_name, fullName } = req.body;
    const name = full_name || fullName; // Support both snake_case and camelCase

    if (!name) {
        return res.status(400).json({ success: false, message: 'Vui lòng nhập họ tên' });
    }

    try {
        // Kiểm tra user tồn tại
        const userCheck = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (userCheck.rows.length > 0) {
            return res.status(400).json({ success: false, message: 'Email đã tồn tại' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const otp = generateOTP();
        const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // Hết hạn sau 10 phút

        // Insert user với is_active = false
        await pool.query(
            'INSERT INTO users (email, password_hash, full_name, otp_code, otp_expires_at, is_active) VALUES ($1, $2, $3, $4, $5, false)',
            [email, hashedPassword, name, otp, otpExpires]
        );

        console.log(`[REGISTER] Generated OTP for ${email}: ${otp}`);

        // Gửi email qua SendGrid
        await sendOTPEmail(email, otp, 'registration');

        res.json({ success: true, message: 'Đăng ký thành công, vui lòng kiểm tra email để lấy OTP', requireOtp: true, email });

    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Lỗi server' });
    }
});

/**
 * @swagger
 * /api/auth/verify-otp:
 *   post:
 *     summary: Xác thực OTP để kích hoạt tài khoản
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, otp]
 *             properties:
 *               email: { type: string }
 *               otp: { type: string, minLength: 6, maxLength: 6 }
 *     responses:
 *       200:
 *         description: Xác thực thành công
 */
// 2. VERIFY OTP: Kích hoạt tài khoản
router.post('/verify-otp', async (req, res) => {
    const { email, otp } = req.body;
    try {
        const userRes = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (userRes.rows.length === 0) return res.status(400).json({ success: false, message: 'User không tồn tại' });

        const user = userRes.rows[0];

        // Kiểm tra OTP
        if (user.otp_code !== otp) {
            return res.status(400).json({ success: false, message: 'Mã OTP không chính xác' });
        }
        if (new Date() > new Date(user.otp_expires_at)) {
            return res.status(400).json({ success: false, message: 'Mã OTP đã hết hạn' });
        }

        // Active user và xóa OTP
        await pool.query('UPDATE users SET is_active = true, otp_code = NULL, otp_expires_at = NULL WHERE id = $1', [user.id]);

        // Tạo tokens để đăng nhập luôn
        const accessToken = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });
        const refreshToken = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '30d' });

        res.json({
            success: true,
            data: {
                accessToken,
                refreshToken,
                user: {
                    id: user.id,
                    email: user.email,
                    name: user.full_name
                }
            }
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Lỗi server' });
    }
});

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Đăng nhập
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string }
 *               password: { type: string }
 *     responses:
 *       200:
 *         description: Đăng nhập thành công
 */
// 3. LOGIN: Đăng nhập thông thường
router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (result.rows.length === 0) return res.status(400).json({ success: false, message: 'Sai email hoặc mật khẩu' });

        const user = result.rows[0];

        if (!user.is_active) return res.status(400).json({ success: false, message: 'Tài khoản chưa kích hoạt. Vui lòng xác thực OTP.' });

        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) return res.status(400).json({ success: false, message: 'Sai email hoặc mật khẩu' });

        // Generate both access and refresh tokens
        const accessToken = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });
        const refreshToken = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '30d' });

        res.json({
            success: true,
            data: {
                accessToken,
                refreshToken,
                user: {
                    id: user.id,
                    email: user.email,
                    name: user.full_name
                }
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Lỗi server' });
    }
});

// 4. SEND OTP (Resend or Forgot Password)
router.post('/send-otp', async (req, res) => {
    const { email, type } = req.body;
    try {
        const userRes = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (userRes.rows.length === 0) return res.status(400).json({ success: false, message: 'User không tồn tại' });

        const otp = generateOTP();
        const otpExpires = new Date(Date.now() + 10 * 60 * 1000);

        await pool.query('UPDATE users SET otp_code = $1, otp_expires_at = $2 WHERE email = $3', [otp, otpExpires, email]);

        console.log(`[RESEND] Generated OTP for ${email}: ${otp}`);

        await sendOTPEmail(email, otp, type || 'registration');

        res.json({ success: true, message: 'Đã gửi lại mã OTP' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Lỗi server' });
    }
});

module.exports = router;