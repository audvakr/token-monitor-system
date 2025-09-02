// config/chains.js - Solana-focused blockchain configuration
require('dotenv').config();

// Solana blockchain configuration
const solanaConfig = {
  id: 'solana',
  name: 'Solana',
  nativeCurrency: 'SOL',
  rpcUrl: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
  blockExplorer: 'https://solscan.io',
  dexscreenerPath: 'solana',
  cluster: process.env.SOLANA_CLUSTER || 'mainnet-beta', // Explicitly add cluster
  stablecoins: {
    USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'
  },
  wsol: 'So11111111111111111111111111111111111111112' // Wrapped SOL
};

// Solana DEX configurations
const solanaDEXs = {
  raydium: {
    name: 'Raydium',
    type: 'AMM',
    website: 'https://raydium.io',
    fees: [0.25],
    trustScore: 9,
    priority: 1
  },
  
  orca: {
    name: 'Orca',
    type: 'AMM',
    website: 'https://www.orca.so',
    fees: [0.3],
    trustScore: 8,
    priority: 2
  },
  
  jupiter: {
    name: 'Jupiter',
    type: 'Aggregator',
    website: 'https://jup.ag',
    fees: [0.0], // Aggregator
    trustScore: 9,
    priority: 3
  },
  
  serum: {
    name: 'Serum',
    type: 'CLOB',
    website: 'https://www.projectserum.com',
    fees: [0.0],
    trustScore: 7,
    priority: 4
  }
};

// Get Solana configuration
const getChainConfig = () => {
  return solanaConfig;
};

// Get DEX configuration
const getDEXConfig = (dexId) => {
  const config = solanaDEXs[dexId];
  if (!config) {
    console.warn(`Unknown Solana DEX: ${dexId}`);
    return {
      name: dexId,
      type: 'Unknown',
      website: null,
      fees: [0.3],
      trustScore: 5,
      priority: 10
    };
  }
  return config;
};

// Get all supported DEX IDs
const getSupportedDEXs = () => {
  return Object.keys(solanaDEXs);
};

// Get DEXs sorted by priority (lower number = higher priority)
const getDEXsByPriority = () => {
  return Object.entries(solanaDEXs)
    .sort(([,a], [,b]) => a.priority - b.priority)
    .map(([dexId]) => dexId);
};

// Get stablecoin address
const getStablecoinAddress = (symbol = 'USDC') => {
  return solanaConfig.stablecoins[symbol] || null;
};

// Get wrapped SOL address
const getWrappedSOLAddress = () => {
  return solanaConfig.wsol;
};

// Check if token is a stablecoin
const isStablecoin = (tokenAddress) => {
  const stablecoinAddresses = Object.values(solanaConfig.stablecoins).map(addr => addr.toLowerCase());
  return stablecoinAddresses.includes(tokenAddress.toLowerCase());
};

// Get chain info for display
const getChainDisplayInfo = () => {
  return {
    id: solanaConfig.id,
    name: solanaConfig.name,
    currency: solanaConfig.nativeCurrency,
    explorer: solanaConfig.blockExplorer,
    dexscreenerPath: solanaConfig.dexscreenerPath
  };
};

// Get DEX trust score
const getDEXTrustScore = (dexId) => {
  const config = getDEXConfig(dexId);
  return config.trustScore;
};

// Validate DEX exists on Solana
const validateDEX = (dexId) => {
  return solanaDEXs.hasOwnProperty(dexId);
};

// Export Solana-focused configurations and utilities
module.exports = {
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
};