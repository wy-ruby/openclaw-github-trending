import { RepositoryInfo } from '../models/repository';
import { PushResult } from './types';
import { Logger } from '../utils/logger';

const logger = Logger.get('WeChatChannel');

/**
 * WeChat channel configuration
 */
export interface WeChatConfig {
  enabled?: boolean;
  receiver_id?: string;
  bot_account_id?: string;
  channel_name?: string;
}

/**
 * WeChat Channel - 通过企业微信推送 GitHub 热榜
 */
export class WeChatChannel {
  /**
   * 构建纯文本消息（企业微信不支持 markdown）
   */
  static buildPlainText(
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

    const sinceTextMap: Record<'daily' | 'weekly' | 'monthly', string> = {
      daily: '今日',
      weekly: '本周',
      monthly: '本月'
    };
    const sinceText = sinceTextMap[since];

    const lines: string[] = [];

    // Header
    lines.push(`🚀 GitHub ${sinceText}热榜推送`);
    lines.push(`📅 ${dateStr}`);
    lines.push('');

    // New repositories
    if (newRepositories.length > 0) {
      lines.push(`━━━ 🔥 新上榜项目 (${newRepositories.length}) ━━━`);
      lines.push('');

      newRepositories.forEach((repo, index) => {
        const formattedStars = WeChatChannel.formatNumberWithK(repo.stars);
        const formattedForks = repo.forks ? ` ⚡${WeChatChannel.formatNumberWithK(repo.forks)}` : '';
        const language = repo.language ? ` · ${repo.language}` : '';

        lines.push(`【${index + 1}】${repo.full_name}`);
        lines.push(`⭐ ${formattedStars}${formattedForks}${language}`);
        lines.push(repo.url);

        if (repo.ai_summary) {
          lines.push('');
          lines.push('🤖 项目介绍：');
          const summaryLines = WeChatChannel.wrapText(repo.ai_summary, 50);
          summaryLines.forEach(line => {
            lines.push(`  ${line}`);
          });
        }

        if (index < newRepositories.length - 1) {
          lines.push('');
          lines.push('━━━');
          lines.push('');
        }
      });
    }

    // Seen repositories
    if (seenRepositories.length > 0) {
      if (newRepositories.length > 0) {
        lines.push('');
        lines.push('');
      }

      lines.push(`━━━ ⭐ 持续霸榜项目 (${seenRepositories.length}) ━━━`);
      lines.push('');

      seenRepositories.forEach((repo, index) => {
        const formattedStars = WeChatChannel.formatNumberWithK(repo.stars);
        const formattedForks = repo.forks ? ` ⚡${WeChatChannel.formatNumberWithK(repo.forks)}` : '';
        const language = repo.language ? ` · ${repo.language}` : '';

        lines.push(`【${index + 1}】${repo.full_name}`);
        lines.push(`⭐ ${formattedStars}${formattedForks}${language}`);
        lines.push(repo.url);

        if (repo.ai_summary) {
          lines.push('');
          const firstSentence = repo.ai_summary.split('.')[0] + '.';
          const wrappedLines = WeChatChannel.wrapText(firstSentence, 50);
          lines.push('🤖 简介：');
          wrappedLines.forEach(line => {
            lines.push(`  ${line}`);
          });
        }

        if (index < seenRepositories.length - 1) {
          lines.push('');
          lines.push('━━━');
          lines.push('');
        }
      });
    }

    // No repositories
    if (newRepositories.length === 0 && seenRepositories.length === 0) {
      lines.push('📌 暂无 trending 项目');
    }

    // Footer
    lines.push('');
    lines.push('');
    lines.push('━━━━━━━━━━━━━━━━━━━━━━');
    lines.push('✨ 本消息由 GitHub 热榜机器人自动生成');
    lines.push('🔗 https://github.com/wy-ruby/openclaw-github-trending');

    return lines.join('\n');
  }

  /**
   * 文本自动换行
   */
  static wrapText(text: string, maxWidth: number = 60): string[] {
    const lines: string[] = [];
    let currentLine = '';

    const words = text.split(/(?<=[\u4e00-\u9fa5])|(?=[\u4e00-\u9fa5])|\s+/).filter(w => w);

    for (const word of words) {
      if ((currentLine + word).length <= maxWidth) {
        currentLine += word;
      } else {
        if (currentLine) lines.push(currentLine.trim());
        currentLine = word;
      }
    }

    if (currentLine) lines.push(currentLine.trim());
    return lines;
  }

  /**
   * 格式化数字（添加 k 后缀）
   */
  static formatNumberWithK(num: number): string {
    if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'k';
    }
    return num.toString();
  }

  /**
   * 发送消息到微信（通过 openclaw CLI）
   */
  static async send(
    content: string,
    openclawApi: any,
    config: WeChatConfig
  ): Promise<PushResult> {
    const startTime = Date.now();

    const receiverId = config.receiver_id || process.env.OPENCLAW_WECHAT_RECEIVER_ID;
    const botAccountId = config.bot_account_id || process.env.OPENCLAW_WECHAT_BOT_ACCOUNT_ID;
    const channelName = config.channel_name || 'openclaw-weixin';

    if (!receiverId) {
      logger.error('WeChat receiver_id not configured');
      return {
        success: false,
        error: 'WeChat receiver_id 未配置'
      };
    }

    logger.info('Sending WeChat message', {
      receiverId: receiverId ? `${receiverId.substring(0, 4)}****` : 'not set',
      contentLength: content.length
    });

    const result = await this.sendViaCli(content, receiverId, botAccountId, channelName);

    const duration = Date.now() - startTime;
    if (result.success) {
      logger.info('WeChat send completed', { durationMs: duration });
    } else {
      logger.error('WeChat send failed', {
        durationMs: duration,
        error: result.error
      });
    }

    return result;
  }

  /**
   * 通过 openclaw CLI 发送消息
   */
  private static async sendViaCli(
    content: string,
    to: string,
    accountId: string | undefined,
    channelName: string
  ): Promise<PushResult> {
    try {
      const { execFile } = await import('child_process');

      const args = [
        'message', 'send',
        '--channel', channelName,
        '--target', to,
        '--message', content
      ];

      if (accountId) {
        args.push('--account', accountId);
      }

      logger.info('Executing CLI', {
        channel: channelName,
        to,
        argsCount: args.length,
        contentLength: content.length
      });

      const result = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
        execFile('openclaw', args, {
          maxBuffer: 10 * 1024 * 1024,
          timeout: 30000
        }, (error, stdout, stderr) => {
          if (error) {
            reject(error);
          } else {
            resolve({ stdout, stderr });
          }
        });
      });

      logger.info('CLI send completed', {
        stdout: result.stdout.substring(0, 200),
        stderr: result.stderr ? result.stderr.substring(0, 200) : ''
      });

      return {
        success: true,
        messageId: 'sent-via-cli',
        error: undefined
      };
    } catch (error) {
      logger.error('CLI send failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return {
        success: false,
        error: `CLI 发送失败：${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
}

export default WeChatChannel;
