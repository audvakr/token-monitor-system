// config/logging.js - Logging configuration and utilities
require('dotenv').config();
const fs = require('fs');
const path = require('path');

// Logging configuration
const loggingConfig = {
  level: process.env.LOG_LEVEL || 'info',
  file: process.env.LOG_FILE || 'logs/token-monitor.log',
  maxFileSize: parseInt(process.env.LOG_MAX_FILE_SIZE) || 10 * 1024 * 1024, // 10MB
  maxFiles: parseInt(process.env.LOG_MAX_FILES) || 5,
  enableConsole: process.env.LOG_ENABLE_CONSOLE !== 'false',
  enableFile: process.env.LOG_ENABLE_FILE !== 'false',
  dateFormat: process.env.LOG_DATE_FORMAT || 'YYYY-MM-DD HH:mm:ss',
  includeTimestamp: process.env.LOG_INCLUDE_TIMESTAMP !== 'false'
};

// Log levels
const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
  trace: 4
};

// Colors for console output
const COLORS = {
  error: '\x1b[31m', // Red
  warn: '\x1b[33m',  // Yellow
  info: '\x1b[36m',  // Cyan
  debug: '\x1b[90m', // Gray
  trace: '\x1b[37m', // White
  reset: '\x1b[0m'
};

// Logger class
class Logger {
  constructor(config = loggingConfig) {
    this.config = config;
    this.currentLogLevel = LOG_LEVELS[config.level] || LOG_LEVELS.info;
    
    // Ensure log directory exists
    if (this.config.enableFile && this.config.file) {
      const logDir = path.dirname(this.config.file);
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
    }
    
    // Initialize log rotation if file logging is enabled
    if (this.config.enableFile) {
      this.initLogRotation();
    }
  }

  // Initialize log rotation
  initLogRotation() {
    try {
      if (fs.existsSync(this.config.file)) {
        const stats = fs.statSync(this.config.file);
        if (stats.size > this.config.maxFileSize) {
          this.rotateLog();
        }
      }
    } catch (error) {
      console.error('Error initializing log rotation:', error);
    }
  }

  // Rotate log files
  rotateLog() {
    try {
      const logDir = path.dirname(this.config.file);
      const logName = path.basename(this.config.file, path.extname(this.config.file));
      const logExt = path.extname(this.config.file);

      // Move existing log files
      for (let i = this.config.maxFiles - 1; i >= 1; i--) {
        const oldFile = path.join(logDir, `${logName}.${i}${logExt}`);
        const newFile = path.join(logDir, `${logName}.${i + 1}${logExt}`);
        
        if (fs.existsSync(oldFile)) {
          if (i === this.config.maxFiles - 1) {
            fs.unlinkSync(oldFile); // Delete oldest file
          } else {
            fs.renameSync(oldFile, newFile);
          }
        }
      }

      // Move current log to .1
      if (fs.existsSync(this.config.file)) {
        const rotatedFile = path.join(logDir, `${logName}.1${logExt}`);
        fs.renameSync(this.config.file, rotatedFile);
      }
    } catch (error) {
      console.error('Error rotating log files:', error);
    }
  }

  // Format timestamp
  formatTimestamp() {
    const now = new Date();
    return now.toISOString().replace('T', ' ').substring(0, 19);
  }

  // Format log message
  formatMessage(level, message, data = null) {
    let formatted = '';
    
    if (this.config.includeTimestamp) {
      formatted += `[${this.formatTimestamp()}] `;
    }
    
    formatted += `[${level.toUpperCase()}] ${message}`;
    
    if (data) {
      if (typeof data === 'object') {
        formatted += ` ${JSON.stringify(data, null, 2)}`;
      } else {
        formatted += ` ${data}`;
      }
    }
    
    return formatted;
  }

