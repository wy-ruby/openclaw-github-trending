import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * Unified Logger with Console + File support
 *
 * Features:
 * - Console logging with timestamp, prefix, and level
 * - File logging to ~/.openclaw/logs/github-trending/trending-YYYY-MM.log
 * - Single instance per module (prefix-based)
 * - Static methods for convenience
 * - Unified log format
 */
export class Logger {
  private static instances: Map<string, Logger> = new Map();
  private prefix: string;
  private logDir: string;
  private enabled: boolean = true;
  private logLevel: LogLevel = LogLevel.INFO;

  constructor(prefix: string = 'App') {
    this.prefix = `[${prefix}]`;
    this.logDir = ''; // Initialize

    // Setup log directory (same as old FileLogger)
    try {
      const openclawDataDir = process.env.OPENCLAW_DATA_DIR || path.join(os.homedir(), '.openclaw');
      this.logDir = path.join(openclawDataDir, 'logs', 'github-trending');

      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true });
      }
    } catch (error) {
      console.error('[Logger] Failed to create log directory:', error);
      this.enabled = false;
    }
  }

  /**
   * Get logger instance for a specific module
   * Singleton per prefix
   */
  static get(prefix: string): Logger {
    if (!Logger.instances.has(prefix)) {
      Logger.instances.set(prefix, new Logger(prefix));
    }
    return Logger.instances.get(prefix)!;
  }

  /**
   * Set minimum log level (default: INFO)
   */
  setLogLevel(level: LogLevel): void {
    this.logLevel = level;
  }

  /**
   * Get log file path (monthly rotation)
   */
  private getLogFilePath(): string {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return path.join(this.logDir, `trending-${year}-${month}.log`);
  }

  /**
   * Format argument for logging
   */
  private formatArg(arg: any): string {
    if (arg instanceof Error) {
      return arg.message + (arg.stack ? `\n${arg.stack}` : '');
    }
    if (typeof arg === 'object') {
      return JSON.stringify(arg, null, 2);
    }
    if (typeof arg === 'function') {
      return '[Function]';
    }
    return String(arg);
  }

  /**
   * Check if log level is enabled
   */
  private isLevelEnabled(level: LogLevel): boolean {
    const levelOrder: Record<LogLevel, number> = {
      [LogLevel.DEBUG]: 0,
      [LogLevel.INFO]: 1,
      [LogLevel.WARN]: 2,
      [LogLevel.ERROR]: 3,
      [LogLevel.SUCCESS]: 1, // Same as INFO for filtering
    };
    return levelOrder[level] >= levelOrder[this.logLevel];
  }

  /**
   * Format message with timestamp and prefix
   */
  private formatMessage(level: LogLevel, message: string, args: any[]): string {
    const timestamp = new Date().toISOString();
    const levelStr = level.toString().toUpperCase();
    let formattedMessage = `${timestamp} ${this.prefix} [${levelStr}] ${message}`;

    if (args && args.length > 0) {
      formattedMessage += ' ' + args.map(arg => this.formatArg(arg)).join(' ');
    }

    return formattedMessage;
  }

  /**
   * Write to file
   */
  private logToFile(message: string): void {
    if (!this.enabled) return;

    try {
      const logFilePath = this.getLogFilePath();
      fs.appendFileSync(logFilePath, message + '\n', 'utf8');
    } catch (error) {
      // Fail silently - don't crash the app if logging fails
    }
  }

  /**
   * Internal log method
   */
  private log(level: LogLevel, message: string, ...args: any[]): void {
    if (!this.isLevelEnabled(level)) return;

    const formattedMessage = this.formatMessage(level, message, args);

    // Console output with color
    switch (level) {
      case LogLevel.DEBUG:
        console.log(formattedMessage);
        break;
      case LogLevel.INFO:
        console.log(formattedMessage);
        break;
      case LogLevel.WARN:
        console.warn(formattedMessage);
        break;
      case LogLevel.ERROR:
        console.error(formattedMessage);
        break;
      case LogLevel.SUCCESS:
        console.log(formattedMessage); // Green color in terminal
        break;
    }

    // File logging
    this.logToFile(formattedMessage);
  }

  // Public logging methods

  debug(message: string, ...args: any[]): void {
    this.log(LogLevel.DEBUG, message, ...args);
  }

  info(message: string, ...args: any[]): void {
    this.log(LogLevel.INFO, message, ...args);
  }

  success(message: string, ...args: any[]): void {
    const successMsg = message.includes('✅') || message.includes('succeed')
      ? message
      : `✅ ${message}`;
    this.log(LogLevel.SUCCESS, successMsg, ...args);
  }

  warn(message: string, ...args: any[]): void {
    this.log(LogLevel.WARN, message, ...args);
  }

  error(message: string | Error, ...args: any[]): void {
    if (message instanceof Error) {
      this.log(LogLevel.ERROR, message.message, [message, ...args]);
    } else {
      this.log(LogLevel.ERROR, message, ...args);
    }
  }

  /**
   * Create a timer function for measuring execution time
   */
  timer(operation: string): () => number {
    const startTime = Date.now();
    return (): number => {
      const elapsed = Date.now() - startTime;
      this.info(`${operation} completed in ${elapsed}ms`);
      return elapsed;
    };
  }

  // Static convenience methods (uses 'App' as default prefix)

  static debug(message: string, ...args: any[]): void {
    Logger.get('App').debug(message, ...args);
  }

  static info(message: string, ...args: any[]): void {
    Logger.get('App').info(message, ...args);
  }

  static success(message: string, ...args: any[]): void {
    Logger.get('App').success(message, ...args);
  }

  static warn(message: string, ...args: any[]): void {
    Logger.get('App').warn(message, ...args);
  }

  static error(message: string | Error, ...args: any[]): void {
    Logger.get('App').error(message, ...args);
  }
}

export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  SUCCESS = 'success',
}
