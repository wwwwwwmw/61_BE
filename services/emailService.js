const crypto = require('crypto');
const sgMail = require('@sendgrid/mail');

// Initialize SendGrid
if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

// In-memory OTP storage (use Redis in production)
const otpStore = new Map();

// NOTE: Previous nodemailer implementation replaced with direct SendGrid API usage.
// For high volume / production: move OTP store to Redis and add rate limiting per email.

// Generate 6-digit OTP
const generateOTP = () => {
  return crypto.randomInt(100000, 999999).toString();
};

// Store OTP with expiration (5 minutes)
const storeOTP = (email, otp) => {
  const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes
  otpStore.set(email, { otp, expiresAt });
};

// Verify OTP
const verifyOTP = (email, otp) => {
  const stored = otpStore.get(email);

  if (!stored) {
    return { success: false, message: 'OTP không tồn tại hoặc đã hết hạn' };
  }

  if (Date.now() > stored.expiresAt) {
    otpStore.delete(email);
    return { success: false, message: 'OTP đã hết hạn' };
  }

  if (stored.otp !== otp) {
    return { success: false, message: 'OTP không chính xác' };
  }

  otpStore.delete(email);
  return { success: true, message: 'Xác thực thành công' };
};

// Send OTP email
const sendOTPEmail = async (email, otp, type = 'registration') => {
  const subject = type === 'registration'
    ? 'Mã OTP Đăng Ký - Ứng Dụng Tiện Ích'
    : 'Mã OTP Đặt Lại Mật Khẩu - Ứng Dụng Tiện Ích';

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          background-color: #f4f4f4;
          margin: 0;
          padding: 0;
        }
        .container {
          max-width: 600px;
          margin: 40px auto;
          background-color: #ffffff;
          border-radius: 10px;
          overflow: hidden;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }
        .header {
          background: linear-gradient(135deg, #6C5CE7 0%, #917FF9 100%);
          padding: 40px;
          text-align: center;
          color: white;
        }
        .header h1 {
          margin: 0;
          font-size: 28px;
        }
        .content {
          padding: 40px;
        }
        .otp-box {
          background: linear-gradient(135deg, #6C5CE7 0%, #917FF9 100%);
          color: white;
          font-size: 36px;
          font-weight: bold;
          letter-spacing: 8px;
          text-align: center;
          padding: 20px;
          border-radius: 8px;
          margin: 30px 0;
        }
        .info {
          background-color: #f8f9fa;
          padding: 20px;
          border-left: 4px solid #6C5CE7;
          margin: 20px 0;
        }
        .footer {
          background-color: #f8f9fa;
          padding: 20px;
          text-align: center;
          color: #666;
          font-size: 14px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>✨ Ứng Dụng Tiện Ích</h1>
        </div>
        <div class="content">
          <h2>Xin chào!</h2>
          <p>${type === 'registration'
      ? 'Cảm ơn bạn đã đăng ký sử dụng Ứng Dụng Tiện Ích. Đây là mã OTP để xác thực tài khoản của bạn:'
      : 'Bạn đã yêu cầu đặt lại mật khẩu. Đây là mã OTP để xác thực:'
    }</p>
          
          <div class="otp-box">${otp}</div>
          
          <div class="info">
            <p><strong>⏰ Mã OTP có hiệu lực trong 5 phút</strong></p>
            <p>Vui lòng nhập mã này vào ứng dụng để hoàn tất ${type === 'registration' ? 'đăng ký' : 'đặt lại mật khẩu'}.</p>
          </div>
          
          <p>Nếu bạn không thực hiện yêu cầu này, vui lòng bỏ qua email này.</p>
        </div>
        <div class="footer">
          <p>Email này được gửi tự động, vui lòng không trả lời.</p>
          <p>&copy; 2024 Ứng Dụng Tiện Ích. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  if (!process.env.SENDGRID_API_KEY) {
    return { success: false, message: 'SendGrid API key chưa được cấu hình' };
  }
  try {
    await sgMail.send({
      to: email,
      from: {
        email: process.env.SENDGRID_FROM_EMAIL || 'noreply@app.com',
        name: process.env.SENDGRID_FROM_NAME || 'Ứng Dụng Tiện Ích'
      },
      subject,
      html,
    });
    return { success: true, message: 'Email đã được gửi' };
  } catch (error) {
    console.error('Send email error:', error.response?.body || error.message);
    return { success: false, message: 'Lỗi khi gửi email', error: error.message };
  }
};

module.exports = {
  generateOTP,
  storeOTP,
  verifyOTP,
  sendOTPEmail,
};
