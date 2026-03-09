import { HistoryData, HistoryProject } from '../models/history';
import { RepositoryInfo } from '../models/repository';
import * as fs from 'fs';
import * as path from 'path';

/**
 * History Manager for tracking processed repositories
 * Persists history to a JSON file and provides methods to manage seen/new repositories
 */
export class HistoryManager {
  private historyPath: string;
  private data: HistoryData;

  /**
   * Create a new HistoryManager instance
   * @param historyPath Path to the history JSON file
   */
  constructor(historyPath: string = this.getDefaultHistoryPath()) {
    this.historyPath = historyPath;
    // Initialize data first, then load if file exists
    this.data = { projects: {} };
    this.loadHistory();
  }

  /**
   * Get the default history path (in the project root)
   */
  private getDefaultHistoryPath(): string {
    // Try to find a reasonable default location
    // In a plugin context, this might be configured externally
    return path.join(process.cwd(), '.github-trending-history.json');
  }

  /**
   * Load history from file
   */
  private loadHistory(): void {
    try {
      if (fs.existsSync(this.historyPath)) {
        const content = fs.readFileSync(this.historyPath, 'utf-8');
        this.data = JSON.parse(content);
      }
    } catch (error) {
      console.warn('Failed to load history file, starting fresh:', error);
      // Initialize with empty project if file doesn't exist or error
      this.data = { projects: {} };
    }
  }

  /**
   * Save history to file
   */
  private saveHistory(): void {
    try {
      fs.writeFileSync(this.historyPath, JSON.stringify(this.data, null, 2));
    } catch (error) {
      console.warn('Failed to save history file:', error);
    }
  }

  /**
   * Get all stored project keys
   */
  getProjectKeys(): string[] {
    return Object.keys(this.data.projects);
  }

  /**
   * Check if a repository is in the history
   * @param fullName Repository full name (owner/repo)
   */
  isSeen(fullName: string): boolean {
    return !!this.data.projects[fullName];
  }

  /**
   * Get a stored project by full name
   * @param fullName Repository full name (owner/repo)
   */
  getProject(fullName: string): HistoryProject | undefined {
    return this.data.projects[fullName];
  }

  /**
   * Get projects that are not in the current trending list
   * @param currentRepos Current trending repositories
   */
  getLostProjects(currentRepos: RepositoryInfo[]): HistoryProject[] {
    const currentKeys = new Set(currentRepos.map(r => r.full_name));
    return Object.values(this.data.projects).filter(p => !currentKeys.has(p.full_name));
  }

  /**
   * Mark repositories as seen and update their information
   * @param repos Repositories to mark as seen
   * @returns Array of newly seen repositories (not previously in history)
   */
  markSeen(repos: RepositoryInfo[]): { newlySeen: RepositoryInfo[]; alreadySeen: RepositoryInfo[] } {
    const newlySeen: RepositoryInfo[] = [];
    const alreadySeen: RepositoryInfo[] = [];

    const now = new Date().toISOString();

    repos.forEach(repo => {
      if (this.data.projects[repo.full_name]) {
        // Update existing project
        const existing = this.data.projects[repo.full_name];
        existing.stars = repo.stars;
        existing.url = repo.url;
        alreadySeen.push(repo);
      } else {
        // Add new project
        this.data.projects[repo.full_name] = {
          full_name: repo.full_name,
          url: repo.url,
          stars: repo.stars,
          ai_summary: repo.ai_summary || '',
          first_seen: now
        };
       (repo as any).first_seen = now;
        newlySeen.push(repo);
      }
    });

    this.saveHistory();
    return { newlySeen, alreadySeen };
  }

  /**
   * Update AI summary for a repository
   * @param fullName Repository full name
   * @param summary AI summary to store
   */
  updateAiSummary(fullName: string, summary: string): void {
    if (this.data.projects[fullName]) {
      this.data.projects[fullName].ai_summary = summary;
      this.saveHistory();
    }
  }

  /**
   * Export all history data
   */
  exportData(): HistoryData {
    return { ...this.data };
  }

  /**
   * Import history data from an external source
   * @param data History data to import
   */
  importData(data: HistoryData): void {
    this.data = data;
    this.saveHistory();
  }

  /**
   * Clear all history
   */
  clear(): void {
    this.data = { projects: {} };
    this.saveHistory();
  }
}

export default HistoryManager;
