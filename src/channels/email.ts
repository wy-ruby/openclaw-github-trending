import * as markdown from '../utils/markdown';
import { RepositoryInfo } from '../models/repository';
import { PushResult } from './types';
import nodemailer, { Transporter } from 'nodemailer';

/**
 * Email configuration interface
 */
export interface EmailConfig {
  from: string;
  to: string;
  subject: string;
  smtp: {
    host: string;
    port: number;
    secure: boolean;
    auth: {
      user: string;
      pass: string;
    };
  };
}

/**
 * Email Channel for pushing GitHub trending repositories via email
 */
export class EmailChannel {
  private config: EmailConfig;

  /**
   * Create an email channel instance
   * @param config Email configuration
   */
  constructor(config: EmailConfig) {
    this.config = config;
  }

  /**
   * Generate HTML email content from repositories
   * @param newRepositories Array of new repositories to display
   * @param seenRepositories Array of seen repositories to display
   * @returns HTML string for the email
   */
  static generateHTML(
    newRepositories: RepositoryInfo[],
    seenRepositories: RepositoryInfo[]
  ): string {
    const currentDate = new Date();
    const dateStr = currentDate.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long'
    });

    const NEW_REPOS_TITLE = '新上榜项目';
    const SEEN_REPOS_TITLE = '持续霸榜项目';

    // Email styles using 靛蓝色系 (indigo/blue color scheme)
    const styles = `
      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        background-color: #f5f7fa;
        margin: 0;
        padding: 0;
      }
      .container {
        max-width: 800px;
        margin: 20px auto;
        background-color: #ffffff;
        border-radius: 8px;
        overflow: hidden;
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
      }
      .header {
        background: linear-gradient(135deg, #4A6FA5 0%, #5B8CB3 100%);
        color: white;
        padding: 30px 40px;
        text-align: center;
      }
      .header h1 {
        margin: 0;
        font-size: 28px;
        font-weight: 600;
      }
      .header .date {
        margin-top: 10px;
        font-size: 14px;
        opacity: 0.9;
      }
      .content {
        padding: 30px 40px;
      }
      .section {
        margin-bottom: 30px;
      }
      .section-title {
        font-size: 18px;
        font-weight: 600;
        color: #333;
        padding-bottom: 10px;
        border-bottom: 2px solid #4A6FA5;
        margin-bottom: 20px;
      }
      .repo-card {
        background-color: #f9fafb;
        border: 1px solid #e1e4e8;
        border-radius: 6px;
        padding: 15px;
        margin-bottom: 15px;
      }
      .repo-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 10px;
      }
      .repo-name {
        font-size: 16px;
        font-weight: 600;
        color: #4A6FA5;
        text-decoration: none;
      }
      .repo-name:hover {
        text-decoration: underline;
      }
      .repo-meta {
        font-size: 12px;
        color: #666;
        margin-top: 5px;
      }
      .repo-lang {
        display: inline-block;
        padding: 2px 8px;
        border-radius: 3px;
        font-size: 11px;
        font-weight: 600;
        margin-left: 10px;
        color: white;
      }
      .repo-desc {
        font-size: 14px;
        color: #333;
        line-height: 1.6;
        margin: 10px 0;
      }
      .repo-footer {
        display: flex;
        align-items: center;
        font-size: 12px;
        color: #888;
        margin-top: 10px;
      }
      .star-icon {
        color: #f1c40f;
        margin-right: 4px;
      }
      .fork-icon {
        color: #e74c3c;
        margin-left: 15px;
        margin-right: 4px;
      }
      .no-repos {
        text-align: center;
        padding: 40px;
        color: #888;
        font-size: 14px;
      }
      .footer {
        background-color: #f5f7fa;
        padding: 20px 40px;
        text-align: center;
        font-size: 12px;
        color: #888;
        border-top: 1px solid #e1e4e8;
      }
      .link {
        color: #4A6FA5;
        text-decoration: none;
      }
    `;

    // Build new repositories section HTML
    const buildReposHTML = (repos: RepositoryInfo[], title: string): string => {
      if (repos.length === 0) {
        return `
          <div class="section">
            <div class="section-title">${title}</div>
            <div class="no-repos">暂无数据</div>
          </div>
        `;
      }

      const reposHTML = repos
        .map((repo) => {
          const formattedStars = EmailChannel.formatNumberWithK(repo.stars);
          const formattedForks = repo.forks
            ? `<span class="fork-icon">⚡</span>${EmailChannel.formatNumberWithK(repo.forks)}`
            : '';
          const languageBadge = repo.language
            ? `<span class="repo-lang" style="background-color: ${EmailChannel.getLanguageColor(
                repo.language
              )}">${repo.language}</span>`
            : '';
          const description = markdown.markdownToHTML(repo.description);

          return `
            <div class="repo-card">
              <div class="repo-header">
                <a href="${repo.url}" class="repo-name" target="_blank">${repo.full_name}</a>
              </div>
              <div class="repo-meta">
                <span class="star-icon">★</span>${formattedStars}${formattedForks}${languageBadge}
              </div>
              <div class="repo-desc">${description}</div>
            </div>
          `;
        })
        .join('');

      return `
        <div class="section">
          <div class="section-title">${title}</div>
          ${reposHTML}
        </div>
      `;
    };

    const newReposHTML = buildReposHTML(
      newRepositories,
      `<span style="color: #e74c3c;">🔥</span> ${NEW_REPOS_TITLE}`
    );
    const seenReposHTML = buildReposHTML(
      seenRepositories,
      `<span style="color: #f39c12;">⭐</span> ${SEEN_REPOS_TITLE}`
    );

    // If no repositories, show message
    const contentHTML =
      newRepositories.length === 0 && seenRepositories.length === 0
        ? `
          <div class="content">
            <div class="no-repos">📌 暂无 trending 项目</div>
          </div>
        `
        : `
          <div class="content">
            ${newReposHTML}
            ${seenReposHTML}
          </div>
        `;

    return `
      <!DOCTYPE html>
      <html lang="zh-CN">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>GitHub Trending</title>
        <style>${styles}</style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>GitHub Trending</h1>
            <div class="date">${dateStr}</div>
          </div>
          ${contentHTML}
          <div class="footer">
            <p>This email was generated automatically by GitHub Trending Bot.</p>
            <p><a href="https://github.com/indigos" class="link">GitHub Trending</a></p>
          </div>
        </div>
      </body>
      </html>
    `;
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
   * Send email with repositories
   * @param newRepositories Array of new repositories
   * @param seenRepositories Array of seen repositories
   * @returns Push result
   */
  async send(
    newRepositories: RepositoryInfo[],
    seenRepositories: RepositoryInfo[]
  ): Promise<PushResult> {
    try {
      // Create transport with SMTP configuration
      const transport: Transporter = nodemailer.createTransport({
        host: this.config.smtp.host,
        port: this.config.smtp.port,
        secure: this.config.smtp.secure,
        auth: {
          user: this.config.smtp.auth.user,
          pass: this.config.smtp.auth.pass
        }
      });

      // Generate HTML content
      const html = EmailChannel.generateHTML(newRepositories, seenRepositories);

      // Send email
      const info = await transport.sendMail({
        from: this.config.from,
        to: this.config.to,
        subject: this.config.subject,
        html: html
      });

      return {
        success: true,
        messageId: info.messageId
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}

export default EmailChannel;
