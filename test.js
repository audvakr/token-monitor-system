// test-connection.js
const { Pool } = require('pg');

const pool = new Pool({
  host: 'db.your-project-ref.supabase.co',
  port: 5432,
  database: 'postgres',
  user: 'postgres',
  password: 'your-generated-password',
  ssl: {
    rejectUnauthorized: false
  }
});

async function testConnection() {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW()');
    console.log('✅ Database connected successfully!');
    console.log('Current time:', result.rows[0].now);
    client.release();
    await pool.end();
  } catch (error) {
    console.error('❌ Connection failed:', error);
  }
}

testConnection();