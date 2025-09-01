// config/database.js - Centralized database configuration
require('dotenv').config();

const { Pool } = require('pg');

// Validate required environment variables
const requiredEnvVars = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error('❌ Missing required environment variables:', missingVars);
  console.error('Please check your .env file and ensure these variables are set:');
  missingVars.forEach(varName => {
    console.error(`   - ${varName}`);
  });
  process.exit(1);
}

// Database configuration
const dbConfig = {
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  
  // Connection pool settings
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 2000, // Return an error after 2 seconds if connection could not be established
  
  // Additional PostgreSQL settings for better performance
  statement_timeout: 30000, // 30 second timeout for queries
  query_timeout: 30000,
  application_name: 'token-monitor-system',
};

// Create and export database pool
const pool = new Pool(dbConfig);

// Event listeners for connection monitoring
pool.on('connect', (client) => {
  console.log('✅ New client connected to database');
  if (process.env.DEBUG === 'true') {
    console.log(`   Host: ${dbConfig.host}`);
    console.log(`   Database: ${dbConfig.database}`);
  }
});

pool.on('acquire', (client) => {
  if (process.env.DEBUG === 'true') {
    console.log('🔄 Client acquired from pool');
  }
});

pool.on('error', (err, client) => {
  console.error('❌ Unexpected error on idle client:', err);
});

pool.on('remove', (client) => {
  if (process.env.DEBUG === 'true') {
    console.log('🔄 Client removed from pool');
  }
});

// Test connection function
async function testConnection() {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW(), version()');
    console.log('✅ Database connection successful');
    console.log(`   Current time: ${result.rows[0].now}`);
    if (process.env.DEBUG === 'true') {
      console.log(`   PostgreSQL version: ${result.rows[0].version}`);
    }
    client.release();
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    return false;
  }
}

// Graceful shutdown function
async function closeDatabase() {
  try {
    console.log('🔄 Closing database connections...');
    await pool.end();
    console.log('✅ Database connections closed');
  } catch (error) {
    console.error('❌ Error closing database:', error.message);
  }
}

// Handle process termination
process.on('SIGINT', async () => {
  await closeDatabase();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await closeDatabase();
  process.exit(0);
});

// Export pool and utility functions
module.exports = {
  pool,
  dbConfig,
  testConnection,
  closeDatabase
};