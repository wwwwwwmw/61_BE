const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const options = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'Personal Utility API',
      version: '1.0.0',
      description: 'API documentation for Personal Utility (Todos, Expenses, Events, Categories, Budgets, Auth)'
    },
    servers: [
      { url: 'http://localhost:' + (process.env.PORT || 3000), description: 'Local' },
      { url: 'http://' + (process.env.DEVICE_IP || 'YOUR_PC_IP') + ':' + (process.env.PORT || 3000), description: 'LAN' }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      },
      schemas: {
        Todo: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            user_id: { type: 'integer' },
            title: { type: 'string' },
            description: { type: 'string', nullable: true },
            category_id: { type: 'integer', nullable: true },
            priority: { type: 'string', enum: ['low', 'medium', 'high'] },
            due_date: { type: 'string', format: 'date-time', nullable: true },
            is_completed: { type: 'boolean' },
            is_deleted: { type: 'boolean' },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' }
          }
        },
        Expense: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            user_id: { type: 'integer' },
            amount: { type: 'number' },
            type: { type: 'string', enum: ['income', 'expense'] },
            category_id: { type: 'integer', nullable: true },
            description: { type: 'string', nullable: true },
            date: { type: 'string', format: 'date-time' },
            payment_method: { type: 'string', nullable: true },
            receipt_image_path: { type: 'string', nullable: true },
            is_deleted: { type: 'boolean' },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' }
          }
        },
        Event: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            user_id: { type: 'integer' },
            title: { type: 'string' },
            description: { type: 'string', nullable: true },
            event_date: { type: 'string', format: 'date-time' },
            event_type: { type: 'string', nullable: true },
            color: { type: 'string' },
            is_recurring: { type: 'boolean' },
            notification_enabled: { type: 'boolean' },
            is_deleted: { type: 'boolean' },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' }
          }
        },
        Category: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            user_id: { type: 'integer' },
            name: { type: 'string' },
            color: { type: 'string' },
            icon: { type: 'string' },
            type: { type: 'string', enum: ['todo', 'expense', 'both'] },
            created_at: { type: 'string', format: 'date-time' }
          }
        },
        Budget: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            user_id: { type: 'integer' },
            category_id: { type: 'integer' },
            amount: { type: 'number' },
            period: { type: 'string', enum: ['daily', 'weekly', 'monthly', 'yearly'] },
            start_date: { type: 'string', format: 'date-time' },
            end_date: { type: 'string', format: 'date-time', nullable: true },
            alert_threshold: { type: 'integer' },
            is_active: { type: 'boolean' },
            created_at: { type: 'string', format: 'date-time' }
          }
        }
      }
    },
    security: [{ bearerAuth: [] }],
    tags: [
      { name: 'Auth', description: 'Authentication & OTP' },
      { name: 'Todos', description: 'Task management operations' },
      { name: 'Expenses', description: 'Expense & income tracking' },
      { name: 'Events', description: 'Event scheduling' },
      { name: 'Categories', description: 'Category management' },
      { name: 'Budgets', description: 'Budget tracking' }
    ]
  },
  apis: [
    './routes/*.js'
  ]
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = { swaggerUi, swaggerSpec };
