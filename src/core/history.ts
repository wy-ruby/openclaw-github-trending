import { RepositoryInfo } from '../models/repository';

export interface RepositoryHistory {
  full_name: string;
  url: string;
  stars: number;
  ai_summary: string;
  first_seen: string;
  last_seen: string;
  last_stars: number;
  push_count: number;
  last_pushed?: string;
}

export interface HistoryData {
  repositories: Record<string, RepositoryHistory>;
  last_updated: string;
}

export interface HistoryConfig {
  enabled: boolean;
  star_threshold: number;
}

/**
 * History Manager for tracking processed repositories
 * Provides smart deduplication based on star growth
 */
export class HistoryManager {
  private data: HistoryData;

  constructor() {
    this.data = {
      repositories: {},
      last_updated: new Date().toISOString()
    };
  }

  /**
   * Import existing history data
   */
  importData(data: HistoryData): void {
    this.data = data;
  }

  /**
   * Export history data for persistence
   */
  exportData(): HistoryData {
    this.data.last_updated = new Date().toISOString();
    return this.data;
  }

  /**
   * Get a repository's history by full name
   */
  getProject(fullName: string): RepositoryHistory | undefined {
    return this.data.repositories[fullName];
  }

  /**
   * Determine if a repository should be pushed again
   */
  shouldPushAgain(repo: RepositoryInfo, history: RepositoryHistory, config: HistoryConfig): boolean {
    // Never pushed before
    if (!history.last_pushed) {
      return true;
    }

    // Stars increased significantly
    const starGrowth = repo.stars - history.last_stars;
    if (starGrowth >= config.star_threshold) {
      return true;
    }

    return false;
  }

  /**
   * Categorize repositories into new, should push, and already seen
   */
  categorizeRepositories(
    repositories: RepositoryInfo[],
    config: HistoryConfig
  ): {
    newlySeen: RepositoryInfo[];
    shouldPush: RepositoryInfo[];
    alreadySeen: RepositoryInfo[];
  } {
    const newlySeen: RepositoryInfo[] = [];
    const shouldPush: RepositoryInfo[] = [];
    const alreadySeen: RepositoryInfo[] = [];

    for (const repo of repositories) {
      const history = this.data.repositories[repo.full_name];

      if (!history) {
        // First time seeing this repository
        newlySeen.push(repo);
        shouldPush.push(repo);
      } else if (config.enabled && this.shouldPushAgain(repo, history, config)) {
        // Seen before, but should push again (star growth)
        shouldPush.push(repo);
        alreadySeen.push(repo);
      } else {
        // Seen before, don't push again
        alreadySeen.push(repo);
      }
    }

    return { newlySeen, shouldPush, alreadySeen };
  }

  /**
   * Mark repositories as pushed and update history
   */
  markPushed(repositories: RepositoryInfo[]): void {
    const now = new Date().toISOString();

    for (const repo of repositories) {
      const existing = this.data.repositories[repo.full_name];

      if (existing) {
        // Update existing record
        existing.last_seen = now;
        existing.last_stars = repo.stars;
        existing.stars = repo.stars;
        existing.ai_summary = repo.ai_summary || existing.ai_summary;
        existing.push_count += 1;
        existing.last_pushed = now;
      } else {
        // Create new record
        this.data.repositories[repo.full_name] = {
          full_name: repo.full_name,
          url: repo.url,
          stars: repo.stars,
          ai_summary: repo.ai_summary || '',
          first_seen: now,
          last_seen: now,
          last_stars: repo.stars,
          push_count: 1,
          last_pushed: now
        };
      }
    }
  }

  /**
   * Update AI summary for a repository
   */
  updateAiSummary(fullName: string, summary: string): void {
    const history = this.data.repositories[fullName];
    if (history) {
      history.ai_summary = summary;
    }
  }

  /**
   * Get statistics about history
   */
  getStats(): {
    total_repositories: number;
    total_pushes: number;
    oldest_entry?: string;
    newest_entry?: string;
  } {
    const repos = Object.values(this.data.repositories);
    const total_pushes = repos.reduce((sum, r) => sum + r.push_count, 0);

    const timestamps = repos.map(r => r.first_seen).sort();

    return {
      total_repositories: repos.length,
      total_pushes,
      oldest_entry: timestamps[0],
      newest_entry: timestamps[timestamps.length - 1]
    };
  }
}

export default HistoryManager;