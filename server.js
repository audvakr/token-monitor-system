// server.js - Solana-focused Express API server
const express = require('express');
const cors = require('cors');
const path = require('path');
const { db, api, filters, solana, logging, appConfig } = require('./config');
// require('dotenv').config(); // Handled in config/index.js

const app = express();
const PORT = appConfig.port;
const { logger } = logging;

// Use the centralized pool from config
const pool = db.pool;

// Middleware
app.use(cors({ origin: appConfig.corsOrigin }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Request logging middleware
app.use((req, res, next) => {
  logger.debug(`${req.method} ${req.path}`, { query: req.query, body: req.body });
  next();
});

// API Routes

// Get all Solana tokens with filters
app.get('/api/tokens', async (req, res) => {
  try {
    const {
      limit = 50,
      offset = 0,
      dex,
      minVolume = filters.config.minVolume24h,
      maxVolume = filters.config.maxVolume24h,
      minLiquidity = filters.config.minLiquidity,
      maxLiquidity = filters.config.maxLiquidity,
      minHolders = filters.config.minHolders,
      maxRugScore = filters.config.maxRugScore,
      minSOLLiquidity = filters.config.minSOLLiquidity,
      sortBy = 'pair_created_at',
      sortOrder = 'DESC'
    } = req.query;

    let query = 'SELECT * FROM tokens WHERE status = $1 AND chain_id = $2';
    let params = ['active', 'solana'];
    let paramCount = 2;

    // Add Solana-specific filters
    if (dex) {
      // Validate DEX exists on Solana
      if (!solana.validateDEX(dex)) {
        return res.status(400).json({ 
          error: 'Invalid DEX', 
          supportedDEXs: solana.getSupportedDEXs() 
        });
      }
      paramCount++;
      query += ` AND dex_id = $${paramCount}`;
      params.push(dex);
    }

    if (minVolume) {
      paramCount++;
      query += ` AND volume_24h >= $${paramCount}`;
      params.push(parseFloat(minVolume));
    }

    if (maxVolume) {
      paramCount++;
      query += ` AND volume_24h <= $${paramCount}`;
      params.push(parseFloat(maxVolume));
    }

    if (minLiquidity) {
      paramCount++;
      query += ` AND liquidity_usd >= $${paramCount}`;
      params.push(parseFloat(minLiquidity));
    }

    if (maxLiquidity) {
      paramCount++;
      query += ` AND liquidity_usd <= $${paramCount}`;
      params.push(parseFloat(maxLiquidity));
    }

    if (minSOLLiquidity) {
      paramCount++;
      query += ` AND sol_liquidity >= $${paramCount}`;
      params.push(parseFloat(minSOLLiquidity));
    }

    if (minHolders) {
      paramCount++;
      query += ` AND holders_count >= $${paramCount}`;
      params.push(parseInt(minHolders));
    }

    if (maxRugScore) {
      paramCount++;
      query += ` AND rug_score <= $${paramCount}`;
      params.push(parseInt(maxRugScore));
    }

    // Add sorting
    const validSortColumns = [
      'pair_created_at', 'volume_24h', 'liquidity_usd', 'price_change_24h', 
      'holders_count', 'rug_score', 'sol_liquidity', 'price_sol', 'volume_5m', 'price_change_5m'
    ];
    const validSortOrders = ['ASC', 'DESC'];
    
    if (validSortColumns.includes(sortBy) && validSortOrders.includes(sortOrder.toUpperCase())) {
      query += ` ORDER BY ${sortBy} ${sortOrder.toUpperCase()}`;
    }

    // Add pagination
    paramCount++;
    query += ` LIMIT $${paramCount}`;
    params.push(parseInt(limit));

    paramCount++;
    query += ` OFFSET $${paramCount}`;
    params.push(parseInt(offset));

    const result = await pool.query(query, params);
    
    // Get total count for pagination (Solana tokens only)
    let countQuery = 'SELECT COUNT(*) FROM tokens WHERE status = $1 AND chain_id = $2';
    let countParams = ['active', 'solana'];
    let countParamCount = 2;

    // Add same filters to count query
    if (dex) {
      countParamCount++;
      countQuery += ` AND dex_id = $${countParamCount}`;
      countParams.push(dex);
    }

    if (minVolume) {
      countParamCount++;
      countQuery += ` AND volume_24h >= $${countParamCount}`;
      countParams.push(parseFloat(minVolume));
    }

    if (maxVolume) {
      countParamCount++;
      countQuery += ` AND volume_24h <= $${countParamCount}`;
      countParams.push(parseFloat(maxVolume));
    }

    if (minLiquidity) {
      countParamCount++;
      countQuery += ` AND liquidity_usd >= $${countParamCount}`;
      countParams.push(parseFloat(minLiquidity));
    }

    if (maxLiquidity) {
      countParamCount++;
      countQuery += ` AND liquidity_usd <= $${countParamCount}`;
      countParams.push(parseFloat(maxLiquidity));
    }

    if (minSOLLiquidity) {
      countParamCount++;
      countQuery += ` AND sol_liquidity >= $${countParamCount}`;
      countParams.push(parseFloat(minSOLLiquidity));
    }

    if (minHolders) {
      countParamCount++;
      countQuery += ` AND holders_count >= $${countParamCount}`;
      countParams.push(parseInt(minHolders));
    }

    if (maxRugScore) {
      countParamCount++;
      countQuery += ` AND rug_score <= $${countParamCount}`;
      countParams.push(parseInt(maxRugScore));
    }

    const countResult = await pool.query(countQuery, countParams);
    const totalCount = parseInt(countResult.rows[0].count);

    logger.info(`Fetched ${result.rows.length} Solana tokens`, { 
      total: totalCount, 
      limit, 
      offset,
      filters: { dex, minVolume, minLiquidity, minHolders }
    });

    res.json({
      tokens: result.rows,
      pagination: {
        total: totalCount,
        limit: parseInt(limit),
        offset: parseInt(offset),
        pages: Math.ceil(totalCount / parseInt(limit))
      },
      chain: 'solana',
      supportedDEXs: solana.getSupportedDEXs()
    });

  } catch (error) {
    logger.error('Error fetching tokens:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get single Solana token by pair address
app.get('/api/tokens/:pairAddress', async (req, res) => {
  try {
    const { pairAddress } = req.params;
    const result = await pool.query(
      'SELECT * FROM tokens WHERE pair_address = $1 AND chain_id = $2',
      [pairAddress, 'solana']
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Solana token not found' });
    }

    // Add DEX information
    const token = result.rows[0];
    token.dexInfo = solana.getDEXConfig(token.dex_id);
    token.chainInfo = solana.getChainDisplayInfo();

    logger.debug(`Fetched token details: ${token.base_token_symbol}`, { pairAddress });

    res.json(token);
  } catch (error) {
    logger.error('Error fetching token:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get Solana-specific statistics
app.get('/api/stats', async (req, res) => {
  try {
    const queries = {
      total: 'SELECT COUNT(*) FROM tokens WHERE status = $1 AND chain_id = $2',
      totalVolume: 'SELECT SUM(volume_24h) as total_volume FROM tokens WHERE status = $1 AND chain_id = $2',
      avgLiquidity: 'SELECT AVG(liquidity_usd) as avg_liquidity FROM tokens WHERE status = $1 AND chain_id = $2',
    };

    const results = {};
    const queryParams = ['active', 'solana'];
    
    for (const [key, query] of Object.entries(queries)) {
      logger.debug(`Executing stats query for ${key}: ${query}`, { params: queryParams });
      const result = await pool.query(query, queryParams);
      results[key] = result.rows;
    }

    // Add Solana-specific metadata
    results.metadata = {
      chain: 'solana',
      cluster: solana.config.cluster,
      supportedDEXs: solana.getSupportedDEXs(),
      priorityDEXs: solana.getDEXsByPriority(),
      lastUpdated: new Date().toISOString()
    };

    logger.debug('Generated Solana statistics', { 
      totalTokens: results.total[0]?.count || 0,
      // dexCount: results.dexs.length // Removed since 'dexs' query is removed
    });

    res.json(results);
  } catch (error) {
    logger.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get DEX-specific statistics
app.get('/api/stats/dex/:dexId', async (req, res) => {
  try {
    const { dexId } = req.params;
    
    // Validate DEX
    if (!solana.validateDEX(dexId)) {
      return res.status(400).json({ 
        error: 'Invalid DEX', 
        supportedDEXs: solana.getSupportedDEXs() 
      });
    }

    const query = `
      SELECT 
        COUNT(*) as total_tokens,
        AVG(volume_24h) as avg_volume,
        SUM(volume_24h) as total_volume,
        AVG(liquidity_usd) as avg_liquidity,
        SUM(liquidity_usd) as total_liquidity,
        AVG(sol_liquidity) as avg_sol_liquidity,
        SUM(sol_liquidity) as total_sol_liquidity,
        AVG(holders_count) as avg_holders,
        AVG(rug_score) as avg_rug_score,
        AVG(price_sol) as avg_price_sol
      FROM tokens 
      WHERE status = $1 AND chain_id = $2 AND dex_id = $3
    `;

    const result = await pool.query(query, ['active', 'solana', dexId]);
    const dexInfo = solana.getDEXConfig(dexId);

    res.json({
      dex: dexInfo,
      stats: result.rows[0],
      chain: 'solana'
    });

  } catch (error) {
    logger.error(`Error fetching DEX stats for ${req.params.dexId}:`, error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update token status
app.put('/api/tokens/:pairAddress/status', async (req, res) => {
  try {
    const { pairAddress } = req.params;
    const { status } = req.body;

    const validStatuses = ['active', 'flagged', 'rug', 'delisted'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ 
        error: 'Invalid status',
        validStatuses 
      });
    }

    const result = await pool.query(
      'UPDATE tokens SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE pair_address = $2 AND chain_id = $3 RETURNING *',
      [status, pairAddress, 'solana']
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Solana token not found' });
    }

    logger.info(`Token status updated: ${pairAddress} -> ${status}`);
    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Error updating token status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get filter configuration
app.get('/api/config/filters', (req, res) => {
  const filterInstance = new filters.SolanaTokenFilter();
  res.json(filterInstance.getFilterStats());
});

// Get supported DEXs
app.get('/api/config/dexs', (req, res) => {
  const dexs = solana.getSupportedDEXs().map(dexId => ({
    id: dexId,
    ...solana.getDEXConfig(dexId)
  }));
  
  res.json({
    chain: 'solana',
    dexs: dexs.sort((a, b) => a.priority - b.priority)
  });
});

// Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    const health = await require('./config').utils.healthCheck();
    const statusCode = health.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(health);
  } catch (error) {
    logger.error('Health check failed:', error);
    res.status(503).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Get recent activity
app.get('/api/activity', async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    
    const query = `
      SELECT 
        base_token_symbol,
        base_token_name,
        dex_id,
        volume_24h,
        price_change_24h,
        price_sol, -- Include price_sol
        liquidity_usd, -- Include liquidity_usd
        sol_liquidity, -- Include sol_liquidity
        pair_created_at
      FROM tokens 
      WHERE status = 'active' AND chain_id = 'solana'
      ORDER BY pair_created_at DESC 
      LIMIT $1
    `;

    const result = await pool.query(query, [parseInt(limit)]);
    
    // Add DEX info to each token
    const activity = result.rows.map(token => ({
      ...token,
      dexInfo: solana.getDEXConfig(token.dex_id)
    }));

    res.json({
      activity,
      chain: 'solana',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error fetching activity:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Serve the HTML dashboard
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('🔄 Shutting down server...');
  await db.closeDatabase();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('🔄 Shutting down server...');
  await db.closeDatabase();
  process.exit(0);
});

// Start server
const startServer = async () => {
  try {
    // Initialize configuration
    await require('./config').utils.initializeConfig();
    
    app.listen(PORT, () => {
      logger.info(`🟣 Solana Token Monitor API running on http://localhost:${PORT}`);
      logger.info(`🎯 Monitoring DEXs: ${solana.getSupportedDEXs().join(', ')}`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Start the server
startServer();

module.exports = app;