// config/api.js - API configuration and utilities
require('dotenv').config();
const axios = require('axios');

// API Configuration
const apiConfig = {
  // DexScreener API
  dexScreener: {
    baseURL: process.env.DEXSCREENER_API_URL || 'https://api.dexscreener.com',
    apiKey: process.env.DEXSCREENER_API_KEY || null,
    timeout: 10000, // 10 seconds
    rateLimit: {
      requests: 300, // requests per minute
      interval: 60000 // 1 minute in milliseconds
    }
  },

  // RugCheck API
  rugCheck: {
    baseURL: process.env.RUGCHECK_API_URL || 'https://api.rugcheck.xyz/v1',
    apiKey: process.env.RUGCHECK_API_KEY || null,
    timeout: 15000, // 15 seconds
    rateLimit: {
      requests: 100, // requests per minute (estimated)
      interval: 60000
    }
  },

  // General API settings
  general: {
    rateLimitDelay: parseInt(process.env.RATE_LIMIT_DELAY_MS) || 200,
    maxRetries: 3,
    retryDelay: 1000, // 1 second base delay
  }
};

// Create axios instances with default configurations
const dexScreenerAPI = axios.create({
  baseURL: apiConfig.dexScreener.baseURL,
  timeout: apiConfig.dexScreener.timeout,
  headers: {
    'User-Agent': 'token-monitor-system/1.0.0',
    'Accept': 'application/json',
    'Content-Type': 'application/json'
  }
});

const rugCheckAPI = axios.create({
  baseURL: apiConfig.rugCheck.baseURL,
  timeout: apiConfig.rugCheck.timeout,
  headers: {
    'User-Agent': 'token-monitor-system/1.0.0',
    'Accept': 'application/json',
    'Content-Type': 'application/json'
  }
});

// Add API key to headers if available
if (apiConfig.dexScreener.apiKey) {
  dexScreenerAPI.defaults.headers.common['Authorization'] = `Bearer ${apiConfig.dexScreener.apiKey}`;
}

if (apiConfig.rugCheck.apiKey) {
  rugCheckAPI.defaults.headers.common['Authorization'] = `Bearer ${apiConfig.rugCheck.apiKey}`;
}

// Request interceptors for logging
dexScreenerAPI.interceptors.request.use(
  (config) => {
    if (process.env.DEBUG === 'true') {
      console.log(`📡 DexScreener API Request: ${config.method?.toUpperCase()} ${config.url}`);
    }
    return config;
  },
  (error) => Promise.reject(error)
);

rugCheckAPI.interceptors.request.use(
  (config) => {
    if (process.env.DEBUG === 'true') {
      console.log(`📡 RugCheck API Request: ${config.method?.toUpperCase()} ${config.url}`);
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptors for error handling
dexScreenerAPI.interceptors.response.use(
  (response) => {
    if (process.env.DEBUG === 'true') {
      console.log(`✅ DexScreener API Response: ${response.status} ${response.config.url}`);
    }
    return response;
  },
  (error) => {
    if (error.response) {
      console.error(`❌ DexScreener API Error: ${error.response.status} ${error.response.statusText}`);
      if (error.response.status === 429) {
        console.warn('⚠️ DexScreener rate limit hit - consider increasing delays');
      }
    } else if (error.request) {
      console.error('❌ DexScreener API: No response received');
    } else {
      console.error('❌ DexScreener API Error:', error.message);
    }
    return Promise.reject(error);
  }
);

rugCheckAPI.interceptors.response.use(
  (response) => {
    if (process.env.DEBUG === 'true') {
      console.log(`✅ RugCheck API Response: ${response.status} ${response.config.url}`);
    }
    return response;
  },
  (error) => {
    if (error.response) {
      console.error(`❌ RugCheck API Error: ${error.response.status} ${error.response.statusText}`);
      if (error.response.status === 429) {
        console.warn('⚠️ RugCheck rate limit hit - consider increasing delays');
      }
    } else if (error.request) {
      console.error('❌ RugCheck API: No response received');
    } else {
      console.error('❌ RugCheck API Error:', error.message);
    }
    return Promise.reject(error);
  }
);

// Utility function to handle API rate limiting
async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Utility function for retrying failed requests
async function retryRequest(requestFn, maxRetries = apiConfig.general.maxRetries) {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await requestFn();
    } catch (error) {
      lastError = error;
      
      if (attempt === maxRetries) {
        throw error;
      }
      
      // Exponential backoff: 1s, 2s, 4s, etc.
      const delay = apiConfig.general.retryDelay * Math.pow(2, attempt - 1);
      console.warn(`⚠️ Request failed (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms...`);
      await sleep(delay);
    }
  }
  
  throw lastError;
}

// Rate limiting utility
class RateLimiter {
  constructor(requests, interval) {
    this.requests = requests;
    this.interval = interval;
    this.requestTimes = [];
  }

  async acquire() {
    const now = Date.now();
    
    // Remove old requests outside the interval
    this.requestTimes = this.requestTimes.filter(time => now - time < this.interval);
    
    // If we're at the limit, wait
    if (this.requestTimes.length >= this.requests) {
      const oldestRequest = Math.min(...this.requestTimes);
      const waitTime = this.interval - (now - oldestRequest);
      
      if (waitTime > 0) {
        console.log(`⏱️ Rate limit reached, waiting ${waitTime}ms...`);
        await sleep(waitTime);
      }
    }
    
    this.requestTimes.push(now);
  }
}

// Create rate limiters for each API
const dexScreenerRateLimiter = new RateLimiter(
  apiConfig.dexScreener.rateLimit.requests,
  apiConfig.dexScreener.rateLimit.interval
);

const rugCheckRateLimiter = new RateLimiter(
  apiConfig.rugCheck.rateLimit.requests,
  apiConfig.rugCheck.rateLimit.interval
);

// Export configuration and utilities
module.exports = {
  apiConfig,
  dexScreenerAPI,
  rugCheckAPI,
  dexScreenerRateLimiter,
  rugCheckRateLimiter,
  sleep,
  retryRequest,
  RateLimiter
};