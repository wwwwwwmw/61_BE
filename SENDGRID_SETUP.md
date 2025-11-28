# 🚀 Hướng Dẫn Tích Hợp SendGrid & Sử Dụng Tính Năng Mới

## 📧 Cấu Hình SendGrid

### Bước 1: Tạo Tài Khoản SendGrid
1. Truy cập [SendGrid.com](https://sendgrid.com/)
2. Đăng ký tài khoản miễn phí (100 emails/day)
3. Xác thực email

### Bước 2: Tạo API Key
1. Vào **Settings** > **API Keys**
2. Click **Create API Key**
3. Chọn **Full Access** hoặc **Restricted Access** (Mail Send only)
4. Copy API Key

### Bước 3: Cấu Hình Backend
Mở file `.env` và thêm:
```env
SENDGRID_API_KEY=SG.xxxxxxxxxxxxxxxxxxxxxxxx
SENDGRID_FROM_EMAIL=noreply@yourdomain.com
```

### Bước 4: Cài Đặt Dependencies
```bash
cd backend
npm install
```

### Bước 5: Khởi Động Server
```bash
npm run dev
```

---

## 🔐 Tính Năng OTP & Xác Thực

### 1. Đăng Ký Với OTP

**Flow:**
```
1. User nhập email -> Nhận OTP qua email
2. Nhập OTP để xác thực
3. Hoàn tất đăng ký với thông tin đầy đủ
```

**API Endpoints:**

```http
POST /api/auth/send-otp
Content-Type: application/json

{
  "email": "user@example.com",
  "type": "registration"
}

Response:
{
  "success": true,
  "message": "Mã OTP đã được gửi đến email của bạn",
  "expiresIn": 300
}
```

```http
POST /api/auth/verify-otp
Content-Type: application/json

{
  "email": "user@example.com",
  "otp": "123456"
}

Response:
{
  "success": true,
  "message": "Xác thực OTP thành công",
  "verified": true
}
```

```http
POST /api/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123",
  "fullName": "Nguyễn Văn A",
  "otp": "123456"
}

Response:
{
  "success": true,
  "message": "Đăng ký thành công",
  "data": {
    "user": {...},
    "accessToken": "...",
    "refreshToken": "..."
  }
}
```

### 2. Quên Mật Khẩu

**Flow:**
```
1. User nhập email -> Nhận OTP qua email
2. Nhập OTP để xác thực
3. Nhập mật khẩu mới
4. Hoàn tất đặt lại mật khẩu
```

**API Endpoints:**

```http
POST /api/auth/send-otp
Content-Type: application/json

{
  "email": "user@example.com",
  "type": "forgot_password"
}
```

```http
POST /api/auth/forgot-password
Content-Type: application/json

{
  "email": "user@example.com",
  "otp": "123456",
  "newPassword": "newpassword123"
}

Response:
{
  "success": true,
  "message": "Đặt lại mật khẩu thành công"
}
```

---

## 🔄 Đồng Bộ Tự Động (Auto-Sync)

### Cách Hoạt Động

**Offline:**
- Dữ liệu được lưu vào SQLite local database
- Đánh dấu `is_synced = 0` cho dữ liệu chưa đồng bộ
- Ứng dụng hoạt động bình thường

**Online:**
- Tự động phát hiện khi có kết nối mạng
- Sync Service tự động chạy
- Upload dữ liệu chưa đồng bộ lên server
- Download thay đổi từ server về local
- Xử lý xung đột dữ liệu (conflict resolution)

### Tính Năng Sync

✅ **Automatic Detection**: Tự động phát hiện khi có/mất mạng  
✅ **Periodic Sync**: Đồng bộ định kỳ mỗi 5 phút khi online  
✅ **Bidirectional Sync**: Đồng bộ 2 chiều (local ↔ server)  
✅ **Conflict Resolution**: Xử lý xung đột theo version number  
✅ **Background Sync**: Đồng bộ nền, không làm gián đoạn UX

### Code Example

```dart
// Sync service tự động khởi tạo khi app start
final syncService = SyncService(
  appDatabase,
  apiClient,
  prefs,
);

// Sync thủ công
await syncService.syncAll();

// Sync sẽ tự động chạy khi:
// 1. Có kết nối mạng trở lại
// 2. Mỗi 5 phút một lần
// 3. App khởi động
```

### Monitoring Sync Status

```dart
// Log sẽ hiển thị trong console:
📴 No internet connection, skipping sync
🔄 Starting sync...
✅ Todos synced
✅ Expenses synced
✅ Events synced
✅ Sync completed successfully
```

---

## 📝 CRUD Hoàn Chỉnh

### Todos

**Create:**
```http
POST /api/todos
Authorization: Bearer {token}

{
  "title": "Hoàn thành báo cáo",
  "description": "Viết phần kết luận",
  "priority": "high",
  "tags": ["work", "urgent"],
  "due_date": "2024-12-01T00:00:00Z",
  "reminder_time": "2024-11-30T09:00:00Z",
  "category_id": 1
}
```

**Read:**
```http
GET /api/todos?completed=false&priority=high
Authorization: Bearer {token}
```

**Update:**
```http
PUT /api/todos/1
Authorization: Bearer {token}

{
  "title": "Updated title",
  "is_completed": true
}
```

**Delete:**
```http
DELETE /api/todos/1
Authorization: Bearer {token}
```

**Toggle Complete:**
```http
PATCH /api/todos/1/toggle
Authorization: Bearer {token}
```

### Expenses

**Create:**
```http
POST /api/expenses
Authorization: Bearer {token}

{
  "amount": 150000,
  "type": "expense",
  "category_id": 3,
  "description": "Ăn trưa",
  "date": "2024-11-27T12:00:00Z",
  "payment_method": "cash"
}
```

**Statistics:**
```http
GET /api/expenses/statistics?start_date=2024-11-01&end_date=2024-11-30
Authorization: Bearer {token}

Response:
{
  "success": true,
  "data": {
    "summary": {
      "totalIncome": 5000000,
      "totalExpense": 2500000,
      "balance": 2500000
    },
    "byCategory": [...],
    "trend": [...]
  }
}
```

### Events

**Create:**
```http
POST /api/events
Authorization: Bearer {token}

{
  "title": "Sinh nhật mẹ",
  "description": "Chuẩn bị quà tặng",
  "event_date": "2024-12-15T00:00:00Z",
  "event_type": "birthday",
  "color": "#FF6B9D",
  "icon": "cake",
  "notification_enabled": true
}
```

**Get Upcoming:**
```http
GET /api/events?upcoming=true
Authorization: Bearer {token}
```

### Budgets

**Create:**
```http
POST /api/budgets
Authorization: Bearer {token}

{
  "category_id": 3,
  "amount": 3000000,
  "period": "monthly",
  "alert_threshold": 80
}
```

**Get Status:**
```http
GET /api/budgets/1/status
Authorization: Bearer {token}

Response:
{
  "success": true,
  "data": {
    "budget": {...},
    "spending": {
      "totalSpent": 2400000,
      "budgetAmount": 3000000,
      "remaining": 600000,
      "percentage": "80.00",
      "isOverBudget": false,
      "shouldAlert": true
    }
  }
}
```

---

## 🎯 Workflow Usage

### Scenario 1: User đăng ký mới

1. Mở app -> Click "Đăng ký"
2. Nhập email -> Click "Gửi OTP"
3. Check email -> Nhập mã OTP 6 số
4. Nhập tên, mật khẩu -> Click "Đăng ký"
5. ✅ Tự động đăng nhập và tạo categories mặc định

### Scenario 2: Quên mật khẩu

1. Màn hình login -> Click "Quên mật khẩu?"
2. Nhập email -> Click "Gửi OTP"
3. Check email -> Nhập OTP
4. Nhập mật khẩu mới -> Click "Đặt lại"
5. ✅ Đăng nhập với mật khẩu mới

### Scenario 3: Offline Work

1. Mất kết nối mạng
2. Tạo Todo mới -> ✅ Lưu vào SQLite
3. Thêm expense -> ✅ Lưu local
4. Có mạng trở lại
5. 🔄 Auto sync ngầm
6. ✅ Dữ liệu xuất hiện trên server

---

## 🔧 Testing

### Test SendGrid Email

```bash
# Using curl
curl -X POST http://localhost:3000/api/auth/send-otp \
  -H "Content-Type: application/json" \
  -d '{
    "email": "your-email@example.com",
    "type": "registration"
  }'
```

### Test Auto-Sync

1. Tắt wifi/mobile data
2. Tạo todo mới trong app
3. Bật lại wifi
4. Kiểm tra console log: "✅ Sync completed successfully"
5. Kiểm tra database: todo đã có `id` từ server

---

## 📊 Monitoring

### Backend Logs

```bash
# In terminal running backend
✅ Connected to PostgreSQL database
🚀 Server running on port 3000
POST /api/auth/send-otp 200 1234ms
✉️ OTP email sent to user@example.com
```

### Flutter Logs

```bash
# In terminal running flutter
🔄 Starting sync...
✅ Todos synced
✅ Expenses synced
✅ Events synced
✅ Sync completed successfully
```

---

## ⚠️ Important Notes

1. **SendGrid Free Tier**: 100 emails/day
2. **OTP  Expiration**: 5 minutes
3. **Sync Interval**: 5 minutes (có thể thay đổi trong `app_constants.dart`)
4. **Token Expiration**: Access token 7 days, Refresh token 30 days
5. **Conflict Resolution**: Server version wins automatically

---

## 🐛 Troubleshooting

### Email không gửi được
- Check SENDGRID_API_KEY trong .env
- Verify email sender trong SendGrid
- Check server logs

### Sync không hoạt động
- Check internet connection
- Check backend server đang chạy
- Check console logs
- Verify access token còn hạn

### Database conflict
- Clear local database: Xóa app và cài lại
- Hoặc chạy: `flutter clean && flutter pub get`

---

**Chúc bạn sử dụng app hiệu quả! 🎉**
