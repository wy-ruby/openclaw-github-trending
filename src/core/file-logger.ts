import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * FileLogger - 将日志记录到文件中
 *
 * 日志文件位置: ~/.openclaw/logs/github-trending/trending-YYYY-MM.log
 * 说明: 按月份分割日志文件,每个月一个文件
 */
export class FileLogger {
  private static instance: FileLogger;
  private logDir: string;
  private enabled: boolean = true;

  private constructor() {
    // 尝试使用 OpenClaw 的数据目录，如果不存在则使用默认路径
    const openclawDataDir = process.env.OPENCLAW_DATA_DIR || path.join(os.homedir(), '.openclaw');
    this.logDir = path.join(openclawDataDir, 'logs', 'github-trending');

    // 确保日志目录存在
    try {
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true });
      }
    } catch (error) {
      console.error('Failed to create log directory:', error);
      this.enabled = false;
    }
  }

  /**
   * 获取单例实例
   */
  public static getInstance(): FileLogger {
    if (!FileLogger.instance) {
      FileLogger.instance = new FileLogger();
    }
    return FileLogger.instance;
  }

  /**
   * 获取当前日志文件路径
   * 按月份分割日志文件,格式: trending-YYYY-MM.log
   */
  private getLogFilePath(): string {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0'); // 01-12
    return path.join(this.logDir, `trending-${year}-${month}.log`);
  }

  /**
   * 获取时间戳
   */
  private getTimestamp(): string {
    return new Date().toISOString();
  }

  /**
   * 记录日志到文件
   */
  private logToFile(level: string, message: string, ...args: any[]) {
    if (!this.enabled) {
      return;
    }

    try {
      const timestamp = this.getTimestamp();
      const logEntry = `[${timestamp}] [${level.toUpperCase()}] ${message}`;

      // 如果有额外参数,格式化输出
      const fullMessage = args.length > 0
        ? `${logEntry} ${JSON.stringify(args)}`
        : logEntry;

      // 写入日志文件
      const logFilePath = this.getLogFilePath();
      fs.appendFileSync(logFilePath, fullMessage + '\n', 'utf8');
    } catch (error) {
      // 日志写入失败时不抛出错误,只在控制台打印
      console.error('Failed to write log:', error);
    }
  }

  /**
   * INFO 级别日志
   */
  public info(message: string, ...args: any[]): void {
    this.logToFile('info', message, ...args);
    console.log(`[INFO] ${message}`, ...args);
  }

  /**
   * WARN 级别日志
   */
  public warn(message: string, ...args: any[]): void {
    this.logToFile('warn', message, ...args);
    console.warn(`[WARN] ${message}`, ...args);
  }

  /**
   * ERROR 级别日志
   */
  public error(message: string, ...args: any[]): void {
    this.logToFile('error', message, ...args);
    console.error(`[ERROR] ${message}`, ...args);
  }

  /**
   * DEBUG 级别日志
   */
  public debug(message: string, ...args: any[]): void {
    this.logToFile('debug', message, ...args);
    console.log(`[DEBUG] ${message}`, ...args);
  }

  /**
   * 获取日志目录路径
   */
  public getLogDirectory(): string {
    return this.logDir;
  }
}
