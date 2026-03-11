import axios from 'axios';
import { RepositoryInfo } from '../models/repository';
import { PushResult } from './types';

/**
 * Feishu Channel for pushing GitHub trending repositories
 */
export class FeishuChannel {
  /**
   * Build Feishu card message
   * @param newRepositories Array of new repositories to display
   * @param seenRepositories Array of seen repositories to display
   * @param since Time period for trending
   * @returns Feishu card object
   */
  static buildCard(
    newRepositories: RepositoryInfo[],
    seenRepositories: RepositoryInfo[],
    since: 'daily' | 'weekly' | 'monthly' = 'monthly'
  ): any {
    const currentDate = new Date();
    const dateStr = currentDate.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long'
    });

    const sinceText = since === 'daily' ? '当天' : since === 'weekly' ? '本周' : '本月';

    const elements: any[] = [];

    // 新上榜项目
    if (newRepositories.length > 0) {
      elements.push({
        tag: 'div',
        text: {
          content: '**🔥 新上榜项目**',
          tag: 'lark_md'
        }
      });

      elements.push({
        tag: 'hr'
      });

      newRepositories.forEach((repo, index) => {
        const repoElements = FeishuChannel.buildRepoElement(repo, index, true);
        // 如果是最后一个项目，移除分割线
        if (index === newRepositories.length - 1) {
          repoElements.pop();
        }
        elements.push(...repoElements);
      });
    }

    // 持续霸榜项目
    if (seenRepositories.length > 0) {
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
        tag: 'hr'
      });

      seenRepositories.forEach((repo, index) => {
        const repoElements = FeishuChannel.buildRepoElement(repo, index, false);
        // 如果是最后一个项目，移除分割线
        if (index === seenRepositories.length - 1) {
          repoElements.pop();
        }
        elements.push(...repoElements);
      });
    }

    // 如果没有项目
    if (newRepositories.length === 0 && seenRepositories.length === 0) {
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
          content: `GitHub ${sinceText}热榜推送`
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
   * @returns Feishu card element array
   */
  static buildRepoElement(repo: RepositoryInfo, index: number, isNew: boolean): any[] {
    const formattedStars = FeishuChannel.formatNumberWithK(repo.stars);
    const formattedForks = repo.forks
      ? ` ⚡${FeishuChannel.formatNumberWithK(repo.forks)}`
      : '';

    // 语言显示：emoji + 语言名
    const languageText = repo.language
      ? ` ${FeishuChannel.getLanguageEmoji(repo.language)} ${repo.language}`
      : '';

    // 项目基本信息
    const repoInfo = `**${index + 1}. [${repo.full_name}](${repo.url})**\n★${formattedStars}${formattedForks}${languageText}`;

    // 新上榜项目：显示完整项目介绍
    // 持续霸榜项目：显示简化介绍
    const summaryText = isNew
      ? (repo.ai_summary
          ? `\n\n**🤖 项目介绍：**\n${repo.ai_summary}`
          : '')
      : (repo.ai_summary
          ? `\n\n${repo.ai_summary.split('。')[0]}。`
          : '');

    const elements: any[] = [];

    // 项目内容
    elements.push({
      tag: 'div',
      text: {
        content: `${repoInfo}${summaryText}`,
        tag: 'lark_md'
      }
    });

    // 项目分割线（最后一个项目不加）
    elements.push({
      tag: 'hr'
    });

    return elements;
  }

  /**
   * Get emoji icon for programming language
   * @param language Programming language
   * @returns Emoji icon
   */
  static getLanguageEmoji(language: string): string {
    const emojis: Record<string, string> = {
      JavaScript: '💻',
      TypeScript: '💻',
      Python: '🐍',
      Ruby: '💎',
      Java: '☕',
      Go: '🐹',
      Rust: '🦀',
      Swift: '🍎',
      C: '⚙️',
      'C++': '⚙️',
      'C#': '🎮',
      PHP: '🐘',
      HTML: '🌐',
      CSS: '🎨',
      Shell: '🐚',
      SQL: '🗃️',
      Kotlin: '🦾',
      Dart: '🎯',
      Vue: '💚',
      React: '⚛️',
      Angular: '🅰️',
      Node: '💚',
      Scala: '🔴',
      Elixir: '💧',
      Haskell: 'λ',
      Lua: '🌙',
      R: '📊',
      MATLAB: '🔢',
      Julia: '💜'
    };

    return emojis[language] || '📝';
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
      Dart: '#00B4AB',
      Vue: '#41b883',
      React: '#61dafb',
      Angular: '#dd1b16',
      Node: '#68a063',
      Scala: '#c22d40',
      Elixir: '#6e4a7e',
      Haskell: '#5e5086',
      Lua: '#000080',
      R: '#198ce7',
      MATLAB: '#e16737',
      Julia: '#a270ba'
    };

    return colors[language] || '#666666';
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
   * Push repositories to Feishu webhook
   * @param newRepositories Array of new repositories
   * @param seenRepositories Array of seen repositories
   * @returns Push result
   */
  static async push(
    webhookUrl: string,
    newRepositories: RepositoryInfo[],
    seenRepositories: RepositoryInfo[],
    since: 'daily' | 'weekly' | 'monthly' = 'monthly'
  ): Promise<PushResult> {
    const card = FeishuChannel.buildCard(newRepositories, seenRepositories, since);

    // 飞书卡片消息格式
    const message = {
      msg_type: 'interactive',
      card: card
    };

    try {
      const response = await axios.post(webhookUrl, message, {
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (response.status === 200) {
        return {
          success: true,
          code: response.data.code,
          msg: response.data.msg,
          error: undefined
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
