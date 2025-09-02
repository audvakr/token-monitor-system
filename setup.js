// setup.js - Database setup script
require('dotenv').config(); // Explicitly load .env for standalone execution
const { Pool } = require('pg');
// require('dotenv').config(); // Handled in config/index.js

console.log('DEBUG: DB_HOST =', process.env.DB_HOST);
console.log('DEBUG: DB_PORT =', process.env.DB_PORT);
console.log('DEBUG: DB_NAME =', process.env.DB_NAME);
console.log('DEBUG: DB_USER =', process.env.DB_USER);
console.log('DEBUG: DB_PASSWORD =', process.env.DB_PASSWORD ? '********' : 'NOT SET'); // Mask password
console.log('DEBUG: DB_SSL =', process.env.DB_SSL);
console.log('DEBUG: DB_BOOTSTRAP_LOCAL =', process.env.DB_BOOTSTRAP_LOCAL);

async function setupDatabase() {
  // Optional: local admin connection to create database (only if DB_BOOTSTRAP_LOCAL=true)
  const shouldBootstrapLocal = process.env.DB_BOOTSTRAP_LOCAL === 'true';
  const adminPool = shouldBootstrapLocal ? new Pool({
    user: process.env.DB_ADMIN_USER || 'postgres',
    host: process.env.DB_ADMIN_HOST || 'localhost',
    database: process.env.DB_ADMIN_DB || 'postgres',
    password: process.env.DB_ADMIN_PASSWORD || '',
    port: Number(process.env.DB_ADMIN_PORT || 5432),
  }) : null;

  try {
    console.log('🔄 Setting up database...');

    // Create database locally if requested
    if (shouldBootstrapLocal && adminPool) {
      try {
        await adminPool.query('CREATE DATABASE token_monitor');
        console.log('✅ Database "token_monitor" created successfully');
      } catch (error) {
        if (error.code === '42P04') {
          console.log('ℹ️  Database "token_monitor" already exists');
        } else {
          throw error;
        }
      }

      await adminPool.end();
    }

    // Connect using environment variables (works for local or remote DB)
    const pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT || 5432),
      database: process.env.DB_NAME || 'token_monitor',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || '',
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
    });

    // Drop tables if they exist to ensure a clean setup
    console.log('🔄 Dropping existing tables (if any)...');
    await pool.query('DROP TABLE IF EXISTS tokens CASCADE;');
    console.log('✅ Existing tables dropped.');

    // Create tables
    console.log('🔄 Creating tables...');

    const createTokensTable = `
      CREATE TABLE IF NOT EXISTS tokens (
        id SERIAL PRIMARY KEY,
        pair_address VARCHAR(255) UNIQUE NOT NULL,
        chain_id VARCHAR(50) NOT NULL,
        dex_id VARCHAR(50) NOT NULL,
        base_token_address VARCHAR(255) NOT NULL,
        base_token_name VARCHAR(255),
        base_token_symbol VARCHAR(50),
        quote_token_address VARCHAR(255),
        quote_token_symbol VARCHAR(50),
        price_usd DECIMAL(20, 8),
        price_sol DECIMAL(20, 8), -- New column for price in SOL
        volume_24h DECIMAL(20, 2),
        volume_6h DECIMAL(20, 2),
        volume_1h DECIMAL(20, 2),
        volume_5m DECIMAL(20, 2), -- New column for 5m volume
        price_change_24h DECIMAL(10, 4),
        price_change_6h DECIMAL(10, 4),
        price_change_1h DECIMAL(10, 4),
        price_change_5m DECIMAL(10, 4), -- New column for 5m price change
        liquidity_usd DECIMAL(20, 2),
        sol_liquidity DECIMAL(20, 2), -- New column for Solana liquidity
        pair_created_at TIMESTAMP,
        holders_count INTEGER,
        top_holder_percentage DECIMAL(5, 2),
        net_traders INTEGER,
        rug_score INTEGER,
        rug_risks TEXT[],
        freeze_authority VARCHAR(255), -- New column for freeze authority address
        mint_authority VARCHAR(255), -- New column for mint authority address
        update_authority VARCHAR(255), -- New column for update authority address
        is_mutable BOOLEAN, -- New column for mutability status
        status VARCHAR(50) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;

    await pool.query(createTokensTable);
    console.log('✅ Tokens table created');

    // Create indexes for better performance
    console.log('🔄 Creating indexes...');

    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_tokens_pair_address ON tokens(pair_address);',
      'CREATE INDEX IF NOT EXISTS idx_tokens_chain_id ON tokens(chain_id);',
      'CREATE INDEX IF NOT EXISTS idx_tokens_created_at ON tokens(created_at);',
      'CREATE INDEX IF NOT EXISTS idx_tokens_status ON tokens(status);',
      'CREATE INDEX IF NOT EXISTS idx_tokens_volume_24h ON tokens(volume_24h);',
      'CREATE INDEX IF NOT EXISTS idx_tokens_liquidity_usd ON tokens(liquidity_usd);',
      'CREATE INDEX IF NOT EXISTS idx_tokens_holders_count ON tokens(holders_count);',
      'CREATE INDEX IF NOT EXISTS idx_tokens_rug_score ON tokens(rug_score);'
    ];

    for (const indexQuery of indexes) {
      await pool.query(indexQuery);
    }

    console.log('✅ Indexes created');

    // Create a function to update the updated_at timestamp
    const createUpdateFunction = `
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
          NEW.updated_at = CURRENT_TIMESTAMP;
          RETURN NEW;
      END;
      $$ language 'plpgsql';
    `;

    await pool.query(createUpdateFunction);

    // Create trigger for auto-updating updated_at
    const createTrigger = `
      DROP TRIGGER IF EXISTS update_tokens_updated_at ON tokens;
      CREATE TRIGGER update_tokens_updated_at
          BEFORE UPDATE ON tokens
          FOR EACH ROW
          EXECUTE FUNCTION update_updated_at_column();
    `;

    await pool.query(createTrigger);
    console.log('✅ Auto-update trigger created');

    // Insert some sample data for testing
    console.log('🔄 Inserting sample data...');

    const sampleData = `
      INSERT INTO tokens (
        pair_address, chain_id, dex_id, base_token_address, base_token_name, 
        base_token_symbol, quote_token_address, quote_token_symbol, price_usd,
        volume_24h, volume_6h, volume_1h, price_change_24h, price_change_6h, 
        price_change_1h, liquidity_usd, sol_liquidity, pair_created_at, holders_count, 
        top_holder_percentage, net_traders, rug_score, rug_risks
      ) VALUES 
      (
        '0xsolana123456789012345678901234567890123456',
        'solana',
        'raydium',
        '0xsolanabaseabcdefabcdefabcdefabcdefabcdef',
        'Solana Sample Token',
        'SOLT',
        'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', -- USDC on Solana
        'USDC',
        0.005678,
        25000.75,
        12000.50,
        2500.25,
        10.25,
        5.10,
        3.45,
        80000.00,
        400.00, -- sol_liquidity (example value > 5)
        NOW() - INTERVAL '1 hour',
        300,
        10.2,
        50,
        1,
        ARRAY[]::TEXT[]
      )
      ON CONFLICT (pair_address) DO NOTHING;
    `;

    await pool.query(sampleData);
    console.log('✅ Sample data inserted');

    await pool.end();
    console.log('🎉 Database setup completed successfully!');

  } catch (error) {
    console.error('❌ Error setting up database:', error);
    process.exit(1);
  }
}

// Run setup if this file is executed directly
if (require.main === module) {
  setupDatabase();
}

module.exports = { setupDatabase };