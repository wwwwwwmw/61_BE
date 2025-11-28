# Personal Utility Application - Backend API

Node.js REST API server for Personal Utility Application with PostgreSQL database.

## Features

- ✅ JWT Authentication
- ✅ Todo List Management
- ✅ Expense Tracking & Statistics
- ✅ Event Countdown
- ✅ Budget Management with Alerts
- ✅ Offline-first Sync Support
- ✅ Category Management

## Prerequisites

- Node.js (v14 or higher)
- PostgreSQL (v12 or higher)
- npm or yarn

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env`:

```bash
copy .env.example .env
```

Edit `.env` and update the following values:

```env
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=personal_utility_db
DB_USER=postgres
DB_PASSWORD=your_actual_password

# JWT Configuration
JWT_SECRET=your_super_secret_jwt_key_change_this
JWT_REFRESH_SECRET=your_refresh_token_secret
```

### 3. Create PostgreSQL Database

```sql
CREATE DATABASE personal_utility_db;
```

### 4. Initialize Database Schema

```bash
npm run init-db
```

This will create all necessary tables, indexes, and triggers.

### 5. Start the Server

**Development mode (with auto-reload):**
```bash
npm run dev
```

**Production mode:**
```bash
npm start
```

The server will start on `http://localhost:3000`

## API Endpoints

### Authentication

- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `POST /api/auth/refresh` - Refresh access token

### Todos

- `GET /api/todos` - Get all todos
- `GET /api/todos/:id` - Get single todo
- `POST /api/todos` - Create todo
- `PUT /api/todos/:id` - Update todo
- `PATCH /api/todos/:id/toggle` - Toggle completion
- `DELETE /api/todos/:id` - Delete todo
- `POST /api/todos/sync` - Sync todos from client

### Expenses

- `GET /api/expenses` - Get all expenses
- `GET /api/expenses/statistics` - Get expense statistics
- `POST /api/expenses` - Create expense
- `PUT /api/expenses/:id` - Update expense
- `DELETE /api/expenses/:id` - Delete expense
- `POST /api/expenses/sync` - Sync expenses from client

### Events

- `GET /api/events` - Get all events
- `GET /api/events/:id` - Get single event with countdown
- `POST /api/events` - Create event
- `PUT /api/events/:id` - Update event
- `DELETE /api/events/:id` - Delete event
- `POST /api/events/sync` - Sync events from client

### Categories

- `GET /api/categories` - Get all categories
- `POST /api/categories` - Create category
- `PUT /api/categories/:id` - Update category
- `DELETE /api/categories/:id` - Delete category

### Budgets

- `GET /api/budgets` - Get all budgets
- `GET /api/budgets/:id/status` - Get budget status with spending
- `POST /api/budgets` - Create budget
- `PUT /api/budgets/:id` - Update budget
- `DELETE /api/budgets/:id` - Delete budget

## Database Schema

The database includes the following tables:

- `users` - User accounts
- `categories` - Categories for todos and expenses
- `todos` - Task management
- `expenses` - Financial transactions
- `budgets` - Budget limits and alerts
- `events` - Countdown events
- `sync_logs` - Synchronization tracking

## Authentication

All endpoints except `/api/auth/*` require authentication.

Include the JWT token in the Authorization header:

```
Authorization: Bearer YOUR_ACCESS_TOKEN
```

## Error Handling

All responses follow this format:

**Success:**
```json
{
  "success": true,
  "data": { ... }
}
```

**Error:**
```json
{
  "success": false,
  "message": "Error message",
  "errors": [ ... ]
}
```

## License

MIT
# 61_BE
