// token-monitor.js - Solana-focused token monitoring application
const cron = require('node-cron');
const { db, api, filters, solana, logging, appConfig } = require('./config');

const { logger } = logging;
const { dexScreenerAPI, rugCheckAPI, dexScreenerRateLimiter, rugCheckRateLimiter, sleep, retryRequest } = api;

class SolanaTokenMonitor {
  constructor() {
    // Use centralized database pool
    this.pool = db.pool;
    
    // Use Solana-specific filter
    this.tokenFilter = new filters.SolanaTokenFilter(filters.config); // Pass the filterConfig here
    
    // Solana configuration
    this.chainId = 'solana';
    this.supportedDEXs = solana.getSupportedDEXs();
    this.priorityDEXs = appConfig.priorityDEXs;
    
    // Monitoring configuration
    this.config = {
      maxTokensPerScan: appConfig.maxTokensPerScan,
      scanInterval: appConfig.scanInterval,
      rateLimitDelay: 150 // Faster for Solana
    };

    logger.info('🟣 Solana Token Monitor initialized', {
      supportedDEXs: this.supportedDEXs,
      priorityDEXs: this.priorityDEXs,
      maxTokensPerScan: this.config.maxTokensPerScan
    });
  }

  async fetchLatestSolanaPairs() {
    try {
      await dexScreenerRateLimiter.acquire();
      
      const response = await retryRequest(async () => {
        return await dexScreenerAPI.get('/latest/dex/pairs/solana');
      });

      const pairs = response.data.pairs || [];
      
      // Filter by supported DEXs and prioritize
      const filteredPairs = pairs
        .filter(pair => this.supportedDEXs.includes(pair.dexId))
        .sort((a, b) => {
          // Prioritize based on DEX preference
          const aPriority = this.priorityDEXs.indexOf(a.dexId);
          const bPriority = this.priorityDEXs.indexOf(b.dexId);
          
          if (aPriority !== -1 && bPriority !== -1) {
            return aPriority - bPriority;
          }
          if (aPriority !== -1) return -1;
          if (bPriority !== -1) return 1;
          
          // Sort by volume if no priority preference
          return (b.volume?.h24 || 0) - (a.volume?.h24 || 0);
        });

      logger.info(`Fetched ${pairs.length} Solana pairs, ${filteredPairs.length} from supported DEXs`);
      return filteredPairs.slice(0, this.config.maxTokensPerScan);
      
    } catch (error) {
      logger.error('Error fetching Solana pairs from DexScreener:', error);
      return [];
    }
  }

  async checkSolanaRugScore(tokenAddress) {
    try {
      await rugCheckRateLimiter.acquire();
      
      const response = await retryRequest(async () => {
        return await rugCheckAPI.get(`/tokens/${tokenAddress}/report`);
      });

      const data = response.data;
      
      return {
        score: data.score || 0,
        risks: data.risks || [],
        holders: data.holders || {},
        freezeAuthority: data.freezeAuthority || null,
        mintAuthority: data.mintAuthority || null,
        updateAuthority: data.updateAuthority || null,
        isMutable: data.isMutable !== false,
        supply: data.supply || {},
        markets: data.markets || []
      };
      
    } catch (error) {
      logger.warn(`Error checking rug score for Solana token ${tokenAddress}:`, error.message);
      return {
        score: 5, // Default medium risk when data unavailable
        risks: ['data_unavailable'],
        holders: {},
        freezeAuthority: null,
        mintAuthority: null,
        updateAuthority: null,
        isMutable: true,
        supply: {},
        markets: []
      };
    }
  }

