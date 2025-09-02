// config/filters.js - Solana-optimized token filtering configuration

// Solana-specific filter configuration
const filterConfig = {
  // Holder requirements (Solana typical values)
  minHolders: 10, // Lower threshold for Solana
  maxTopHolderPercentage: 40, // Slightly more lenient

  // Volume requirements (USD) - Solana has lower fees, so smaller volumes are viable
  minVolume24h: 10, // Lower minimum for Solana
  maxVolume24h: null,

  // Liquidity requirements (USD) - Solana DEXs typically have lower liquidity requirements
  minLiquidity: 100, // Lower for Solana ecosystem
  maxLiquidity: null,

  // Trading activity - Solana's fast transactions enable more traders
  minNetTraders: 5,

  // Token age requirements - Solana tokens can move faster
  maxTokenAgeHours: 24,
  minTokenAgeMinutes: 3, // Faster for Solana

  // Solana-specific risk assessment
  maxRugScore: 6, // Slightly more strict
  blockedRiskTypes: ['honeypot', 'mint_function', 'proxy_contract', 'freeze_authority'],

  // Price change filters
  maxPriceChange24h: null,
  minPriceChange24h: null,

  // Solana DEX filters
  allowedDEXs: ['raydium', 'orca', 'jupiter'],
  blockedDEXs: [],

  // Market cap estimates for Solana tokens
  minMarketCapUSD: null,
  maxMarketCapUSD: null,

  // Solana-specific filters
  minSOLLiquidity: 5, // Minimum SOL in liquidity pool
  maxSlippage: 5, // Maximum expected slippage %
};

// Solana-focused token filter class
class SolanaTokenFilter {
  constructor(config = filterConfig) {
    this.config = config;
    this.chainId = 'solana';
  }

  // Calculate holder distribution for Solana tokens
  calculateHolderDistribution(holdersData) {
    if (!holdersData || !holdersData.top) {
      return { count: 0, topPercentage: 100 };
    }
    
    const holders = holdersData.top;
    const totalSupply = holdersData.total || 1;
    
    let topHolderPercentage = 0;
    if (holders.length > 0) {
      // For Solana, exclude burn addresses and program accounts
      const realHolders = holders.filter(holder => 
        !this.isBurnAddress(holder.address) && 
        !this.isProgramAccount(holder.address)
      );
      
      if (realHolders.length > 0) {
        topHolderPercentage = (realHolders[0].balance / totalSupply) * 100;
      }
    }

    return {
      count: holdersData.count || holders.length,
      topPercentage: topHolderPercentage,
      distribution: holders.map(holder => ({
        address: holder.address,
        balance: holder.balance,
        percentage: (holder.balance / totalSupply) * 100,
        isBurn: this.isBurnAddress(holder.address),
        isProgram: this.isProgramAccount(holder.address)
      }))
    };
  }

  // Check if address is a burn address
  isBurnAddress(address) {
    const burnAddresses = [
      '11111111111111111111111111111111', // System program
      '1nc1nerator11111111111111111111111111111111', // Incinerator
      'DeadBeefDeadBeefDeadBeefDeadBeefDeadBeef' // Common burn pattern
    ];
    return burnAddresses.some(burn => address.includes(burn));
  }

  // Check if address is a program account
  isProgramAccount(address) {
    // Common Solana program addresses to exclude from holder analysis
    const programPatterns = [
      '11111111111111111111111111111111', // System Program
      'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', // Token Program
      'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL', // Associated Token Program
    ];
    return programPatterns.some(pattern => address === pattern);
  }

  // Estimate market cap specifically for Solana tokens
  estimateMarketCap(pair) {
    const price = parseFloat(pair.priceUsd) || 0;
    const liquidity = pair.liquidity?.usd || 0;
    
    // For Solana, liquidity pools typically represent 2-8% of market cap
    // Use conservative 5% estimate
    return liquidity * 20;
  }

  // Calculate SOL liquidity amount
  getSOLLiquidity(pair) {
    const solPrice = parseFloat(pair.priceNative) || 0;
    const liquidityUSD = pair.liquidity?.usd || 0;
    
    if (solPrice <= 0) return 0;
    
    // Estimate SOL liquidity (roughly half of total liquidity if paired with SOL)
    return (liquidityUSD * 0.5) / solPrice;
  }

