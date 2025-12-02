const fs = require('fs');
const path = require('path');
const { pool } = require('../config/database');

async function migrateDatabase() {
  try {
    console.log('🔄 Applying schema updates (safe migrations)...');

    const schemaPath = path.join(__dirname, '../database/schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');

    // Execute the full schema which uses IF NOT EXISTS / CREATE OR REPLACE
    await pool.query(schema);

    console.log('✅ Schema updated successfully.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration error:', error.message);
    process.exit(1);
  }
}

migrateDatabase();
