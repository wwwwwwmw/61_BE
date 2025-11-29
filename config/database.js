const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'personal_utility_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  console.error('❌ Database Error:', err);
});

const query = async (text, params) => {
  try {
    return await pool.query(text, params);
  } catch (error) {
    console.error('Query Error:', error.message);
    throw error;
  }
};

module.exports = { pool, query };