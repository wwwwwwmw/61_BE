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
            client_id: { type: 'string' },
            user_id: { type: 'integer' },
            title: { type: 'string' },
            description: { type: 'string', nullable: true },
            category_id: { type: 'integer', nullable: true },
            priority: { type: 'string', enum: ['low','medium','high'] },
            tags: { type: 'array', items: { type: 'string' } },
            due_date: { type: 'string', format: 'date-time', nullable: true },
            reminder_time: { type: 'string', format: 'date-time', nullable: true },
            is_completed: { type: 'boolean' },
            is_deleted: { type: 'boolean' },
            version: { type: 'integer' },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' }
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
