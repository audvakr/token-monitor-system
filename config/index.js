// config/index.js - Solana-focused configuration export
require('dotenv').config();

// Import Solana-specific configuration modules
const { pool, dbConfig, testConnection, closeDatabase } = require('./database');
const { 
  apiConfig, 
  dexScreenerAPI, 
  rugCheckAPI, 
  dexScreenerRateLimiter, 
  rugCheckRateLimiter,
  sleep,
  retryRequest,
  RateLimiter 
} = require('./api');
const { filterConfig, SolanaTokenFilter } = require('./filter');
const {
  solanaConfig,
  solanaDEXs,
  getChainConfig,
  getDEXConfig,
  getSupportedDEXs,
  getDEXsByPriority,
  getStablecoinAddress,
  getWrappedSOLAddress,
  isStablecoin,
  getChainDisplayInfo,
  getDEXTrustScore,
  validateDEX
} = require('./chains');
const { Logger, logger, loggingConfig } = require('./logging');

// Solana-focused application configuration
const appConfig = {
  // Application settings
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT) || 3000,
  debug: process.env.DEBUG === 'true',

  // Monitoring settings optimized for Solana
  scanInterval: parseInt(process.env.SCAN_INTERVAL_MINUTES) || 3, // Faster scanning for Solana
  maxTokensPerScan: parseInt(process.env.MAX_TOKENS_PER_SCAN) || 150, // Higher throughput
  
  // Solana-specific settings
  solanaCluster: process.env.SOLANA_CLUSTER || 'mainnet-beta',
  solanaRpcUrl: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
  
  // CORS settings
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  
  // Rate limiting optimized for Solana APIs
  apiRateLimit: parseInt(process.env.API_RATE_LIMIT_REQUESTS_PER_MINUTE) || 100,
  
  // Notification settings
  webhookUrl: process.env.WEBHOOK_URL || null,
  webhookSecret: process.env.WEBHOOK_SECRET || null,
  
  // Discord webhook for Solana alerts
  discordWebhookUrl: process.env.DISCORD_WEBHOOK_URL || null,
  
  // Telegram settings for Solana alerts
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || null,
  telegramChatId: process.env.TELEGRAM_CHAT_ID || null,
  
  // Email settings
  smtpHost: process.env.SMTP_HOST || null,
  smtpPort: parseInt(process.env.SMTP_PORT) || 587,
  smtpUser: process.env.SMTP_USER || null,
  smtpPass: process.env.SMTP_PASS || null,
  emailFrom: process.env.EMAIL_FROM || null,
  emailTo: process.env.EMAIL_TO || null,

  // Solana-specific monitoring preferences
  priorityDEXs: filterConfig.allowedDEXs, // Use allowedDEXs as default priority
  monitorMemecoins: process.env.MONITOR_MEMECOINS !== 'false',
  monitorNewListings: process.env.MONITOR_NEW_LISTINGS !== 'false',
};

// Validation functions for Solana-focused system
const validateConfig = () => {
  const errors = [];
  
  // Required database configuration
  const requiredDBVars = ['DB_HOST', 'DB_USER', 'DB_NAME'];
  requiredDBVars.forEach(varName => {
    if (!process.env[varName]) {
      errors.push(`Missing required environment variable: ${varName}`);
    }
  });
  
  // Validate Solana DEXs
  const supportedDEXs = getSupportedDEXs();
  const allowedDEXs = filterConfig.allowedDEXs;
  const invalidDEXs = allowedDEXs.filter(dex => !supportedDEXs.includes(dex));
  if (invalidDEXs.length > 0) {
    errors.push(`Invalid DEXs in ALLOWED_DEXS: ${invalidDEXs.join(', ')}. Supported: ${supportedDEXs.join(', ')}`);
  }
  
  // Validate numeric values
  if (appConfig.port < 1 || appConfig.port > 65535) {
    errors.push('PORT must be between 1 and 65535');
  }
  
  if (appConfig.scanInterval < 1) {
    errors.push('SCAN_INTERVAL_MINUTES must be at least 1');
  }
  
  if (filterConfig.minHolders < 1) {
    errors.push('MIN_HOLDERS must be at least 1');
  }

  // Validate Solana cluster
  const validClusters = ['mainnet-beta', 'testnet', 'devnet'];
  if (!validClusters.includes(appConfig.solanaCluster)) {
    errors.push(`Invalid SOLANA_CLUSTER: ${appConfig.solanaCluster}. Valid options: ${validClusters.join(', ')}`);
  }
  
  return errors;
};

