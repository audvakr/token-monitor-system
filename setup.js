// setup.js - Database setup script
const { Pool } = require('pg');

async function setupDatabase() {
  // First connect without specifying a database to create it
  const adminPool = new Pool({
    user: 'your_username',
    host: 'localhost',
    database: 'postgres', // Connect to default postgres database
    password: 'your_password',
    port: 5432,
  });

  try {
    console.log('🔄 Setting up database...');

    // Create database if it doesn't exist
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

    // Now connect to the token_monitor database
    const pool = new Pool({
      user: 'your_username',
      host: 'localhost',
      database: 'token_monitor',
      password: 'your_password',
      port: 5432,
    });

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
        volume_24h DECIMAL(20, 2),
        volume_6h DECIMAL(20, 2),
        volume_1h DECIMAL(20, 2),
        price_change_24h DECIMAL(10, 4),
        price_change_6h DECIMAL(10, 4),
        price_change_1h DECIMAL(10, 4),
        liquidity_usd DECIMAL(20, 2),
        pair_created_at TIMESTAMP,
        holders_count INTEGER,
        top_holder_percentage DECIMAL(5, 2),
        net_traders INTEGER,
        rug_score INTEGER,
        rug_risks TEXT[],
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
        price_change_1h, liquidity_usd, pair_created_at, holders_count, 
        top_holder_percentage, net_traders, rug_score, rug_risks
      ) VALUES 
      (
        '0x1234567890123456789012345678901234567890',
        'ethereum',
        'uniswap',
        '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
        'Sample Token',
        'SAMPLE',
        '0xa0b86a33e6776e681c00f7d9c9e0d60b0e1e9e6b',
        'USDC',
        0.000123,
        15000.50,
        3500.25,
        500.10,
        5.67,
        2.34,
        -1.23,
        45000.00,
        NOW() - INTERVAL '2 hours',
        150,
        15.5,
        25,
        2,
        ARRAY['low_liquidity']
      ),
      (
        '0x9876543210987654321098765432109876543210',
        'bsc',
        'pancakeswap',
        '0xfedcbafedcbafedcbafedcbafedcbafedcbafedcba',
        'Test Coin',
        'TEST',
        '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c',
        'BNB',
        0.00456,
        8500.75,
        2100.50,
        350.25,
        -2.45,
        1.67,
        0.89,
        22000.00,
        NOW() - INTERVAL '4 hours',
        89,
        25.2,
        18,
        4,
        ARRAY['high_concentration', 'new_token']
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