  // Main filtering function for Solana tokens
  async filterToken(pair, rugData = {}) {
    const filters = [];
    
    // Basic validation
    if (!pair || !pair.pairAddress) {
      return { passed: false, reason: 'Invalid pair data', filters: ['validation'] };
    }

    // Ensure this is a Solana token
    if (pair.chainId !== 'solana') {
      return { 
        passed: false, 
        reason: `Non-Solana token detected: ${pair.chainId}`,
        filters: ['chain_mismatch'] 
      };
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

    // DEX filters - Solana specific
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
        reason: `DEX not allowed: ${pair.dexId} (allowed: ${this.config.allowedDEXs.join(', ')})`,
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

    // Liquidity filters (USD)
    const liquidityUSD = pair.liquidity?.usd || 0;
    
    if (liquidityUSD < this.config.minLiquidity) {
      filters.push('liquidity_min');
      return { 
        passed: false, 
        reason: `Liquidity too low: $${liquidityUSD.toLocaleString()} (min: $${this.config.minLiquidity.toLocaleString()})`,
        filters 
      };
    }

    if (this.config.maxLiquidity && liquidityUSD > this.config.maxLiquidity) {
      filters.push('liquidity_max');
      return { 
        passed: false, 
        reason: `Liquidity too high: $${liquidityUSD.toLocaleString()} (max: $${this.config.maxLiquidity.toLocaleString()})`,
        filters 
      };
    }

    // SOL liquidity filter
    const solLiquidity = this.getSOLLiquidity(pair);
    if (solLiquidity < this.config.minSOLLiquidity) {
      filters.push('sol_liquidity');
      return { 
        passed: false, 
        reason: `SOL liquidity too low: ${solLiquidity.toFixed(2)} SOL (min: ${this.config.minSOLLiquidity})`,
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
        reason: `Rug score too high: ${rugScore}/10 (max: ${this.config.maxRugScore})`,
        filters 
      };
    }

    // Solana-specific risk type filters
    const risks = rugData.risks || [];
    const blockedRisks = risks.filter(risk => this.config.blockedRiskTypes.includes(risk));
    if (blockedRisks.length > 0) {
      filters.push('risk_types');
      return { 
        passed: false, 
        reason: `Blocked risk types: ${blockedRisks.join(', ')}`,
        filters 
      };
    }

    // Net traders estimation (more accurate for Solana's fast/cheap transactions)
    const netTraders = Math.floor(volume24h / 50); // Lower divisor for Solana
    if (netTraders < this.config.minNetTraders) {
      filters.push('net_traders');
      return { 
        passed: false, 
        reason: `Not enough estimated traders: ${netTraders} (min: ${this.config.minNetTraders})`,
        filters 
      };
    }

    // Market cap filters
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

    // Solana-specific additional checks
    
    // Check for freeze authority (common Solana rug vector)
    if (rugData.freezeAuthority && rugData.freezeAuthority !== null) {
      filters.push('freeze_authority');
      return { 
        passed: false, 
        reason: `Token has freeze authority: ${rugData.freezeAuthority}`,
        filters 
      };
    }

    // Check mint authority (another Solana rug vector)
    if (rugData.mintAuthority && rugData.mintAuthority !== null) {
      filters.push('mint_authority');
      return { 
        passed: false, 
        reason: `Token has mint authority: ${rugData.mintAuthority}`,
        filters 
      };
    }

    // All filters passed
    return { 
      passed: true, 
      holderData,
      netTraders,
      rugScore,
      risks,
      solLiquidity,
      estimatedMarketCap: this.estimateMarketCap(pair),
      filters: []
    };
  }

  // Get filter statistics
  getFilterStats() {
    return {
      config: this.config,
      chainId: this.chainId,
      summary: {
        minHolders: this.config.minHolders,
        maxTopHolder: `${this.config.maxTopHolderPercentage}%`,
        minVolume: `$${this.config.minVolume24h.toLocaleString()}`,
        minLiquidity: `$${this.config.minLiquidity.toLocaleString()}`,
        maxTokenAge: `${this.config.maxTokenAgeHours}h`,
        maxRugScore: this.config.maxRugScore,
        allowedDEXs: this.config.allowedDEXs
      }
    };
  }

  // Update configuration at runtime
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
  }

  // Get current configuration
  getConfig() {
    return { ...this.config };
  }
}

// Export Solana-focused filter configuration and class
module.exports = {
  filterConfig,
  SolanaTokenFilter
};