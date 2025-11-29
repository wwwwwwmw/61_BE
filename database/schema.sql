-- Personal Utility Application Database Schema
-- PostgreSQL Database

-- Drop existing tables if they exist
DROP TABLE IF EXISTS sync_logs CASCADE;
DROP TABLE IF EXISTS events CASCADE;
DROP TABLE IF EXISTS budgets CASCADE;
DROP TABLE IF EXISTS expenses CASCADE;
DROP TABLE IF EXISTS todos CASCADE;
DROP TABLE IF EXISTS categories CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Users table for authentication
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP,
    is_active BOOLEAN DEFAULT true
);

-- Categories table (shared for todos and expenses)
CREATE TABLE categories (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    color VARCHAR(7) DEFAULT '#3498db', -- Hex color code
    icon VARCHAR(50) DEFAULT 'category',
    type VARCHAR(20) CHECK (type IN ('todo', 'expense', 'both')) DEFAULT 'both',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, name, type)
);

-- Todos table
CREATE TABLE todos (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    is_completed BOOLEAN DEFAULT false,
    category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    priority VARCHAR(20) CHECK (priority IN ('low', 'medium', 'high')) DEFAULT 'medium',
    tags TEXT[], -- Array of tags
    due_date TIMESTAMP,
    reminder_time TIMESTAMP,
    position INTEGER DEFAULT 0, -- For custom ordering
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    is_deleted BOOLEAN DEFAULT false,
    deleted_at TIMESTAMP,
    -- Sync fields
    last_synced_at TIMESTAMP,
    client_id VARCHAR(100), -- UUID from client for conflict resolution
    version INTEGER DEFAULT 1
);

-- Expenses table
CREATE TABLE expenses (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount DECIMAL(12, 2) NOT NULL,
    type VARCHAR(20) CHECK (type IN ('income', 'expense')) NOT NULL,
    category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    description TEXT,
    date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    payment_method VARCHAR(50), -- cash, card, transfer, etc.
    receipt_image VARCHAR(255), -- Path to receipt image
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_deleted BOOLEAN DEFAULT false,
    deleted_at TIMESTAMP,
    -- Sync fields
    last_synced_at TIMESTAMP,
    client_id VARCHAR(100),
    version INTEGER DEFAULT 1
);

-- Budgets table
CREATE TABLE budgets (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,
    amount DECIMAL(12, 2) NOT NULL,
    period VARCHAR(20) CHECK (period IN ('daily', 'weekly', 'monthly', 'yearly')) DEFAULT 'monthly',
    start_date DATE NOT NULL,
    end_date DATE,
    alert_threshold INTEGER DEFAULT 80, -- Alert when 80% of budget is used
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Events table for countdown
CREATE TABLE events (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    event_date TIMESTAMP NOT NULL,
    event_type VARCHAR(50), -- birthday, anniversary, meeting, deadline, etc.
    color VARCHAR(7) DEFAULT '#e74c3c',
    icon VARCHAR(50) DEFAULT 'event',
    is_recurring BOOLEAN DEFAULT false,
    recurrence_pattern VARCHAR(20) CHECK (recurrence_pattern IN ('daily', 'weekly', 'monthly', 'yearly')),
    notification_enabled BOOLEAN DEFAULT true,
    notification_times INTEGER[] DEFAULT ARRAY[1440, 60, 0], -- Minutes before event (1 day, 1 hour, at time)
    image_path VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_deleted BOOLEAN DEFAULT false,
    deleted_at TIMESTAMP,
    -- Sync fields
    last_synced_at TIMESTAMP,
    client_id VARCHAR(100),
    version INTEGER DEFAULT 1
);

-- Sync logs table for tracking synchronization
CREATE TABLE sync_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    table_name VARCHAR(50) NOT NULL,
    record_id INTEGER NOT NULL,
    action VARCHAR(20) CHECK (action IN ('create', 'update', 'delete')) NOT NULL,
    synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    client_device_id VARCHAR(100),
    sync_status VARCHAR(20) CHECK (sync_status IN ('pending', 'success', 'conflict', 'failed')) DEFAULT 'success',
    conflict_data JSONB
);

-- Create indexes for better performance
CREATE INDEX idx_todos_user_id ON todos(user_id);
CREATE INDEX idx_todos_completed ON todos(is_completed, user_id);
CREATE INDEX idx_todos_due_date ON todos(due_date);
CREATE INDEX idx_todos_category ON todos(category_id);
CREATE INDEX idx_todos_deleted ON todos(is_deleted);

CREATE INDEX idx_expenses_user_id ON expenses(user_id);
CREATE INDEX idx_expenses_date ON expenses(date);
CREATE INDEX idx_expenses_category ON expenses(category_id);
CREATE INDEX idx_expenses_type ON expenses(type, user_id);
CREATE INDEX idx_expenses_deleted ON expenses(is_deleted);

CREATE INDEX idx_events_user_id ON events(user_id);
CREATE INDEX idx_events_date ON events(event_date);
CREATE INDEX idx_events_deleted ON events(is_deleted);

CREATE INDEX idx_budgets_user_id ON budgets(user_id);
CREATE INDEX idx_budgets_active ON budgets(is_active, user_id);

CREATE INDEX idx_categories_user_id ON categories(user_id);
CREATE INDEX idx_sync_logs_user_id ON sync_logs(user_id);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_categories_updated_at BEFORE UPDATE ON categories
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_todos_updated_at BEFORE UPDATE ON todos
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_expenses_updated_at BEFORE UPDATE ON expenses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_budgets_updated_at BEFORE UPDATE ON budgets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_events_updated_at BEFORE UPDATE ON events
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Note: Default categories will be automatically created when users register
-- See routes/auth.js for the registration endpoint that creates default categories
ALTER TABLE users ADD COLUMN otp_code VARCHAR(6);
ALTER TABLE users ADD COLUMN otp_expires_at TIMESTAMP;
-- Đảm bảo users có cột is_active mặc định là false nếu muốn bắt buộc OTP
ALTER TABLE users ALTER COLUMN is_active SET DEFAULT false;