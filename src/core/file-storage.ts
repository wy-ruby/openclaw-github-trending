import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Logger } from '../utils/logger';

const logger = Logger.get('FileStorage');

/**
 * File-based storage manager
 * Stores data in JSON files with monthly rotation
 * Location: ~/.openclaw/plugins/openclaw-github-trending/data/YYYY-MM.json
 */
export class FileStorageManager {
  private dataDir: string;
  private pluginId: string;

  constructor(pluginId: string = 'openclaw-github-trending') {
    this.pluginId = pluginId;

    // Get OpenClaw home directory (~/.openclaw)
    const homeDir = process.env.HOME || process.env.USERPROFILE;
    if (!homeDir) {
      throw new Error('Could not determine home directory');
    }

    // Create data directory path
    this.dataDir = path.join(homeDir, '.openclaw', 'plugins', pluginId, 'data');

    // Ensure directory exists
    try {
      fs.mkdirSync(this.dataDir, { recursive: true });
      logger.info('Storage directory created/verified', { dataDir: this.dataDir });
    } catch (error) {
      logger.error('Failed to create storage directory', { error, dataDir: this.dataDir });
      throw error;
    }
  }

  /**
   * Get current month key (YYYY-MM)
   */
  private getCurrentMonthKey(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  /**
   * Get file path for a specific month
   */
  private getFilePath(monthKey: string): string {
    return path.join(this.dataDir, `${monthKey}.json`);
  }

  /**
   * Load data from file (current month by default)
   */
  async get(key: string, monthKey?: string): Promise<any> {
    const targetMonth = monthKey || this.getCurrentMonthKey();
    const filePath = this.getFilePath(targetMonth);

    try {
      if (!fs.existsSync(filePath)) {
        logger.info('Storage file not found, returning null', { filePath, key });
        return null;
      }

      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(fileContent);

      logger.info('Data loaded successfully', {
        filePath,
        key,
        hasData: !!data[key],
        dataSize: data[key] ? JSON.stringify(data[key]).length : 0
      });

      return data[key];
    } catch (error) {
      logger.error('Failed to load data', { error, filePath, key });
      return null;
    }
  }

  /**
   * Save data to file (current month by default)
   */
  async set(key: string, value: any, monthKey?: string): Promise<void> {
    const targetMonth = monthKey || this.getCurrentMonthKey();
    const filePath = this.getFilePath(targetMonth);

    try {
      let data: Record<string, any> = {};

      // Load existing data if file exists
      if (fs.existsSync(filePath)) {
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        data = JSON.parse(fileContent);
        logger.info('Loaded existing data', { filePath, existingKeys: Object.keys(data) });
      }

      // Update data
      data[key] = value;

      // Write back to file
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');

      logger.info('Data saved successfully', {
        filePath,
        key,
        dataSize: JSON.stringify(value).length,
        totalSize: fs.statSync(filePath).size
      });
    } catch (error) {
      logger.error('Failed to save data', { error, filePath, key });
      throw error;
    }
  }

  /**
   * Get all months with data
   */
  async getMonths(): Promise<string[]> {
    try {
      const files = fs.readdirSync(this.dataDir);
      const months = files
        .filter(file => file.endsWith('.json'))
        .map(file => file.replace('.json', ''))
        .sort((a, b) => b.localeCompare(a)); // Sort descending

      logger.info('Retrieved months with data', { months });
      return months;
    } catch (error) {
      logger.error('Failed to get months', { error });
      return [];
    }
  }

  /**
   * Get full data object for a specific month
   */
  async getMonthData(monthKey?: string): Promise<Record<string, any> | null> {
    const targetMonth = monthKey || this.getCurrentMonthKey();
    const filePath = this.getFilePath(targetMonth);

    try {
      if (!fs.existsSync(filePath)) {
        logger.info('Month data file not found', { filePath });
        return null;
      }

      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(fileContent);

      logger.info('Month data loaded successfully', {
        filePath,
        keys: Object.keys(data),
        size: fs.statSync(filePath).size
      });

      return data;
    } catch (error) {
      logger.error('Failed to load month data', { error, filePath });
      return null;
    }
  }

  /**
   * Merge data across all months (useful for migrations)
   */
  async getAllData(): Promise<Record<string, any>> {
    const months = await this.getMonths();
    const allData: Record<string, any> = {};

    for (const month of months) {
      const monthData = await this.getMonthData(month);
      if (monthData) {
        Object.assign(allData, monthData);
      }
    }

    logger.info('Retrieved all data across months', {
      monthsCount: months.length,
      keys: Object.keys(allData)
    });

    return allData;
  }

  /**
   * Delete data for a specific key
   */
  async delete(key: string, monthKey?: string): Promise<void> {
    const targetMonth = monthKey || this.getCurrentMonthKey();
    const filePath = this.getFilePath(targetMonth);

    try {
      if (!fs.existsSync(filePath)) {
        logger.warn('File not found for deletion', { filePath });
        return;
      }

      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(fileContent);

      if (data[key]) {
        delete data[key];
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
        logger.info('Data deleted successfully', { filePath, key });
      } else {
        logger.warn('Key not found for deletion', { filePath, key });
      }
    } catch (error) {
      logger.error('Failed to delete data', { error, filePath, key });
      throw error;
    }
  }

  /**
   * Clear all data for a specific month
   */
  async clear(monthKey?: string): Promise<void> {
    const targetMonth = monthKey || this.getCurrentMonthKey();
    const filePath = this.getFilePath(targetMonth);

    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        logger.info('Cleared storage file', { filePath });
      } else {
        logger.warn('File not found for clearing', { filePath });
      }
    } catch (error) {
      logger.error('Failed to clear storage', { error, filePath });
      throw error;
    }
  }

  /**
   * Get storage statistics
   */
  async getStats(): Promise<{
    totalMonths: number;
    currentMonth: string;
    currentMonthSize: number;
    totalSize: number;
    files: { month: string; size: number }[];
  }> {
    const months = await this.getMonths();
    const files: { month: string; size: number }[] = [];

    let totalSize = 0;
    for (const month of months) {
      const filePath = this.getFilePath(month);
      if (fs.existsSync(filePath)) {
        const size = fs.statSync(filePath).size;
        totalSize += size;
        files.push({ month, size });
      }
    }

    const currentMonth = this.getCurrentMonthKey();
    const currentMonthFile = this.getFilePath(currentMonth);
    const currentMonthSize = fs.existsSync(currentMonthFile)
      ? fs.statSync(currentMonthFile).size
      : 0;

    return {
      totalMonths: months.length,
      currentMonth,
      currentMonthSize,
      totalSize,
      files
    };
  }
}

// Singleton instance
let storageManagerInstance: FileStorageManager | null = null;

export function getStorageManager(pluginId: string = 'openclaw-github-trending'): FileStorageManager {
  if (!storageManagerInstance) {
    storageManagerInstance = new FileStorageManager(pluginId);
  }
  return storageManagerInstance;
}

export default FileStorageManager;
