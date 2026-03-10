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
  static buildCard(
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

    const title = `GitHub 热榜推送 - ${dateStr}`;

    const elements: any[] = [];

    // Add new repositories section if has new repos
    if (newRepositories.length > 0) {
      elements.push({
        tag: 'div',
        text: {
          content: '**🔥 新上榜项目**',
          tag: 'lark_md'
        }
      });
      elements.push({
        tag: 'hr',
        dir: 'horizontal'
      });
      newRepositories.forEach((repo, index) => {
        elements.push(FeishuChannel.buildRepoElement(repo, index, true));
      });
    }

    // Add seen repositories section if has seen repos
    if (seenRepositories.length > 0) {
      // Add spacing between sections
      if (newRepositories.length > 0) {
        elements.push({
          tag: 'div',
          text: {
            content: ' ',
            tag: 'lark_md'
          }
        });
      }

      elements.push({
        tag: 'div',
        text: {
          content: '**⭐ 持续霸榜项目**',
          tag: 'lark_md'
        }
      });
      elements.push({
        tag: 'hr',
        dir: 'horizontal'
      });
      seenRepositories.forEach((repo, index) => {
        elements.push(FeishuChannel.buildRepoElement(repo, index, false));
      });
    }

    // If no repositories, show message
    if (elements.length === 0) {
      elements.push({
        tag: 'div',
        text: {
          content: '📌 暂无 trending 项目',
          tag: 'lark_md'
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
        template: 'blue'
      },
      elements: elements
    };
  }

  /**
   * Build a single repository card element
   * @param repo Repository information
   * @param index Index of repository
   * @param isNew Whether this is a new repository
   * @returns Feishu card element
   */
  static buildRepoElement(repo: RepositoryInfo, index: number, isNew: boolean): any {
    const starText = FeishuChannel.formatNumberWithK(repo.stars);
    const forkText = repo.forks ? ` · ${FeishuChannel.formatNumberWithK(repo.forks)} Forks` : '';
    const languageBadge = repo.language
      ? ` <badge text="${repo.language}" bg_color="${FeishuChannel.getLanguageColor(repo.language)}"/>`
      : '';

    // 新上榜项目：显示完整 AI 摘要
    // 持续霸榜项目：显示简化摘要（一句话）
    const aiSummaryText = isNew
      ? (repo.ai_summary
          ? `\n\n**🤖 AI 摘要：**\n${FeishuChannel.escapeMarkdown(repo.ai_summary)}`
          : '')
      : (repo.ai_summary
          ? `\n\n_${repo.ai_summary.split('。')[0]}。_`
          : '');

    // 仓库名称加粗，更醒目
    const repoName = `**${repo.full_name}**`;

    return {
      tag: 'div',
      text: {
        content: `${repoName}\n<font color="${FeishuChannel.getStarColor(repo.stars)}">🌟 ${starText}</font>${forkText}${languageBadge}\n\n${FeishuChannel.escapeMarkdown(repo.description)}${aiSummaryText}`,
        tag: 'lark_md'
      },
      extra: {
        tag: 'button',
        text: {
          content: '查看详情',
          tag: 'lark_md'
        },
        type: isNew ? 'primary' : 'default',
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
  static formatNumberWithK(num: number): string {
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
  static getStarColor(stars: number): string {
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
  static getLanguageColor(language: string): string {
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
   * Escape markdown characters in text for Feishu lark_md
   * @param text Markdown text
   * @returns Escaped text
   */
  static escapeMarkdown(text: string): string {
    return text
      // 转义 HTML 特殊字符
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      // 转义 Markdown 特殊字符
      .replace(/\*/g, '\\*')      // 粗体
      .replace(/_/g, '\\_')       // 斜体
      .replace(/`/g, '\\`')       // 代码
      .replace(/\[/g, '\\[')      // 链接
      .replace(/\]/g, '\\]')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)')
      // 将换行符替换为空格（飞书卡片不支持多行）
      .replace(/\n/g, ' ');
  }

  /**
   * Push repositories to Feishu webhook
   * @param newRepositories Array of new repositories
   * @param seenRepositories Array of seen repositories
   * @returns Push result
   */
  static async push(
    webhookUrl: string,
    newRepositories: RepositoryInfo[],
    seenRepositories: RepositoryInfo[]
  ): Promise<PushResult> {
    const card = FeishuChannel.buildCard(newRepositories, seenRepositories);

    try {
      const response = await axios.post(webhookUrl, card, {
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
