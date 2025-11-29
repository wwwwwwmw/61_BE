const { pool } = require('../config/database');
const bcrypt = require('bcryptjs');

const seedData = async () => {
    try {
        console.log('🌱 Bắt đầu tạo dữ liệu mẫu (Seeding)...');

        // Mật khẩu chung: 123456
        const passwordHash = await bcrypt.hash('123456', 10);

        const users = [
            { email: 'user1@example.com', name: 'Nguyễn Văn A' },
            { email: 'user2@example.com', name: 'Trần Thị B' },
            { email: 'user3@example.com', name: 'Lê Văn C' }
        ];

        for (const u of users) {
            // 1. Tạo User (Nếu chưa có)
            let userRes = await pool.query('SELECT id FROM users WHERE email = $1', [u.email]);
            let userId;

            if (userRes.rows.length === 0) {
                const newUser = await pool.query(
                    `INSERT INTO users (email, password_hash, full_name, is_active) 
                     VALUES ($1, $2, $3, true) RETURNING id`,
                    [u.email, passwordHash, u.name]
                );
                userId = newUser.rows[0].id;
                console.log(`✅ Đã tạo user: ${u.email}`);
            } else {
                userId = userRes.rows[0].id;
                console.log(`ℹ️ User ${u.email} đã tồn tại, thêm dữ liệu mới...`);
            }

            // 2. Tạo Category mặc định
            const catRes = await pool.query(
                `INSERT INTO categories (user_id, name, type, icon, color) VALUES 
                ($1, 'Công việc', 'todo', 'work', '#3498db'),
                ($1, 'Cá nhân', 'todo', 'person', '#e74c3c'),
                ($1, 'Ăn uống', 'expense', 'restaurant', '#f1c40f')
                ON CONFLICT (user_id, name, type) DO UPDATE SET name = EXCLUDED.name
                RETURNING id, type`,
                [userId]
            );

            const todoCatId = catRes.rows.find(c => c.type === 'todo')?.id || null;
            const expenseCatId = catRes.rows.find(c => c.type === 'expense')?.id || null;

            // 3. Tạo 3 Todo
            await pool.query(`
                INSERT INTO todos (user_id, title, description, priority, category_id, tags, due_date) VALUES
                ($1, 'Họp team dự án', 'Chuẩn bị slide báo cáo', 'high', $2, ARRAY['work', 'urgent'], NOW() + INTERVAL '1 day'),
                ($1, 'Đi siêu thị', 'Mua rau, thịt, sữa', 'medium', $2, ARRAY['personal'], NOW() + INTERVAL '2 days'),
                ($1, 'Học Node.js', 'Làm bài tập Backend', 'low', $2, ARRAY['study'], NOW() + INTERVAL '3 days')
            `, [userId, todoCatId]);

            // 4. Tạo 3 Expense
            await pool.query(`
                INSERT INTO expenses (user_id, amount, type, description, category_id, date) VALUES
                ($1, 50000, 'expense', 'Cafe sáng', $2, NOW()),
                ($1, 1200000, 'income', 'Lương làm thêm', null, NOW() - INTERVAL '1 day'),
                ($1, 35000, 'expense', 'Ăn trưa', $2, NOW() - INTERVAL '2 hours')
            `, [userId, expenseCatId]);

            // 5. Tạo 3 Event
            await pool.query(`
                INSERT INTO events (user_id, title, description, event_date, event_type, notification_enabled) VALUES
                ($1, 'Sinh nhật bạn thân', 'Mua quà', NOW() + INTERVAL '5 days', 'birthday', true),
                ($1, 'Hạn nộp báo cáo', 'Gửi qua email', NOW() + INTERVAL '1 hour', 'deadline', true),
                ($1, 'Kỷ niệm ngày cưới', 'Đặt bàn ăn', NOW() + INTERVAL '1 month', 'anniversary', true)
            `, [userId]);
        }

        console.log('🎉 Seeding hoàn tất! Bạn có thể đăng nhập bằng user1@example.com / 123456');
        process.exit(0);
    } catch (err) {
        console.error('❌ Lỗi Seeding:', err);
        process.exit(1);
    }
};

seedData();