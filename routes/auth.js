const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { query, getClient } = require('../config/database');
const {
    generateAccessToken,
    generateRefreshToken,
    verifyRefreshToken
} = require('../middleware/auth');
const {
    generateOTP,
    storeOTP,
    verifyOTP,
    sendOTPEmail
} = require('../services/emailService');

const router = express.Router();

// Validation middleware
const registerValidation = [
    body('email').isEmail().normalizeEmail().withMessage('Email không hợp lệ'),
    body('password').isLength({ min: 6 }).withMessage('Mật khẩu phải có ít nhất 6 ký tự'),
    body('fullName').trim().notEmpty().withMessage('Họ tên không được để trống')
];

const loginValidation = [
    body('email').isEmail().normalizeEmail().withMessage('Email không hợp lệ'),
    body('password').notEmpty().withMessage('Mật khẩu không được để trống')
];

// @route   POST /api/auth/send-otp
// @desc    Send OTP to email
// @access  Public
router.post('/send-otp', [
    body('email').isEmail().normalizeEmail().withMessage('Email không hợp lệ'),
    body('type').isIn(['registration', 'forgot_password']).withMessage('Loại OTP không hợp lệ')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const { email, type } = req.body;

        // For registration, check if email already exists
        if (type === 'registration') {
            const existingUser = await query(
                'SELECT id FROM users WHERE email = $1',
                [email]
            );

            if (existingUser.rows.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Email đã được sử dụng'
                });
            }
        }

        // For forgot password, check if email exists
        if (type === 'forgot_password') {
            const user = await query(
                'SELECT id FROM users WHERE email = $1',
                [email]
            );

            if (user.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Email không tồn tại trong hệ thống'
                });
            }
        }

        // Generate and store OTP
        const otp = generateOTP();
        storeOTP(email, otp);

        // Send OTP email
        const emailResult = await sendOTPEmail(email, otp, type);

        if (!emailResult.success) {
            return res.status(500).json(emailResult);
        }

        res.json({
            success: true,
            message: 'Mã OTP đã được gửi đến email của bạn',
            expiresIn: 300 // 5 minutes in seconds
        });
    } catch (error) {
        console.error('Send OTP error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi server',
            error: error.message
        });
    }
});

// @route   POST /api/auth/verify-otp
// @desc    Verify OTP
// @access  Public
router.post('/verify-otp', [
    body('email').isEmail().normalizeEmail().withMessage('Email không hợp lệ'),
    body('otp').isLength({ min: 6, max: 6 }).withMessage('OTP phải có 6 chữ số')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const { email, otp } = req.body;

        const result = verifyOTP(email, otp);

        if (!result.success) {
            return res.status(400).json(result);
        }

        res.json({
            success: true,
            message: 'Xác thực OTP thành công',
            verified: true
        });
    } catch (error) {
        console.error('Verify OTP error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi server',
            error: error.message
        });
    }
});

// @route   POST /api/auth/register
// @desc    Register new user with OTP verification
// @access  Public
router.post('/register', registerValidation, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const { email, password, fullName, otp } = req.body;

        // Verify OTP
        const otpResult = verifyOTP(email, otp);
        if (!otpResult.success) {
            return res.status(400).json({
                success: false,
                message: 'Vui lòng xác thực OTP trước khi đăng ký'
            });
        }

        // Check if user already exists
        const existingUser = await query(
            'SELECT id FROM users WHERE email = $1',
            [email]
        );

        if (existingUser.rows.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Email đã được sử dụng'
            });
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        // Create user
        const result = await query(
            `INSERT INTO users (email, password_hash, full_name) 
       VALUES ($1, $2, $3) 
       RETURNING id, email, full_name, created_at`,
            [email, passwordHash, fullName]
        );

        const user = result.rows[0];

        // Create default categories for the new user
        await query(
            `INSERT INTO categories (user_id, name, color, icon, type) VALUES
       ($1, 'Công việc', '#3498db', 'work', 'todo'),
       ($1, 'Cá nhân', '#2ecc71', 'person', 'todo'),
       ($1, 'Ăn uống', '#e74c3c', 'restaurant', 'expense'),
       ($1, 'Đi lại', '#f39c12', 'directions_car', 'expense'),
       ($1, 'Giải trí', '#9b59b6', 'movie', 'expense'),
       ($1, 'Mua sắm', '#1abc9c', 'shopping_cart', 'expense')`,
            [user.id]
        );

        // Generate tokens
        const accessToken = generateAccessToken(user);
        const refreshToken = generateRefreshToken(user);

        res.status(201).json({
            success: true,
            message: 'Đăng ký thành công',
            data: {
                user: {
                    id: user.id,
                    email: user.email,
                    fullName: user.full_name,
                    createdAt: user.created_at
                },
                accessToken,
                refreshToken
            }
        });
    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi server',
            error: error.message
        });
    }
});

