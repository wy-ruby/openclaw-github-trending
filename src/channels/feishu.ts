import axios from 'axios';
import { RepositoryInfo } from '../models/repository';
import { FeishuCard, PushResult } from './types';

/**
 * Feishu Channel for pushing GitHub trending repositories
 */
export class FeishuChannel {
  private webhookUrl: string;

  /**
   * Create a Feishu channel instance
   * @param webhookUrl Feishu webhook URL
   */
  constructor(webhookUrl: string) {
    this.webhookUrl = webhookUrl;
  }

  /**
   * Build a Feishu rich text card for repositories
   * @param newRepositories Array of new repositories to display
   * @param seenRepositories Array of seen repositories to display
   * @returns Feishu card object
   */
  private buildCard(
    newRepositories: RepositoryInfo[],
    seenRepositories: RepositoryInfo[]
  ): FeishuCard {
    const currentDate = new Date();
    const dateStr = currentDate.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long'
    });

    const title = `GitHub Trending - ${dateStr}`;

    // Build new repositories section
    const newReposSection = this.buildRepositoriesSection(
      '🔥 新上榜项目',
      newRepositories,
      'waph'
    );

    // Build seen repositories section (pinned/constant榜)
    const seenReposSection = this.buildRepositoriesSection(
      '⭐ 持续霸榜项目',
      seenRepositories,
      'gray'
    );

    const elements: any[] = [];

    // Add new repositories section if has new repos
    if (newRepositories.length > 0) {
      elements.push(newReposSection);
    }

    // Add seen repositories section if has seen repos
    if (seenRepositories.length > 0) {
      elements.push(seenReposSection);
    }

    // If no repositories, show message
    if (elements.length === 0) {
      elements.push({
        tag: 'div',
        text: {
          content: '📌 暂无 trending 项目',
          tag: 'l ambitions-text'
        }
      });
    }

    return {
      config: {
        wide_screen_mode: true
      },
      header: {
        title: {
          tag: 'plain_text',
          content: title
        },
        template: 'waph'
      },
      elements: elements
    };
  }

  /**
   * Build a section for repositories list
   * @param title Section title
   * @param repositories Array of repositories
   * @param template Card template color
   * @returns Feishu card section element
   */
  private buildRepositoriesSection(
    title: string,
    repositories: RepositoryInfo[],
    template: string
  ): any {
    const elements: any[] = [
      {
        tag: 'div',
        text: {
          content: title,
          tag: 'l aims-text'
        },
        extra: {
          tag: 'icon',
          icon_type: 'highlight',
          tips: title
        }
      }
    ];

    // Add separator line
    elements.push({
      tag: 'hr',
      dir: 'horizontal'
    });

    // Build repository cards
    repositories.forEach((repo, index) => {
      const repoElement = this.buildRepoElement(repo, index);
      elements.push(repoElement);
    });

    return {
      tag: 'div',
      elements: elements
    };
  }

  /**
   * Build a single repository card element
   * @param repo Repository information
   * @param index Index of repository
   * @returns Feishu card element
   */
  private buildRepoElement(repo: RepositoryInfo, index: number): any {
    const starText = this.formatNumberWithK(repo.stars);
    const forkText = repo.forks ? ` · ${this.formatNumberWithK(repo.forks)} Forks` : '';
    const languageBadge = repo.language
      ? ` <badge text="${repo.language}" bg_color="${this.getLanguageColor(repo.language)}"/>`
      : '';

    return {
      tag: 'div',
      text: {
        content: `<font color="${this.getStarColor(repo.stars)}">🌟 ${starText}</font>${forkText}${languageBadge}\n${this.escapeMarkdown(repo.description)}`,
        tag: 'l aims-text'
      },
      extra: {
        tag: 'button',
        text: {
          content: '👀 查看',
          tag: 'l aims-text'
        },
        type: 'primary',
        value: {
          url: repo.url
        }
      }
    };
  }

  /**
   * Format number with 'k' suffix for thousands
   * @param num Number to format
   * @returns Formatted string
   */
  private formatNumberWithK(num: number): string {
    if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'k';
    }
    return num.toString();
  }

  /**
   * Get color based on star count
   * @param stars Number of stars
   * @returns Color code
   */
  private getStarColor(stars: number): string {
    if (stars >= 10000) return 'red';
    if (stars >= 5000) return 'orange';
    if (stars >= 1000) return 'blue';
    return 'gray';
  }

  /**
   * Get background color based on programming language
   * @param language Programming language
   * @returns Color code
   */
  private getLanguageColor(language: string): string {
    const colors: Record<string, string> = {
      JavaScript: '#f1e05a',
      TypeScript: '#3178c6',
      Python: '#3572A5',
      Ruby: '#701516',
      Java: '#b07219',
      Go: '#00ADD8',
      Rust: '#dea584',
      Swift: '#ffac45',
      C: '#555555',
      'C++': '#f34b7d',
      'C#': '#178600',
      PHP: '#8993bd',
      HTML: '#e34c26',
      CSS: '#563d7c',
      Shell: '#89e051',
      SQL: '#e38c00',
      Kotlin: '#A97BFF',
      Dart: '#00B4AB'
    };

    return colors[language] || '#666666';
  }

  /**
   * Escape markdown characters in text
   * @param text Markdown text
   * @returns Escaped text
   */
  private escapeMarkdown(text: string): string {
    // Replace newlines with space for card display
    return text.replace(/\n/g, ' ');
  }

  /**
   * Push repositories to Feishu webhook
   * @param newRepositories Array of new repositories
   * @param seenRepositories Array of seen repositories
   * @returns Push result
   */
  async push(
    newRepositories: RepositoryInfo[],
    seenRepositories: RepositoryInfo[]
  ): Promise<PushResult> {
    const card = this.buildCard(newRepositories, seenRepositories);

    try {
      const response = await axios.post(this.webhookUrl, card, {
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (response.status === 200) {
        return {
          success: true,
          code: response.data.code,
          msg: response.data.msg
        };
      } else {
        return {
          success: false,
          code: response.status,
          error: `HTTP ${response.status}: ${response.statusText}`
        };
      }
    } catch (error) {
      if (axios.isAxiosError(error)) {
        return {
          success: false,
          error: error.message
        };
      }
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}

export default FeishuChannel;