// Initialize Solana-focused configuration
const initializeConfig = async () => {
  logger.info('🟣 Initializing Solana token monitoring system...');
  
  // Validate configuration
  const errors = validateConfig();
  if (errors.length > 0) {
    logger.error('❌ Configuration validation failed:', errors);
    process.exit(1);
  }
  
  // Test database connection
  logger.info('🔄 Testing database connection...');
  const dbConnected = await testConnection();
  if (!dbConnected) {
    logger.error('❌ Database connection failed');
    process.exit(1);
  }
  
  // Log Solana-specific configuration summary
  logger.info('✅ Solana monitoring system initialized');
  logger.info('🟣 Solana Configuration Summary:', {
    nodeEnv: appConfig.nodeEnv,
    port: appConfig.port,
    blockchain: 'Solana',
    cluster: appConfig.solanaCluster,
    rpcUrl: appConfig.solanaRpcUrl,
    supportedDEXs: getSupportedDEXs(),
    priorityDEXs: appConfig.priorityDEXs,
    scanInterval: `${appConfig.scanInterval} minutes`,
    maxTokensPerScan: appConfig.maxTokensPerScan,
    logLevel: loggingConfig.level,
    dbHost: dbConfig.host,
    dbName: dbConfig.database,
    filterSummary: {
      minHolders: filterConfig.minHolders,
      minVolume: `$${filterConfig.minVolume24h}`,
      minLiquidity: `$${filterConfig.minLiquidity}`,
      maxTokenAge: `${filterConfig.maxTokenAgeHours}h`,
      maxRugScore: filterConfig.maxRugScore
    }
  });
  
  return true;
};

// Health check for Solana-specific services
const healthCheck = async () => {
  const health = {
    timestamp: new Date().toISOString(),
    status: 'healthy',
    services: {},
    solana: {}
  };

  try {
    // Database health
    const dbStart = Date.now();
    await pool.query('SELECT 1');
    health.services.database = {
      status: 'healthy',
      responseTime: Date.now() - dbStart
    };
  } catch (error) {
    health.services.database = {
      status: 'unhealthy',
      error: error.message
    };
    health.status = 'degraded';
  }

  try {
    // DexScreener API health
    const dexStart = Date.now();
    await dexScreenerAPI.get('/latest/dex/pairs/solana');
    health.services.dexScreener = {
      status: 'healthy',
      responseTime: Date.now() - dexStart
    };
  } catch (error) {
    health.services.dexScreener = {
      status: 'unhealthy',
      error: error.message
    };
    health.status = 'degraded';
  }

  try {
    // Solana RPC health
    const solStart = Date.now();
    const response = await fetch(appConfig.solanaRpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getHealth'
      })
    });
    
    if (response.ok) {
      health.solana.rpc = {
        status: 'healthy',
        responseTime: Date.now() - solStart,
        cluster: appConfig.solanaCluster
      };
    } else {
      throw new Error(`RPC returned ${response.status}`);
    }
  } catch (error) {
    health.solana.rpc = {
      status: 'unhealthy',
      error: error.message
    };
    health.status = 'degraded';
  }

  return health;
};

// Export Solana-focused configurations and utilities
module.exports = {
  // App configuration
  appConfig,
  
  // Database
  db: {
    pool,
    config: dbConfig,
    testConnection,
    closeDatabase
  },
  
  // APIs
  api: {
    config: apiConfig,
    dexScreener: dexScreenerAPI,
    rugCheck: rugCheckAPI,
    rateLimiters: {
      dexScreener: dexScreenerRateLimiter,
      rugCheck: rugCheckRateLimiter
    },
    utils: {
      sleep,
      retryRequest,
      RateLimiter
    }
  },
  
  // Solana-specific filtering
  filters: {
    config: filterConfig,
    SolanaTokenFilter
  },
  
  // Solana chain and DEX configuration
  solana: {
    config: solanaConfig,
    dexs: solanaDEXs,
    getChainConfig,
    getDEXConfig,
    getSupportedDEXs,
    getDEXsByPriority,
    getStablecoinAddress,
    getWrappedSOLAddress,
    isStablecoin,
    getChainDisplayInfo,
    getDEXTrustScore,
    validateDEX
  },
  
  // Logging
  logging: {
    logger,
    Logger,
    config: loggingConfig
  },
  
  // Utilities
  utils: {
    validateConfig,
    initializeConfig,
    healthCheck
  }
};