// config/index.js - Central configuration export
require('dotenv').config();

// Import all configuration modules
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
const { filterConfig, TokenFilter } = require('./filters');
const {
  chainConfigs,
  dexConfigs,
  getSupportedChains,
  getChainConfig,
  getDEXConfig,
  getChainsByPriority
} = require('./chains');
const { Logger, logger, loggingConfig } = require('./logging');

// Application configuration from environment variables
const appConfig = {
  // Application settings
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT) || 3000,
  debug: process.env.DEBUG === 'true',

  // Monitoring settings
  scanInterval: parseInt(process.env.SCAN_INTERVAL_MINUTES) || 5,
  maxTokensPerScan: parseInt(process.env.MAX_TOKENS_PER_SCAN) || 100,
  
  // CORS settings
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  
  // Rate limiting
  apiRateLimit: parseInt(process.env.API_RATE_LIMIT_REQUESTS_PER_MINUTE) || 60,
  
  // Webhook settings
  webhookUrl: process.env.WEBHOOK_URL || null,
  webhookSecret: process.env.WEBHOOK_SECRET || null,
  
  // Email settings
  smtpHost: process.env.SMTP_HOST || null,
  smtpPort: parseInt(process.env.SMTP_PORT) || 587,
  smtpUser: process.env.SMTP_USER || null,
  smtpPass: process.env.SMTP_PASS || null,
  emailFrom: process.env.EMAIL_FROM || null,
  emailTo: process.env.EMAIL_TO || null,
};

// Validation functions
const validateConfig = () => {
  const errors = [];
  
  // Required database configuration
  const requiredDBVars = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
  requiredDBVars.forEach(varName => {
    if (!process.env[varName]) {
      errors.push(`Missing required environment variable: ${varName}`);
    }
  });
  
  // Validate supported chains
  const supportedChains = getSupportedChains();
  const validChains = Object.keys(chainConfigs);
  const invalidChains = supportedChains.filter(chain => !validChains.includes(chain));
  if (invalidChains.length > 0) {
    errors.push(`Invalid chains in SUPPORTED_CHAINS: ${invalidChains.join(', ')}`);
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
  
  return errors;
};

// Initialize configuration
const initializeConfig = async () => {
  logger.info('🔧 Initializing configuration...');
  
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
  
  // Log configuration summary
  logger.info('✅ Configuration initialized successfully');
  logger.info('📊 Configuration Summary:', {
    nodeEnv: appConfig.nodeEnv,
    port: appConfig.port,
    supportedChains: getSupportedChains(),
    scanInterval: `${appConfig.scanInterval} minutes`,
    logLevel: loggingConfig.level,
    dbHost: dbConfig.host,
    dbName: dbConfig.database,
  });
  
  return true;
};

// Export all configurations and utilities
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
  
  // Filtering
  filters: {
    config: filterConfig,
    TokenFilter
  },
  
  // Chains and DEXs
  chains: {
    configs: chainConfigs,
    dexConfigs,
    getSupportedChains,
    getChainConfig,
    getDEXConfig,
    getChainsByPriority
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
    initializeConfig
  }
};