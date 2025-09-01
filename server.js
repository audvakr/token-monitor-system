// server.js - Express API server
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// PostgreSQL connection
const pool = new Pool({
  user: 'your_username',
  host: 'localhost',
  database: 'token_monitor',
  password: 'your_password',
  port: 5432,
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API Routes

// Get all tokens with filters
app.get('/api/tokens', async (req, res) => {
  try {
    const {
      limit = 50,
      offset = 0,
      chain,
      minVolume,
      maxVolume,
      minLiquidity,
      maxLiquidity,
      minHolders,
      maxRugScore,
      sortBy = 'created_at',
      sortOrder = 'DESC'
    } = req.query;

    let query = 'SELECT * FROM tokens WHERE status = $1';
    let params = ['active'];
    let paramCount = 1;

    // Add filters
    if (chain) {
      paramCount++;
      query += ` AND chain_id = $${paramCount}`;
      params.push(chain);
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
    const validSortColumns = ['created_at', 'volume_24h', 'liquidity_usd', 'price_change_24h', 'holders_count'];
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
    
    // Get total count for pagination
    let countQuery = 'SELECT COUNT(*) FROM tokens WHERE status = $1';
    let countParams = ['active'];
    let countParamCount = 1;

    // Add same filters to count query
    if (chain) {
      countParamCount++;
      countQuery += ` AND chain_id = $${countParamCount}`;
      countParams.push(chain);
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

    res.json({
      tokens: result.rows,
      pagination: {
        total: totalCount,
        limit: parseInt(limit),
        offset: parseInt(offset),
        pages: Math.ceil(totalCount / parseInt(limit))
      }
    });

  } catch (error) {
    console.error('Error fetching tokens:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get single token by pair address
app.get('/api/tokens/:pairAddress', async (req, res) => {
  try {
    const { pairAddress } = req.params;
    const result = await pool.query(
      'SELECT * FROM tokens WHERE pair_address = $1',
      [pairAddress]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Token not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching token:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get statistics
app.get('/api/stats', async (req, res) => {
  try {
    const queries = {
      total: 'SELECT COUNT(*) FROM tokens WHERE status = $1',
      chains: `
        SELECT chain_id, COUNT(*) as count 
        FROM tokens WHERE status = $1 
        GROUP BY chain_id 
        ORDER BY count DESC
      `,
      volume24h: 'SELECT SUM(volume_24h) as total_volume FROM tokens WHERE status = $1',
      avgLiquidity: 'SELECT AVG(liquidity_usd) as avg_liquidity FROM tokens WHERE status = $1',
      topVolume: `
        SELECT base_token_symbol, base_token_name, volume_24h, liquidity_usd 
        FROM tokens WHERE status = $1 
        ORDER BY volume_24h DESC 
        LIMIT 10
      `
    };

    const results = {};
    for (const [key, query] of Object.entries(queries)) {
      const result = await pool.query(query, ['active']);
      results[key] = result.rows;
    }

    res.json(results);
  } catch (error) {
    console.error('Error fetching stats:', error);
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
      return res.status(400).json({ error: 'Invalid status' });
    }

    const result = await pool.query(
      'UPDATE tokens SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE pair_address = $2 RETURNING *',
      [status, pairAddress]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Token not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating token status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Serve the HTML dashboard
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

module.exports = app;