  // Write to file
  writeToFile(message) {
    if (!this.config.enableFile || !this.config.file) return;
    
    try {
      // Check if rotation is needed
      if (fs.existsSync(this.config.file)) {
        const stats = fs.statSync(this.config.file);
        if (stats.size > this.config.maxFileSize) {
          this.rotateLog();
        }
      }
      
      fs.appendFileSync(this.config.file, message + '\n');
    } catch (error) {
      console.error('Error writing to log file:', error);
    }
  }

  // Write to console
  writeToConsole(level, message) {
    if (!this.config.enableConsole) return;
    
    const color = COLORS[level] || COLORS.info;
    const coloredMessage = `${color}${message}${COLORS.reset}`;
    
    if (level === 'error') {
      console.error(coloredMessage);
    } else if (level === 'warn') {
      console.warn(coloredMessage);
    } else {
      console.log(coloredMessage);
    }
  }

  // Generic log method
  log(level, message, data = null) {
    const levelNumber = LOG_LEVELS[level];
    if (levelNumber === undefined || levelNumber > this.currentLogLevel) {
      return; // Skip if level is not defined or below current log level
    }
    
    const formattedMessage = this.formatMessage(level, message, data);
    
    this.writeToConsole(level, formattedMessage);
    this.writeToFile(formattedMessage);
  }

  // Convenience methods
  error(message, data = null) {
    this.log('error', message, data);
  }

  warn(message, data = null) {
    this.log('warn', message, data);
  }

  info(message, data = null) {
    this.log('info', message, data);
  }

  debug(message, data = null) {
    this.log('debug', message, data);
  }

  trace(message, data = null) {
    this.log('trace', message, data);
  }

  // Performance timing
  time(label) {
    this.timers = this.timers || {};
    this.timers[label] = Date.now();
  }

  timeEnd(label) {
    if (!this.timers || !this.timers[label]) {
      this.warn(`Timer '${label}' not found`);
      return;
    }
    
    const elapsed = Date.now() - this.timers[label];
    this.info(`Timer ${label}: ${elapsed}ms`);
    delete this.timers[label];
    return elapsed;
  }

  // Log API request/response
  logAPIRequest(method, url, status = null, duration = null) {
    let message = `API ${method.toUpperCase()} ${url}`;
    
    if (status !== null) {
      message += ` - ${status}`;
    }
    
    if (duration !== null) {
      message += ` (${duration}ms)`;
    }
    
    if (status && status >= 400) {
      this.warn(message);
    } else {
      this.debug(message);
    }
  }

  // Log database operations
  logDBOperation(operation, table, duration = null, rowCount = null) {
    let message = `DB ${operation.toUpperCase()} ${table}`;
    
    if (rowCount !== null) {
      message += ` - ${rowCount} rows`;
    }
    
    if (duration !== null) {
      message += ` (${duration}ms)`;
    }
    
    this.debug(message);
  }

  // Log token processing
  logTokenProcessing(action, tokenSymbol, reason = null, data = null) {
    let message = `Token ${action.toUpperCase()}: ${tokenSymbol}`;
    
    if (reason) {
      message += ` - ${reason}`;
    }
    
    if (action === 'SAVED') {
      this.info(message, data);
    } else if (action === 'FILTERED') {
      this.debug(message, data);
    } else if (action === 'ERROR') {
      this.error(message, data);
    } else {
      this.debug(message, data);
    }
  }

  // Log system stats
  logSystemStats(stats) {
    this.info('System Stats', {
      memoryUsage: process.memoryUsage(),
      uptime: process.uptime(),
      ...stats
    });
  }

  // Set log level at runtime
  setLevel(level) {
    if (LOG_LEVELS[level] !== undefined) {
      this.currentLogLevel = LOG_LEVELS[level];
      this.config.level = level;
      this.info(`Log level changed to: ${level}`);
    } else {
      this.warn(`Invalid log level: ${level}`);
    }
  }

  // Get current configuration
  getConfig() {
    return { ...this.config };
  }
}

// Create default logger instance
const logger = new Logger();

// Export logger and utilities
module.exports = {
  Logger,
  logger,
  loggingConfig,
  LOG_LEVELS,
  COLORS
};