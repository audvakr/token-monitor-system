// token-monitor.js - Main monitoring application
const axios = require('axios');
const { Pool } = require('pg');
const cron = require('node-cron');
const { db, api, filters, chains, logging } = require('./config');
require('dotenv').config();

class TokenMonitor {
  constructor() {
    // PostgreSQL connection via environment variables
    this.pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT || 5432),
      database: process.env.DB_NAME || 'token_monitor',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || '',
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
    });

    // Configuration for filtering
    this.config = {
      minHolders: 50,
      maxTopHolderPercentage: 50, // Top holder can't own more than 50%
      minVolume24h: 1000, // Min $1000 24h volume
      minNetTraders: 10,
      minLiquidity: 5000, // Min $5000 liquidity
      maxAge: 24 * 60 * 60 * 1000, // Only tokens created in last 24h
    };

    this.init();
  }

  async init() {
    await this.createTables();
    console.log('Token Monitor initialized');
  }

  async createTables() {
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

    const createIndexes = `
      CREATE INDEX IF NOT EXISTS idx_tokens_pair_address ON tokens(pair_address);
      CREATE INDEX IF NOT EXISTS idx_tokens_chain_id ON tokens(chain_id);
      CREATE INDEX IF NOT EXISTS idx_tokens_created_at ON tokens(created_at);
      CREATE INDEX IF NOT EXISTS idx_tokens_status ON tokens(status);
    `;

    await this.pool.query(createTokensTable);
    await this.pool.query(createIndexes);
  }

  async fetchLatestPairs(chainId = null) {
    try {
      const url = chainId 
        ? `https://api.dexscreener.com/latest/dex/pairs/${chainId}`
        : 'https://api.dexscreener.com/latest/dex/pairs';
      
      const response = await axios.get(url);
      return response.data.pairs || [];
    } catch (error) {
      console.error('Error fetching pairs from DexScreener:', error.message);
      return [];
    }
  }

  async checkRugScore(tokenAddress, chainId = 'ethereum') {
    try {
      // Note: Replace with actual RugCheck API endpoint
      const response = await axios.get(`https://api.rugcheck.xyz/v1/tokens/${chainId}/${tokenAddress}`);
      
      return {
        score: response.data.score || 0,
        risks: response.data.risks || [],
        holders: response.data.holders || {},
      };
    } catch (error) {
      console.error(`Error checking rug score for ${tokenAddress}:`, error.message);
      return {
        score: 0,
        risks: [],
        holders: {},
      };
    }
  }

  calculateHolderDistribution(holdersData) {
    if (!holdersData || !holdersData.top) return { count: 0, topPercentage: 100 };
    
    const holders = holdersData.top;
    const totalSupply = holdersData.total || 1;
    
    let topHolderPercentage = 0;
    if (holders.length > 0) {
      topHolderPercentage = (holders[0].balance / totalSupply) * 100;
    }

    return {
      count: holdersData.count || holders.length,
      topPercentage: topHolderPercentage,
    };
  }

  async filterToken(pair, rugData) {
    const now = Date.now();
    const tokenAge = now - pair.pairCreatedAt;
    
    // Age filter
    if (tokenAge > this.config.maxAge) {
      return { passed: false, reason: 'Token too old' };
    }

    // Volume filter
    const volume24h = pair.volume?.h24 || 0;
    if (volume24h < this.config.minVolume24h) {
      return { passed: false, reason: `Volume too low: $${volume24h}` };
    }

    // Liquidity filter
    const liquidity = pair.liquidity?.usd || 0;
    if (liquidity < this.config.minLiquidity) {
      return { passed: false, reason: `Liquidity too low: $${liquidity}` };
    }

    // Holder distribution
    const holderData = this.calculateHolderDistribution(rugData.holders);
    if (holderData.count < this.config.minHolders) {
      return { passed: false, reason: `Not enough holders: ${holderData.count}` };
    }

    if (holderData.topPercentage > this.config.maxTopHolderPercentage) {
      return { passed: false, reason: `Top holder owns too much: ${holderData.topPercentage.toFixed(2)}%` };
    }

    // Net traders (approximate from volume data)
    const netTraders = Math.floor(volume24h / 100); // Rough estimation
    if (netTraders < this.config.minNetTraders) {
      return { passed: false, reason: `Not enough traders: ${netTraders}` };
    }

    return { 
      passed: true, 
      holderData,
      netTraders 
    };
  }

  async saveToken(pair, rugData, filterResult) {
    const query = `
      INSERT INTO tokens (
        pair_address, chain_id, dex_id, base_token_address, base_token_name, 
        base_token_symbol, quote_token_address, quote_token_symbol, price_usd,
        volume_24h, volume_6h, volume_1h, price_change_24h, price_change_6h, 
        price_change_1h, liquidity_usd, pair_created_at, holders_count, 
        top_holder_percentage, net_traders, rug_score, rug_risks
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 
        $16, $17, $18, $19, $20, $21, $22
      ) ON CONFLICT (pair_address) DO UPDATE SET
        price_usd = EXCLUDED.price_usd,
        volume_24h = EXCLUDED.volume_24h,
        volume_6h = EXCLUDED.volume_6h,
        volume_1h = EXCLUDED.volume_1h,
        price_change_24h = EXCLUDED.price_change_24h,
        price_change_6h = EXCLUDED.price_change_6h,
        price_change_1h = EXCLUDED.price_change_1h,
        liquidity_usd = EXCLUDED.liquidity_usd,
        holders_count = EXCLUDED.holders_count,
        top_holder_percentage = EXCLUDED.top_holder_percentage,
        net_traders = EXCLUDED.net_traders,
        rug_score = EXCLUDED.rug_score,
        rug_risks = EXCLUDED.rug_risks,
        updated_at = CURRENT_TIMESTAMP
    `;

    const values = [
      pair.pairAddress,
      pair.chainId,
      pair.dexId,
      pair.baseToken.address,
      pair.baseToken.name,
      pair.baseToken.symbol,
      pair.quoteToken.address,
      pair.quoteToken.symbol,
      parseFloat(pair.priceUsd) || 0,
      pair.volume?.h24 || 0,
      pair.volume?.h6 || 0,
      pair.volume?.h1 || 0,
      pair.priceChange?.h24 || 0,
      pair.priceChange?.h6 || 0,
      pair.priceChange?.h1 || 0,
      pair.liquidity?.usd || 0,
      new Date(pair.pairCreatedAt),
      filterResult.holderData.count,
      filterResult.holderData.topPercentage,
      filterResult.netTraders,
      rugData.score,
      rugData.risks
    ];

    await this.pool.query(query, values);
  }

  async processTokens(chains = ['ethereum', 'bsc', 'polygon']) {
    console.log('Starting token processing...');
    let processedCount = 0;
    let savedCount = 0;

    for (const chainId of chains) {
      console.log(`Processing ${chainId}...`);
      
      const pairs = await this.fetchLatestPairs(chainId);
      console.log(`Found ${pairs.length} pairs on ${chainId}`);

      for (const pair of pairs) {
        try {
          processedCount++;
          
          // Check if we already have this token
          const existingToken = await this.pool.query(
            'SELECT id FROM tokens WHERE pair_address = $1',
            [pair.pairAddress]
          );

          // Skip if token exists and was updated recently (within last hour)
          if (existingToken.rows.length > 0) {
            continue;
          }

          // Get rug score and holder data
          const rugData = await this.checkRugScore(pair.baseToken.address, chainId);
          
          // Apply filters
          const filterResult = await this.filterToken(pair, rugData);
          
          if (filterResult.passed) {
            await this.saveToken(pair, rugData, filterResult);
            savedCount++;
            console.log(`✅ Saved: ${pair.baseToken.symbol} (${pair.baseToken.name})`);
          } else {
            console.log(`❌ Filtered out: ${pair.baseToken.symbol} - ${filterResult.reason}`);
          }

          // Rate limiting
          await this.sleep(200); // 200ms delay between requests
          
        } catch (error) {
          console.error(`Error processing ${pair.baseToken.symbol}:`, error.message);
        }
      }
    }

    console.log(`Processing complete. Processed: ${processedCount}, Saved: ${savedCount}`);
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async getTokens(limit = 50) {
    const query = `
      SELECT * FROM tokens 
      WHERE status = 'active' 
      ORDER BY created_at DESC 
      LIMIT $1
    `;
    
    const result = await this.pool.query(query, [limit]);
    return result.rows;
  }

  startScheduler() {
    // Run every 5 minutes
    cron.schedule('*/5 * * * *', async () => {
      console.log('Running scheduled token scan...');
      await this.processTokens();
    });

    console.log('Scheduler started - running every 5 minutes');
  }

  async close() {
    await this.pool.end();
  }
}

module.exports = TokenMonitor;

// Usage example
if (require.main === module) {
  const monitor = new TokenMonitor();
  
  // Run once immediately
  monitor.processTokens().then(() => {
    // Start scheduler
    monitor.startScheduler();
  }).catch(console.error);
  
  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('Shutting down...');
    await monitor.close();
    process.exit(0);
  });
}