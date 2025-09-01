// config/chains.js - Blockchain and DEX configuration
require('dotenv').config();

// Supported blockchain configurations
const chainConfigs = {
  ethereum: {
    id: 'ethereum',
    name: 'Ethereum',
    nativeCurrency: 'ETH',
    rpcUrl: 'https://eth-mainnet.alchemyapi.io/v2/your-api-key',
    blockExplorer: 'https://etherscan.io',
    dexscreenerPath: 'ethereum',
    commonDEXs: ['uniswap', 'sushiswap', '1inch', 'balancer'],
    stablecoins: {
      USDC: '0xa0b86a33e6776e681c00f7d9c9e0d60b0e1e9e6b',
      USDT: '0xdac17f958d2ee523a2206206994597c13d831ec7',
      DAI: '0x6b175474e89094c44da98b954eedeac495271d0f'
    },
    weth: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'
  },

  bsc: {
    id: 'bsc',
    name: 'Binance Smart Chain',
    nativeCurrency: 'BNB',
    rpcUrl: 'https://bsc-dataseed1.binance.org/',
    blockExplorer: 'https://bscscan.com',
    dexscreenerPath: 'bsc',
    commonDEXs: ['pancakeswap', 'biswap', 'mdex', 'bakeryswap'],
    stablecoins: {
      USDT: '0x55d398326f99059ff775485246999027b3197955',
      USDC: '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d',
      BUSD: '0xe9e7cea3dedca5984780bafc599bd69add087d56'
    },
    weth: '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c' // WBNB
  },

  polygon: {
    id: 'polygon',
    name: 'Polygon',
    nativeCurrency: 'MATIC',
    rpcUrl: 'https://polygon-rpc.com/',
    blockExplorer: 'https://polygonscan.com',
    dexscreenerPath: 'polygon',
    commonDEXs: ['quickswap', 'sushiswap', 'uniswap', 'balancer'],
    stablecoins: {
      USDC: '0x2791bca1f2de4661ed88a30c99a7a9449aa84174',
      USDT: '0xc2132d05d31c914a87c6611c10748aeb04b58e8f',
      DAI: '0x8f3cf7ad23cd3cadbd9735aff958023239c6a063'
    },
    weth: '0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270' // WMATIC
  },

  arbitrum: {
    id: 'arbitrum',
    name: 'Arbitrum One',
    nativeCurrency: 'ETH',
    rpcUrl: 'https://arb1.arbitrum.io/rpc',
    blockExplorer: 'https://arbiscan.io',
    dexscreenerPath: 'arbitrum',
    commonDEXs: ['uniswap', 'sushiswap', 'balancer', 'camelot'],
    stablecoins: {
      USDC: '0xff970a61a04b1ca14834a43f5de4533ebddb5cc8',
      USDT: '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9',
      DAI: '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1'
    },
    weth: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1'
  },

  optimism: {
    id: 'optimism',
    name: 'Optimism',
    nativeCurrency: 'ETH',
    rpcUrl: 'https://mainnet.optimism.io',
    blockExplorer: 'https://optimistic.etherscan.io',
    dexscreenerPath: 'optimism',
    commonDEXs: ['uniswap', 'velodrome', 'beethoven-x'],
    stablecoins: {
      USDC: '0x7f5c764cbc14f9669b88837ca1490cca17c31607',
      USDT: '0x94b008aa00579c1307b0ef2c499ad98a8ce58e58',
      DAI: '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1'
    },
    weth: '0x4200000000000000000000000000000000000006'
  },

  avalanche: {
    id: 'avalanche',
    name: 'Avalanche',
    nativeCurrency: 'AVAX',
    rpcUrl: 'https://api.avax.network/ext/bc/C/rpc',
    blockExplorer: 'https://snowtrace.io',
    dexscreenerPath: 'avalanche',
    commonDEXs: ['traderjoe', 'pangolin', 'sushiswap'],
    stablecoins: {
      USDC: '0xa7d7079b0fead91f3e65f86e8915cb59c1a4c664',
      USDT: '0xc7198437980c041c805a1edcba50c1ce5db95118',
      DAI: '0xd586e7f844cea2f87f50152665bcbc2c279d8d70'
    },
    weth: '0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7' // WAVAX
  },

  fantom: {
    id: 'fantom',
    name: 'Fantom',
    nativeCurrency: 'FTM',
    rpcUrl: 'https://rpc.ftm.tools/',
    blockExplorer: 'https://ftmscan.com',
    dexscreenerPath: 'fantom',
    commonDEXs: ['spookyswap', 'spiritswap', 'beethovenx'],
    stablecoins: {
      USDC: '0x04068da6c83afcfa0e13ba15a6696662335d5b75',
      USDT: '0x049d68029688eabf473097a2fc38ef61633a3c7a',
      DAI: '0x8d11ec38a3eb5e956b052f67da8bdc9bef8abf3e'
    },
    weth: '0x21be370d5312f44cb42ce377bc9b8a0cef1a4c83' // WFTM
  },

  solana: {
    id: 'solana',
    name: 'Solana',
    nativeCurrency: 'SOL',
    rpcUrl: 'https://api.mainnet-beta.solana.com',
    blockExplorer: 'https://solscan.io',
    dexscreenerPath: 'solana',
    commonDEXs: ['raydium', 'orca', 'serum'],
    stablecoins: {
      USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'
    },
    weth: 'So11111111111111111111111111111111111111112' // WSOL
  }
};