  async checkExistingToken(pairAddress) {
    try {
      const result = await this.pool.query(
        'SELECT id, updated_at FROM tokens WHERE pair_address = $1',
        [pairAddress]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const token = result.rows[0];
      const lastUpdate = new Date(token.updated_at);
      const now = new Date();
      const hoursSinceUpdate = (now - lastUpdate) / (1000 * 60 * 60);

      // Update if more than 1 hour old
      return hoursSinceUpdate < 1 ? token : null;
      
    } catch (error) {
      logger.error('Error checking existing token:', error);
      return null;
    }
  }

  async saveSolanaToken(pair, rugData, filterResult) {
    const query = `
      INSERT INTO tokens (
        pair_address, chain_id, dex_id, base_token_address, base_token_name, 
        base_token_symbol, quote_token_address, quote_token_symbol, price_usd, price_sol,
        volume_24h, volume_6h, volume_1h, volume_5m, price_change_24h, price_change_6h, 
        price_change_1h, price_change_5m, liquidity_usd, sol_liquidity, pair_created_at, 
        holders_count, top_holder_percentage, net_traders, rug_score, rug_risks,
        freeze_authority, mint_authority, update_authority, is_mutable
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, 
        $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30
      ) ON CONFLICT (pair_address) DO UPDATE SET
        price_usd = EXCLUDED.price_usd,
        price_sol = EXCLUDED.price_sol,
        volume_24h = EXCLUDED.volume_24h,
        volume_6h = EXCLUDED.volume_6h,
        volume_1h = EXCLUDED.volume_1h,
        volume_5m = EXCLUDED.volume_5m,
        price_change_24h = EXCLUDED.price_change_24h,
        price_change_6h = EXCLUDED.price_change_6h,
        price_change_1h = EXCLUDED.price_change_1h,
        price_change_5m = EXCLUDED.price_change_5m,
        liquidity_usd = EXCLUDED.liquidity_usd,
        sol_liquidity = EXCLUDED.sol_liquidity,
        holders_count = EXCLUDED.holders_count,
        top_holder_percentage = EXCLUDED.top_holder_percentage,
        net_traders = EXCLUDED.net_traders,
        rug_score = EXCLUDED.rug_score,
        rug_risks = EXCLUDED.rug_risks,
        freeze_authority = EXCLUDED.freeze_authority,
        mint_authority = EXCLUDED.mint_authority,
        update_authority = EXCLUDED.update_authority,
        is_mutable = EXCLUDED.is_mutable,
        updated_at = CURRENT_TIMESTAMP
      RETURNING id, base_token_symbol
    `;

    // Calculate SOL liquidity
    const solPrice = parseFloat(pair.priceNative) || 0;
    const liquidityUSD = pair.liquidity?.usd || 0;
    const solLiquidity = solPrice > 0 ? (liquidityUSD / solPrice) : 0;

    const values = [
      pair.pairAddress,
      'solana', // Always Solana
      pair.dexId,
      pair.baseToken.address,
      pair.baseToken.name,
      pair.baseToken.symbol,
      pair.quoteToken.address,
      pair.quoteToken.symbol,
      parseFloat(pair.priceUsd) || 0,
      parseFloat(pair.priceNative) || 0, // price_sol
      pair.volume?.h24 || 0,
      pair.volume?.h6 || 0,
      pair.volume?.h1 || 0,
      pair.volume?.m5 || 0, // volume_5m
      pair.priceChange?.h24 || 0,
      pair.priceChange?.h6 || 0,
      pair.priceChange?.h1 || 0,
      pair.priceChange?.m5 || 0, // price_change_5m
      liquidityUSD,
      solLiquidity, // sol_liquidity
      new Date(pair.pairCreatedAt),
      filterResult.holderData.count,
      filterResult.holderData.topPercentage,
      filterResult.netTraders,
      rugData.score,
      rugData.risks,
      rugData.freezeAuthority,
      rugData.mintAuthority,
      rugData.updateAuthority,
      rugData.isMutable
    ];

    const result = await this.pool.query(query, values);
    return result.rows[0];
  }

  async processSolanaTokens() {
    logger.info('🟣 Starting Solana token processing...');
    
    const startTime = Date.now();
    let processedCount = 0;
    let savedCount = 0;
    let filteredCount = 0;

    try {
      const pairs = await this.fetchLatestSolanaPairs();
      logger.info(`Processing ${pairs.length} Solana pairs`);

      for (const pair of pairs) {
        try {
          processedCount++;
          
          // Check if we already have recent data for this token
          const existingToken = await this.checkExistingToken(pair.pairAddress);
          if (existingToken) {
            logger.trace(`Skipping recently updated token: ${pair.baseToken.symbol}`);
            continue;
          }

          // Get Solana-specific rug data
          const rugData = await this.checkSolanaRugScore(pair.baseToken.address);
          
          // Apply Solana-optimized filters
          const filterResult = await this.tokenFilter.filterToken(pair, rugData);
          
          if (filterResult.passed) {
            const savedToken = await this.saveSolanaToken(pair, rugData, filterResult);
            savedCount++;
            
            logger.logTokenProcessing('SAVED', pair.baseToken.symbol, 'Passed all filters', {
              dex: pair.dexId,
              volume24h: pair.volume?.h24 || 0,
              liquidity: pair.liquidity?.usd || 0,
              holders: filterResult.holderData.count,
              rugScore: rugData.score
            });
            
            // Send alert for high-quality tokens
            if (this.shouldAlert(pair, rugData, filterResult)) {
              await this.sendAlert(pair, rugData, filterResult);
            }
            
          } else {
            filteredCount++;
            logger.logTokenProcessing('FILTERED', pair.baseToken.symbol, filterResult.reason, {
              dex: pair.dexId,
              filters: filterResult.filters
            });
          }

          // Solana-optimized rate limiting
          await sleep(this.config.rateLimitDelay);
          
        } catch (error) {
          logger.logTokenProcessing('ERROR', pair.baseToken?.symbol || 'Unknown', error.message);
        }
      }

      const duration = Date.now() - startTime;
      logger.info('🎉 Solana token processing complete', {
        duration: `${duration}ms`,
        processed: processedCount,
        saved: savedCount,
        filtered: filteredCount,
        successRate: `${((savedCount / processedCount) * 100).toFixed(1)}%`
      });

    } catch (error) {
      logger.error('Error in Solana token processing:', error);
    }
  }

  // Determine if token should trigger an alert
  shouldAlert(pair, rugData, filterResult) {
    const volume24h = pair.volume?.h24 || 0;
    const liquidity = pair.liquidity?.usd || 0;
    const rugScore = rugData.score || 10;
    const holders = filterResult.holderData.count;

    // Alert criteria for promising Solana tokens - using filterConfig now
    return (
      volume24h > filters.config.minVolume24h && 
      liquidity > filters.config.minLiquidity &&
      rugScore <= filters.config.maxRugScore && 
      holders >= filters.config.minHolders && 
      filterResult.holderData.topPercentage <= filters.config.maxTopHolderPercentage
    );
  }

  // Send alert for promising tokens
  async sendAlert(pair, rugData, filterResult) {
    const alertData = {
      symbol: pair.baseToken.symbol,
      name: pair.baseToken.name,
      dex: pair.dexId,
      dexName: solana.getDEXConfig(pair.dexId).name,
      price: pair.priceUsd,
      priceSOL: pair.priceNative,
      volume24h: pair.volume?.h24 || 0,
      priceChange24h: pair.priceChange?.h24 || 0,
      liquidity: pair.liquidity?.usd || 0,
      solLiquidity: filterResult.solLiquidity,
      holders: filterResult.holderData.count,
      topHolderPerc: filterResult.holderData.topPercentage,
      rugScore: rugData.score,
      risks: rugData.risks,
      pairAddress: pair.pairAddress,
      tokenAddress: pair.baseToken.address,
      dexscreenerUrl: `https://dexscreener.com/solana/${pair.pairAddress}`,
      timestamp: new Date().toISOString()
    };

    logger.info('🚨 SOLANA ALERT: Promising token detected!', alertData);

    // TODO: Implement webhook, Discord, Telegram notifications here
    // Example webhook call:
    if (appConfig.webhookUrl) {
      try {
        await api.dexScreenerAPI.post(appConfig.webhookUrl, {
          type: 'solana_token_alert',
          data: alertData
        });
      } catch (error) {
        logger.warn('Failed to send webhook alert:', error.message);
      }
    }
  }

  async getSolanaTokens(limit = 50, filters = {}) {
    try {
      let query = `
        SELECT * FROM active_solana_tokens 
        WHERE 1=1
      `;
      let params = [];
      let paramCount = 0;

      // Apply additional filters
      if (filters.dex) {
        paramCount++;
        query += ` AND dex_id = $${paramCount}`;
        params.push(filters.dex);
      }

      if (filters.minVolume) {
        paramCount++;
        query += ` AND volume_24h >= $${paramCount}`;
        params.push(parseFloat(filters.minVolume));
      }

      if (filters.maxRugScore) {
        paramCount++;
        query += ` AND rug_score <= $${paramCount}`;
        params.push(parseInt(filters.maxRugScore));
      }

      query += ` ORDER BY volume_24h DESC LIMIT $${paramCount + 1}`;
      params.push(parseInt(limit));

      const result = await this.pool.query(query, params);
      return result.rows;
      
    } catch (error) {
      logger.error('Error fetching Solana tokens:', error);
      return [];
    }
  }

  async getSolanaStats() {
    try {
      const queries = {
        total: 'SELECT COUNT(*) as count FROM tokens WHERE status = $1 AND chain_id = $2',
        byDEX: `
          SELECT dex_id, COUNT(*) as count, SUM(volume_24h) as total_volume, AVG(rug_score) as avg_rug_score
          FROM tokens WHERE status = $1 AND chain_id = $2
          GROUP BY dex_id 
          ORDER BY total_volume DESC
        `,
        totalMetrics: `
          SELECT 
            SUM(volume_24h) as total_volume,
            AVG(volume_24h) as avg_volume,
            SUM(liquidity_usd) as total_liquidity,
            AVG(liquidity_usd) as avg_liquidity,
            SUM(sol_liquidity) as total_sol_liquidity,
            AVG(sol_liquidity) as avg_sol_liquidity,
            AVG(holders_count) as avg_holders,
            AVG(rug_score) as avg_rug_score
          FROM tokens WHERE status = $1 AND chain_id = $2
        `,
        riskDistribution: `
          SELECT risk_level, COUNT(*) as count
          FROM solana_token_risks
          GROUP BY risk_level
          ORDER BY 
            CASE risk_level
              WHEN 'Low' THEN 1
              WHEN 'Medium' THEN 2
              WHEN 'High' THEN 3
              WHEN 'Very High' THEN 4
            END
        `
      };

      const results = {};
      const params = ['active', 'solana'];
      
      for (const [key, query] of Object.entries(queries)) {
        const result = await this.pool.query(query, params);
        results[key] = result.rows;
      }

      return {
        ...results,
        chain: 'solana',
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      logger.error('Error fetching Solana stats:', error);
      return null;
    }
  }

  startScheduler() {
    // Convert minutes to cron format
    const cronExpression = `*/${appConfig.scanInterval} * * * *`;
    
    cron.schedule(cronExpression, async () => {
      logger.info('🔄 Running scheduled Solana token scan...');
      await this.processSolanaTokens();
    });

    logger.info(`🟣 Solana scheduler started - running every ${appConfig.scanInterval} minutes`);
  }

  // Manual scan trigger
  async runScan() {
    logger.info('🔄 Manual Solana token scan initiated');
    await this.processSolanaTokens();
  }

  // Get filter statistics
  getFilterConfig() {
    return this.tokenFilter.getFilterStats();
  }

  // Update filter configuration
  updateFilters(newConfig) {
    this.tokenFilter.updateConfig(newConfig);
    logger.info('Filter configuration updated', newConfig);
  }

  async close() {
    logger.info('🔄 Closing Solana Token Monitor...');
    await db.closeDatabase();
    logger.info('✅ Solana Token Monitor closed');
  }
}

module.exports = SolanaTokenMonitor;

// Usage example
if (require.main === module) {
  const monitor = new SolanaTokenMonitor();
  
  // Initialize and run
  (async () => {
    try {
      // Test database connection
      await db.testConnection();
      
      // Run initial scan
      await monitor.runScan();
      
      // Start scheduled scanning
      monitor.startScheduler();
      
      logger.info('🟣 Solana Token Monitor running successfully');
      
    } catch (error) {
      logger.error('Failed to start Solana Token Monitor:', error);
      process.exit(1);
    }
  })();
  
  // Graceful shutdown
  process.on('SIGINT', async () => {
    logger.info('🔄 Shutting down Solana Token Monitor...');
    await monitor.close();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    logger.info('🔄 Shutting down Solana Token Monitor...');
    await monitor.close();
    process.exit(0);
  });
}