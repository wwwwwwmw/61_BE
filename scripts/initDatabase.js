const fs = require('fs');
const path = require('path');
const { pool } = require('../config/database');

async function initializeDatabase() {
    try {
        console.log('🔄 Initializing database...');

        // Read schema file
        const schemaPath = path.join(__dirname, '../database/schema.sql');
        const schema = fs.readFileSync(schemaPath, 'utf8');

        // Execute schema
        await pool.query(schema);

        console.log('✅ Database initialized successfully!');
        console.log('📋 Tables created:');
        console.log('   - users');
        console.log('   - categories');
        console.log('   - todos');
        console.log('   - expenses');
        console.log('   - budgets');
        console.log('   - events');
        console.log('   - sync_logs');

        process.exit(0);
    } catch (error) {
        console.error('❌ Error initializing database:', error.message);
        process.exit(1);
    }
}

initializeDatabase();
