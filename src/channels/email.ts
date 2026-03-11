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
   * @param since Time period for trending (daily, weekly, monthly)
   * @returns HTML string for the email
   */
  static generateHTML(
    newRepositories: RepositoryInfo[],
    seenRepositories: RepositoryInfo[],
    since: 'daily' | 'weekly' | 'monthly' = 'monthly'
  ): string {
    const currentDate = new Date();
    const dateStr = currentDate.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long'
    });

    // 根据 since 参数确定时间范围描述
    const sinceText = since === 'daily' ? '当天' : since === 'weekly' ? '本周' : '本月';

    const NEW_REPOS_TITLE = '新上榜项目';
    const SEEN_REPOS_TITLE = '持续霸榜项目';

    // Email styles using 靛蓝色系 (indigo/blue color scheme)
    // 使用 CSS 变量提高可维护性
    const styles = `
      :root {
        --primary-color: #4A6FA5;
        --primary-light: #5B8CB3;
        --text-dark: #333;
        --text-medium: #666;
        --text-light: #888;
        --bg-light: #f5f7fa;
        --bg-card: #f9fafb;
        --border-color: #e1e4e8;
        --ai-bg: #f0f4ff;
        --ai-border: #4A6FA5;
        --ai-title-color: #2c5282;
        --new-section-bg: #fff5f5;
        --seen-section-bg: #f0f9ff;
      }

      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        background-color: var(--bg-light);
        margin: 0;
        padding: 0;
      }

      .container {
        max-width: 800px;
        margin: 20px auto;
        padding: 0 20px;
        background-color: #ffffff;
        border-radius: 8px;
        overflow: hidden;
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
      }

      .header {
        background: linear-gradient(135deg, #4A6FA5 0%, #5B8CB3 100%);
        color: white;
        padding: 40px 40px;
        text-align: center;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      }

      .header h1 {
        margin: 0;
        font-size: 32px;
        font-weight: 700;
        text-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        letter-spacing: 1px;
      }

      .header .date {
        margin-top: 12px;
        font-size: 15px;
        opacity: 0.95;
        font-weight: 500;
      }

      .content {
        padding: 30px 40px;
      }

      .section {
        margin-bottom: 30px;
        padding: 0;
        border-radius: 12px;
        background-color: #ffffff;
        border: 1px solid var(--border-color);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
        overflow: hidden;
      }

      .section-new {
        border-top: 3px solid #e53e3e;
      }

      .section-seen {
        border-top: 3px solid #3182ce;
      }

      .section-title {
        font-size: 20px;
        font-weight: 700;
        padding: 20px 25px 15px;
        margin: 0;
        background-color: #fafafa;
        border-bottom: 1px solid var(--border-color);
      }

      .section-new .section-title {
        color: #e53e3e;
      }

      .section-seen .section-title {
        color: #3182ce;
      }

      .section-title::before {
        margin-right: 8px;
      }

      .section-new .section-title::before {
        content: "🔥";
      }

      .section-seen .section-title::before {
        content: "⭐";
      }

      .section-content {
        padding: 20px 25px;
      }

      .section-new .section-title {
        color: #e53e3e;
        border-bottom: 2px solid #e53e3e;
      }

      .section-seen .section-title {
        color: #3182ce;
        border-bottom: 2px solid #3182ce;
      }

      .repo-card {
        background-color: #ffffff;
        border: 1px solid var(--border-color);
        border-radius: 8px;
        padding: 20px;
        margin-bottom: 20px;
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
        transition: box-shadow 0.2s;
      }

      .repo-card:hover {
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
      }

      .repo-card:last-child {
        margin-bottom: 0;
      }

      .repo-header {
        margin-bottom: 12px;
        display: flex;
        align-items: baseline;
        gap: 12px;
      }

      .repo-number {
        font-size: 18px;
        font-weight: 700;
        color: var(--primary-color);
        min-width: 32px;
      }

      .repo-name {
        font-size: 17px;
        font-weight: 600;
        color: var(--primary-color);
        text-decoration: none;
        transition: color 0.2s;
      }

      .repo-name:hover {
        text-decoration: underline;
        color: #3d5a80;
      }

      .repo-meta {
        font-size: 12px;
        color: var(--text-medium);
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
        color: var(--text-dark);
        line-height: 1.6;
        margin: 10px 0;
      }

      .repo-ai-summary {
        background-color: var(--ai-bg);
        border-left: 4px solid var(--ai-border);
        padding: 12px;
        margin: 10px 0;
        border-radius: 4px;
        font-size: 13px;
        line-height: 1.6;
        color: var(--text-dark);
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
      }

      .repo-ai-summary-title {
        font-weight: 600;
        color: var(--ai-title-color);
        margin-bottom: 6px;
        font-size: 13px;
      }

      .repo-simple-summary {
        color: var(--text-medium);
        font-size: 13px;
        margin: 8px 0;
        padding-left: 12px;
        border-left: 3px solid var(--text-light);
      }

      .repo-footer {
        font-size: 12px;
        color: var(--text-light);
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
        color: var(--text-light);
        font-size: 14px;
      }

      .footer {
        background-color: var(--bg-light);
        padding: 20px 40px;
        text-align: center;
        font-size: 12px;
        color: var(--text-light);
        border-top: 1px solid var(--border-color);
      }

      .link {
        color: var(--primary-color);
        text-decoration: none;
      }

      /* 响应式设计 */
      @media (max-width: 600px) {
        .container {
          margin: 0;
          padding: 0;
          border-radius: 0;
        }

        .header {
          padding: 20px;
        }

        .header h1 {
          font-size: 24px;
        }

        .content {
          padding: 20px;
        }

        .section {
          padding: 15px;
        }

        .repo-card {
          padding: 12px;
        }

        .repo-name {
          font-size: 15px;
        }

        .repo-desc {
          font-size: 13px;
        }

        .repo-ai-summary {
          padding: 10px;
          font-size: 12px;
        }
      }
    `;

    // Build new repositories section HTML
    const buildReposHTML = (repos: RepositoryInfo[], titleText: string, isNew: boolean): string => {
      // 问题3：当项目数为0时不显示该模块
      if (repos.length === 0) {
        return '';
      }

      const reposHTML = repos
        .map((repo, index) => {
          const formattedStars = EmailChannel.formatNumberWithK(repo.stars);
          const formattedForks = repo.forks
            ? `<span class="fork-icon" aria-hidden="true">⚡</span>${EmailChannel.formatNumberWithK(repo.forks)}`
            : '';
          const languageBadge = repo.language
            ? `<span class="repo-lang" style="background-color: ${EmailChannel.getLanguageColor(
                repo.language
              )}">${repo.language}</span>`
            : '';

          // 新上榜项目：显示详细项目介绍
          // 持续霸榜项目：显示简化介绍（一句话）
          const aiSummaryHTML = isNew
            ? (repo.ai_summary
                ? `<div class="repo-ai-summary" role="complementary" aria-label="项目介绍">
                     <div class="repo-ai-summary-title"><span aria-hidden="true">🤖</span> 项目介绍</div>
                     ${markdown.markdownToHTML(repo.ai_summary)}
                   </div>`
                : '')
            : (repo.ai_summary
                ? `<div class="repo-simple-summary">${markdown.markdownToHTML(repo.ai_summary.split('。')[0] + '。')}</div>`
                : '');

          const repoNumber = index + 1;

          return `
            <article class="repo-card" aria-label="${repo.full_name} 项目详情">
              <div class="repo-header">
                <span class="repo-number">${repoNumber}.</span>
                <a href="${repo.url}" class="repo-name" target="_blank" rel="noopener noreferrer" aria-label="访问 ${repo.full_name} 仓库">
                  ${repo.full_name}
                </a>
              </div>
              <div class="repo-meta">
                <span class="star-icon" aria-hidden="true">★</span><span aria-label="${repo.stars} stars">${formattedStars}</span>${formattedForks}${languageBadge}
              </div>
              ${aiSummaryHTML}
            </article>
          `;
        })
        .join('');

      return `
        <section class="section ${isNew ? 'section-new' : 'section-seen'}" aria-label="${titleText}">
          <h2 class="section-title">${titleText}</h2>
          <div class="section-content">
            ${reposHTML}
          </div>
        </section>
      `;
    };

    const newReposHTML = buildReposHTML(
      newRepositories,
      '新上榜项目',
      true
    );
    const seenReposHTML = buildReposHTML(
      seenRepositories,
      '持续霸榜项目',
      false
    );

    // If no repositories, show message
    const contentHTML =
      newRepositories.length === 0 && seenRepositories.length === 0
        ? `
          <main class="content">
            <div class="no-repos" role="status">📌 暂无 trending 项目</div>
          </main>
        `
        : `
          <main class="content">
            ${newReposHTML}
            ${seenReposHTML}
          </main>
        `;

    return `
      <!DOCTYPE html>
      <html lang="zh-CN">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>GitHub 热榜推送</title>
        <style>${styles}</style>
      </head>
      <body>
        <div class="container" role="main">
          <header class="header">
            <h1>GitHub ${sinceText}热榜推送</h1>
            <time class="date" datetime="${currentDate.toISOString()}">${dateStr}</time>
          </header>
          ${contentHTML}
          <footer class="footer">
            <p>本邮件由 GitHub 热榜机器人自动生成</p>
            <p><a href="https://github.com/indigos" class="link" aria-label="访问 GitHub Trending 主页">GitHub Trending</a></p>
          </footer>
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
   * @param config Email configuration
   * @param newRepositories Array of new repositories
   * @param seenRepositories Array of seen repositories
   * @param since Time period for trending (daily, weekly, monthly)
   * @returns Push result
   */
  static async send(
    config: EmailConfig,
    newRepositories: RepositoryInfo[],
    seenRepositories: RepositoryInfo[],
    since: 'daily' | 'weekly' | 'monthly' = 'monthly'
  ): Promise<PushResult> {
    try {
      // Create transport with SMTP configuration
      const transport: Transporter = nodemailer.createTransport({
        host: config.smtp.host,
        port: config.smtp.port,
        secure: config.smtp.secure,
        auth: {
          user: config.smtp.auth.user,
          pass: config.smtp.auth.pass
        }
      });

      // Generate HTML content
      const html = EmailChannel.generateHTML(newRepositories, seenRepositories, since);

      // Send email
      const info = await transport.sendMail({
        from: config.from,
        to: config.to,
        subject: config.subject,
        html: html
      });

      return {
        success: true,
        messageId: info.messageId,
        error: undefined
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