// @route   POST /api/auth/forgot-password
// @desc    Reset password with OTP
// @access  Public
router.post('/forgot-password', [
    body('email').isEmail().normalizeEmail().withMessage('Email không hợp lệ'),
    body('otp').isLength({ min: 6, max: 6 }).withMessage('OTP phải có 6 chữ số'),
    body('newPassword').isLength({ min: 6 }).withMessage('Mật khẩu mới phải có ít nhất 6 ký tự')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const { email, otp, newPassword } = req.body;

        // Verify OTP
        const otpResult = verifyOTP(email, otp);
        if (!otpResult.success) {
            return res.status(400).json({
                success: false,
                message: 'OTP không chính xác hoặc đã hết hạn'
            });
        }

        // Check if user exists
        const userResult = await query(
            'SELECT id FROM users WHERE email = $1',
            [email]
        );

        if (userResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Email không tồn tại'
            });
        }

        // Hash new password
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(newPassword, salt);

        // Update password
        await query(
            'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE email = $2',
            [passwordHash, email]
        );

        res.json({
            success: true,
            message: 'Đặt lại mật khẩu thành công'
        });
    } catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi server',
            error: error.message
        });
    }
});

// @route   POST /api/auth/login
// @desc    Login user
// @access  Public
router.post('/login', loginValidation, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const { email, password } = req.body;

        // Find user
        const result = await query(
            'SELECT id, email, password_hash, full_name, is_active FROM users WHERE email = $1',
            [email]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'Email hoặc mật khẩu không đúng'
            });
        }

        const user = result.rows[0];

        // Check if user is active
        if (!user.is_active) {
            return res.status(403).json({
                success: false,
                message: 'Tài khoản đã bị vô hiệu hóa'
            });
        }

        // Verify password
        const isPasswordValid = await bcrypt.compare(password, user.password_hash);

        if (!isPasswordValid) {
            return res.status(401).json({
                success: false,
                message: 'Email hoặc mật khẩu không đúng'
            });
        }

        // Update last login
        await query(
            'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
            [user.id]
        );

        // Generate tokens
        const accessToken = generateAccessToken(user);
        const refreshToken = generateRefreshToken(user);

        res.json({
            success: true,
            message: 'Đăng nhập thành công',
            data: {
                user: {
                    id: user.id,
                    email: user.email,
                    fullName: user.full_name
                },
                accessToken,
                refreshToken
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi server',
            error: error.message
        });
    }
});

// @route   POST /api/auth/refresh
// @desc    Refresh access token
// @access  Public
router.post('/refresh', async (req, res) => {
    try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            return res.status(401).json({
                success: false,
                message: 'Refresh token required'
            });
        }

        const decoded = verifyRefreshToken(refreshToken);

        if (!decoded) {
            return res.status(403).json({
                success: false,
                message: 'Invalid or expired refresh token'
            });
        }

        // Generate new access token
        const accessToken = generateAccessToken({
            id: decoded.id,
            email: decoded.email
        });

        res.json({
            success: true,
            data: {
                accessToken
            }
        });
    } catch (error) {
        console.error('Refresh token error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi server',
            error: error.message
        });
    }
});

module.exports = router;
