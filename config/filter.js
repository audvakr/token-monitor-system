// config/filters.js - Token filtering configuration and logic
require('dotenv').config();

// Filter configuration from environment variables
const filterConfig = {
  // Holder requirements
  minHolders: parseInt(process.env.MIN_HOLDERS) || 50,
  maxTopHolderPercentage: parseFloat(process.env.MAX_TOP_HOLDER_PERCENTAGE) || 50,

  // Volume requirements (USD)
  minVolume24h: parseFloat(process.env.MIN_VOLUME_24H) || 1000,
  maxVolume24h: parseFloat(process.env.MAX_VOLUME_24H) || null, // No upper limit by default

  // Liquidity requirements (USD)
  minLiquidity: parseFloat(process.env.MIN_LIQUIDITY) || 5000,
  maxLiquidity: parseFloat(process.env.MAX_LIQUIDITY) || null, // No upper limit by default

  // Trading activity
  minNetTraders: parseInt(process.env.MIN_NET_TRADERS) || 10,

  // Token age requirements
  maxTokenAgeHours: parseInt(process.env.MAX_TOKEN_AGE_HOURS) || 24,
  minTokenAgeMinutes: parseInt(process.env.MIN_TOKEN_AGE_MINUTES) || 5, // Avoid brand new tokens

  // Risk assessment
  maxRugScore: parseInt(process.env.MAX_RUG_SCORE) || 7,
  blockedRiskTypes: (process.env.BLOCKED_RISK_TYPES || 'honeypot,mint_function,proxy_contract').split(','),

  // Price change filters (optional)
  maxPriceChange24h: parseFloat(process.env.MAX_PRICE_CHANGE_24H) || null, // No pump filter by default
  minPriceChange24h: parseFloat(process.env.MIN_PRICE_CHANGE_24H) || null, // No dump filter by default

  // DEX and Chain filters
  allowedDEXs: process.env.ALLOWED_DEXS ? process.env.ALLOWED_DEXS.split(',') : null, // All DEXs by default
  blockedDEXs: process.env.BLOCKED_DEXS ? process.env.BLOCKED_DEXS.split(',') : [],
  allowedChains: process.env.SUPPORTED_CHAINS ? process.env.SUPPORTED_CHAINS.split(',') : ['ethereum', 'bsc', 'polygon'],

  // Market cap estimates (optional)
  minMarketCapUSD: parseFloat(process.env.MIN_MARKET_CAP_USD) || null,
  maxMarketCapUSD: parseFloat(process.env.MAX_MARKET_CAP_USD) || null,
};

// Filter functions
class TokenFilter {
  constructor(config = filterConfig) {
    this.config = config;
  }

  // Calculate holder distribution from RugCheck data
  calculateHolderDistribution(holdersData) {
    if (!holdersData || !holdersData.top) {
      return { count: 0, topPercentage: 100 };
    }
    
    const holders = holdersData.top;
    const totalSupply = holdersData.total || 1;
    
    let topHolderPercentage = 0;
    if (holders.length > 0) {
      topHolderPercentage = (holders[0].balance / totalSupply) * 100;
    }

    return {
      count: holdersData.count || holders.length,
      topPercentage: topHolderPercentage,
      distribution: holders.map(holder => ({
        address: holder.address,
        balance: holder.balance,
        percentage: (holder.balance / totalSupply) * 100
      }))
    };
  }

  // Estimate market cap from price and liquidity
  estimateMarketCap(pair) {
    // This is a rough estimation - actual market cap would need total supply
    const price = parseFloat(pair.priceUsd) || 0;
    const liquidity = pair.liquidity?.usd || 0;
    
    // Rough estimate: assume liquidity represents ~5% of market cap
    return liquidity * 20; // Very rough approximation
  }