// DEX configurations
const dexConfigs = {
  uniswap: {
    name: 'Uniswap',
    chains: ['ethereum', 'polygon', 'arbitrum', 'optimism'],
    type: 'AMM',
    website: 'https://uniswap.org',
    fees: [0.05, 0.3, 1.0], // Fee tiers in percentage
    trustScore: 10 // 1-10 scale
  },

  pancakeswap: {
    name: 'PancakeSwap',
    chains: ['bsc'],
    type: 'AMM',
    website: 'https://pancakeswap.finance',
    fees: [0.25],
    trustScore: 9
  },

  sushiswap: {
    name: 'SushiSwap',
    chains: ['ethereum', 'polygon', 'arbitrum', 'avalanche'],
    type: 'AMM',
    website: 'https://sushi.com',
    fees: [0.3],
    trustScore: 8
  },

  quickswap: {
    name: 'QuickSwap',
    chains: ['polygon'],
    type: 'AMM',
    website: 'https://quickswap.exchange',
    fees: [0.3],
    trustScore: 7
  },

  traderjoe: {
    name: 'Trader Joe',
    chains: ['avalanche'],
    type: 'AMM',
    website: 'https://traderjoexyz.com',
    fees: [0.3],
    trustScore: 8
  },

  spookyswap: {
    name: 'SpookySwap',
    chains: ['fantom'],
    type: 'AMM',
    website: 'https://spookyswap.finance',
    fees: [0.3],
    trustScore: 7
  },

  raydium: {
    name: 'Raydium',
    chains: ['solana'],
    type: 'AMM',
    website: 'https://raydium.io',
    fees: [0.25],
    trustScore: 8
  }
};

// Get supported chains from environment or use defaults
const getSupportedChains = () => {
  const envChains = process.env.SUPPORTED_CHAINS;
  if (envChains) {
    return envChains.split(',').map(chain => chain.trim());
  }
  return ['ethereum', 'bsc', 'polygon', 'arbitrum'];
};

// Get chain configuration
const getChainConfig = (chainId) => {
  const config = chainConfigs[chainId];
  if (!config) {
    throw new Error(`Unsupported chain: ${chainId}`);
  }
  return config;
};

// Get DEX configuration
const getDEXConfig = (dexId) => {
  const config = dexConfigs[dexId];
  if (!config) {
    console.warn(`Unknown DEX: ${dexId}`);
    return {
      name: dexId,
      chains: [],
      type: 'Unknown',
      website: null,
      fees: [],
      trustScore: 5
    };
  }
  return config;
};

// Validate chain and DEX combination
const validateChainDEX = (chainId, dexId) => {
  const chainConfig = getChainConfig(chainId);
  const dexConfig = getDEXConfig(dexId);
  
  if (!dexConfig.chains.includes(chainId)) {
    console.warn(`DEX ${dexId} may not be available on ${chainId}`);
    return false;
  }
  
  return true;
};

// Get stablecoin address for chain
const getStablecoinAddress = (chainId, symbol = 'USDC') => {
  const chainConfig = getChainConfig(chainId);
  return chainConfig.stablecoins[symbol] || null;
};

// Get wrapped native token address
const getWrappedNativeAddress = (chainId) => {
  const chainConfig = getChainConfig(chainId);
  return chainConfig.weth; // Note: 'weth' field contains wrapped native token for all chains
};

// Check if token is a stablecoin
const isStablecoin = (tokenAddress, chainId) => {
  const chainConfig = getChainConfig(chainId);
  const stablecoinAddresses = Object.values(chainConfig.stablecoins).map(addr => addr.toLowerCase());
  return stablecoinAddresses.includes(tokenAddress.toLowerCase());
};

// Get chain info for display
const getChainDisplayInfo = (chainId) => {
  const config = getChainConfig(chainId);
  return {
    id: config.id,
    name: config.name,
    currency: config.nativeCurrency,
    explorer: config.blockExplorer,
    dexscreenerPath: config.dexscreenerPath
  };
};

// Get DEX trust score
const getDEXTrustScore = (dexId) => {
  const config = getDEXConfig(dexId);
  return config.trustScore;
};

// Chain priority for processing (higher priority chains processed first)
const chainPriority = {
  ethereum: 10,
  bsc: 9,
  polygon: 8,
  arbitrum: 7,
  optimism: 6,
  avalanche: 5,
  fantom: 4,
  solana: 3
};

// Get chains sorted by priority
const getChainsByPriority = (chains = null) => {
  const chainsToSort = chains || getSupportedChains();
  return chainsToSort.sort((a, b) => (chainPriority[b] || 0) - (chainPriority[a] || 0));
};

// Export all configurations and utilities
module.exports = {
  chainConfigs,
  dexConfigs,
  chainPriority,
  getSupportedChains,
  getChainConfig,
  getDEXConfig,
  validateChainDEX,
  getStablecoinAddress,
  getWrappedNativeAddress,
  isStablecoin,
  getChainDisplayInfo,
  getDEXTrustScore,
  getChainsByPriority
};