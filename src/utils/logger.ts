export class Logger {
  private prefix: string;

  constructor(prefix: string = 'Logger') {
    this.prefix = `[${prefix}]`;
  }

  getPrefix(): string {
    return this.prefix;
  }

  private formatMessage(level: string, message: string, args: any[]): string {
    const timestamp = new Date().toISOString();
    const levelPrefix = `[${level}]`;
    let formattedMessage = `${timestamp} ${this.prefix} ${levelPrefix} ${message}`;

    if (args && args.length > 0) {
      formattedMessage += ' ' + args.map(arg => this.formatArg(arg)).join(' ');
    }

    return formattedMessage;
  }

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

  private log(level: string, message: string, args: any[]): void {
    const formattedMessage = this.formatMessage(level, message, args);
    console.log(formattedMessage);
  }

  /**
   * Debug level logging
   */
  debug(message: string, ...args: any[]): void {
    this.log('DEBUG', message, args);
  }

  /**
   * Info level logging
   */
  info(message: string, ...args: any[]): void {
    this.log('INFO', message, args);
  }

  /**
   * Success level logging
   */
  success(message: string, ...args: any[]): void {
    const successMessage = message.endsWith(' succeed') ? message : `${message} succeed`;
    this.log('SUCCESS', successMessage, args);
  }

  /**
   * Warn level logging
   */
  warn(message: string, ...args: any[]): void {
    this.log('WARN', message, args);
  }

  /**
   * Error level logging
   */
  error(message: string | Error, ...args: any[]): void {
    if (message instanceof Error) {
      this.log('ERROR', message.message, [message, ...args]);
    } else {
      this.log('ERROR', message, args);
    }
  }

  /**
   * Create a timer function for measuring execution time
   * @param operation Name of the operation being timed
   * @returns A function that when called, logs the elapsed time
   */
  timer(operation: string): () => number {
    const startTime = Date.now();
    return (): number => {
      const elapsed = Date.now() - startTime;
      this.info(`${operation} completed in ${elapsed}ms`);
      return elapsed;
    };
  }

  // Static methods for convenience
  static debug(message: string, ...args: any[]): void {
    const logger = new Logger();
    logger.debug(message, ...args);
  }

  static info(message: string, ...args: any[]): void {
    const logger = new Logger();
    logger.info(message, ...args);
  }

  static success(message: string, ...args: any[]): void {
    const logger = new Logger();
    logger.success(message, ...args);
  }

  static warn(message: string, ...args: any[]): void {
    const logger = new Logger();
    logger.warn(message, ...args);
  }

  static error(message: string | Error, ...args: any[]): void {
    const logger = new Logger();
    logger.error(message, ...args);
  }
}