  // Main filtering function
  async filterToken(pair, rugData = {}) {
    const filters = [];
    
    // Basic validation
    if (!pair || !pair.pairAddress) {
      return { passed: false, reason: 'Invalid pair data', filters: ['validation'] };
    }

    // Age filters
    const now = Date.now();
    const tokenAge = now - (pair.pairCreatedAt || now);
    const tokenAgeHours = tokenAge / (1000 * 60 * 60);
    const tokenAgeMinutes = tokenAge / (1000 * 60);

    if (tokenAgeHours > this.config.maxTokenAgeHours) {
      filters.push('age_max');
      return { 
        passed: false, 
        reason: `Token too old: ${tokenAgeHours.toFixed(1)} hours (max: ${this.config.maxTokenAgeHours})`,
        filters 
      };
    }

    if (tokenAgeMinutes < this.config.minTokenAgeMinutes) {
      filters.push('age_min');
      return { 
        passed: false, 
        reason: `Token too new: ${tokenAgeMinutes.toFixed(1)} minutes (min: ${this.config.minTokenAgeMinutes})`,
        filters 
      };
    }

    // Chain filter
    if (!this.config.allowedChains.includes(pair.chainId)) {
      filters.push('chain');
      return { 
        passed: false, 
        reason: `Chain not allowed: ${pair.chainId}`,
        filters 
      };
    }

    // DEX filters
    if (this.config.blockedDEXs.includes(pair.dexId)) {
      filters.push('dex_blocked');
      return { 
        passed: false, 
        reason: `DEX blocked: ${pair.dexId}`,
        filters 
      };
    }

    if (this.config.allowedDEXs && !this.config.allowedDEXs.includes(pair.dexId)) {
      filters.push('dex_allowed');
      return { 
        passed: false, 
        reason: `DEX not in allowed list: ${pair.dexId}`,
        filters 
      };
    }

    // Volume filters
    const volume24h = pair.volume?.h24 || 0;
    
    if (volume24h < this.config.minVolume24h) {
      filters.push('volume_min');
      return { 
        passed: false, 
        reason: `Volume too low: $${volume24h.toLocaleString()} (min: $${this.config.minVolume24h.toLocaleString()})`,
        filters 
      };
    }

    if (this.config.maxVolume24h && volume24h > this.config.maxVolume24h) {
      filters.push('volume_max');
      return { 
        passed: false, 
        reason: `Volume too high: $${volume24h.toLocaleString()} (max: $${this.config.maxVolume24h.toLocaleString()})`,
        filters 
      };
    }

    // Liquidity filters
    const liquidity = pair.liquidity?.usd || 0;
    
    if (liquidity < this.config.minLiquidity) {
      filters.push('liquidity_min');
      return { 
        passed: false, 
        reason: `Liquidity too low: $${liquidity.toLocaleString()} (min: $${this.config.minLiquidity.toLocaleString()})`,
        filters 
      };
    }

    if (this.config.maxLiquidity && liquidity > this.config.maxLiquidity) {
      filters.push('liquidity_max');
      return { 
        passed: false, 
        reason: `Liquidity too high: $${liquidity.toLocaleString()} (max: $${this.config.maxLiquidity.toLocaleString()})`,
        filters 
      };
    }

    // Price change filters
    const priceChange24h = pair.priceChange?.h24 || 0;
    
    if (this.config.maxPriceChange24h && priceChange24h > this.config.maxPriceChange24h) {
      filters.push('price_change_max');
      return { 
        passed: false, 
        reason: `Price pump too high: ${priceChange24h.toFixed(2)}% (max: ${this.config.maxPriceChange24h}%)`,
        filters 
      };
    }

    if (this.config.minPriceChange24h && priceChange24h < this.config.minPriceChange24h) {
      filters.push('price_change_min');
      return { 
        passed: false, 
        reason: `Price dump too low: ${priceChange24h.toFixed(2)}% (min: ${this.config.minPriceChange24h}%)`,
        filters 
      };
    }

    // Holder distribution analysis
    const holderData = this.calculateHolderDistribution(rugData.holders);
    
    if (holderData.count < this.config.minHolders) {
      filters.push('holders_min');
      return { 
        passed: false, 
        reason: `Not enough holders: ${holderData.count} (min: ${this.config.minHolders})`,
        filters 
      };
    }

    if (holderData.topPercentage > this.config.maxTopHolderPercentage) {
      filters.push('holder_concentration');
      return { 
        passed: false, 
        reason: `Top holder owns too much: ${holderData.topPercentage.toFixed(2)}% (max: ${this.config.maxTopHolderPercentage}%)`,
        filters 
      };
    }

    // Rug score filter
    const rugScore = rugData.score || 0;
    if (rugScore > this.config.maxRugScore) {
      filters.push('rug_score');
      return { 
        passed: false, 
        reason: `Rug score too high: ${rugScore} (max: ${this.config.maxRugScore})`,
        filters 
      };
    }

    // Risk type filters
    const risks = rugData.risks || [];
    const blockedRisks = risks.filter(risk => this.config.blockedRiskTypes.includes(risk));
    if (blockedRisks.length > 0) {
      filters.push('risk_types');
      return { 
        passed: false, 
        reason: `Blocked risk types found: ${blockedRisks.join(', ')}`,
        filters 
      };
    }

    // Net traders estimation (rough calculation from volume)
    const netTraders = Math.floor(volume24h / 100); // Very rough estimation
    if (netTraders < this.config.minNetTraders) {
      filters.push('net_traders');
      return { 
        passed: false, 
        reason: `Not enough estimated traders: ${netTraders} (min: ${this.config.minNetTraders})`,
        filters 
      };
    }

    // Market cap filters (if enabled)
    if (this.config.minMarketCapUSD || this.config.maxMarketCapUSD) {
      const estimatedMarketCap = this.estimateMarketCap(pair);
      
      if (this.config.minMarketCapUSD && estimatedMarketCap < this.config.minMarketCapUSD) {
        filters.push('market_cap_min');
        return { 
          passed: false, 
          reason: `Market cap too low: ~$${estimatedMarketCap.toLocaleString()} (min: $${this.config.minMarketCapUSD.toLocaleString()})`,
          filters 
        };
      }

      if (this.config.maxMarketCapUSD && estimatedMarketCap > this.config.maxMarketCapUSD) {
        filters.push('market_cap_max');
        return { 
          passed: false, 
          reason: `Market cap too high: ~$${estimatedMarketCap.toLocaleString()} (max: $${this.config.maxMarketCapUSD.toLocaleString()})`,
          filters 
        };
      }
    }

    // If we get here, the token passed all filters
    return { 
      passed: true, 
      holderData,
      netTraders,
      rugScore,
      risks,
      estimatedMarketCap: this.estimateMarketCap(pair),
      filters: [] // No failing filters
    };
  }

  // Get current configuration
  getConfig() {
    return { ...this.config };
  }

  // Update configuration
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
  }
}

// Export filter configuration and class
module.exports = {
  filterConfig,
  TokenFilter
};