import axios from 'axios';
import { RepositoryInfo } from '../models/repository';
import { PushResult } from './types';
import { Logger } from '../utils/logger';

const logger = Logger.get('WeChatChannel');

/**
 * WeChat channel configuration interface
 */
export interface WeChatConfig {
  plugin_enabled?: boolean; // 插件是否启用（由OpenClaw插件系统控制）
  receiver_id?: string; // 微信用户ID，接收消息
  bot_account_id?: string; // 微信机器人账号ID
}

/**
 * WeChat Channel for pushing GitHub trending repositories via personal WeChat
 * Uses the @tencent-weixin/openclaw-weixin plugin
 */
export class WeChatChannel {
  /**
   * Build markdown message for WeChat
   * @param newRepositories Array of new repositories
   * @param seenRepositories Array of seen repositories
   * @param since Time period for trending
   * @returns Markdown formatted message
   */
  static buildMarkdown(
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
    lines.push(`# GitHub ${sinceText}热榜推送`);
    lines.push(``);
    lines.push(`📅 ${dateStr}`);
    lines.push(``);

    // New repositories
    if (newRepositories.length > 0) {
      lines.push(`## 🔥 新上榜项目 (${newRepositories.length})`);
      lines.push(``);

      newRepositories.forEach((repo, index) => {
        const formattedStars = WeChatChannel.formatNumberWithK(repo.stars);
        const formattedForks = repo.forks ? ` ⚡${WeChatChannel.formatNumberWithK(repo.forks)}` : '';
        const language = repo.language ? ` 💻${repo.language}` : '';

        lines.push(`### ${index + 1}. [${repo.full_name}](${repo.url})`);
        lines.push(`⭐ ${formattedStars}${formattedForks}${language}`);

        if (repo.ai_summary) {
          lines.push(``);
          lines.push(`🤖 **项目介绍：**`);
          lines.push(repo.ai_summary);
        }

        lines.push(``);
      });
    }

    // Seen repositories
    if (seenRepositories.length > 0) {
      if (newRepositories.length > 0) {
        lines.push(``);
      }

      lines.push(`## ⭐ 持续霸榜项目 (${seenRepositories.length})`);
      lines.push(``);

      seenRepositories.forEach((repo, index) => {
        const formattedStars = WeChatChannel.formatNumberWithK(repo.stars);
        const formattedForks = repo.forks ? ` ⚡${WeChatChannel.formatNumberWithK(repo.forks)}` : '';
        const language = repo.language ? ` 💻${repo.language}` : '';

        lines.push(`### ${index + 1}. [${repo.full_name}](${repo.url})`);
        lines.push(`⭐ ${formattedStars}${formattedForks}${language}`);

        if (repo.ai_summary) {
          lines.push(``);
          // Show only first sentence for seen repos
          lines.push(`_${repo.ai_summary.split('。')[0]}。_`);
        }

        lines.push(``);
      });
    }

    // No repositories
    if (newRepositories.length === 0 && seenRepositories.length === 0) {
      lines.push(`## 📌 暂无 trending 项目`);
    }

    // Footer
    lines.push(`---`);
    lines.push(`✨ 本消息由 GitHub 热榜机器人自动生成`);
    lines.push(`🔗 [GitHub Trending](https://github.com/wy-ruby/openclaw-github-trending)`);

    return lines.join('\n');
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
   * Send message via OpenClaw WeChat plugin
   * The plugin should be installed and configured in OpenClaw
   *
   * @param markdownContent Markdown content to send
   * @param openclawApi OpenClaw API instance for invoking channels
   * @param config WeChat configuration
   * @returns Push result
   */
  static async send(
    markdownContent: string,
    openclawApi: any,
    config: WeChatConfig
  ): Promise<PushResult> {
    logger.info('Starting WeChat send', {
      contentLength: markdownContent.length
    });

    try {
      const startTime = Date.now();

      // 从配置文件中读取微信配置，如果没有则使用默认值
      const wechatReceiverId = config.receiver_id || process.env.OPENCLAW_WECHAT_RECEIVER_ID;
      const wechatBotAccountId = config.bot_account_id || process.env.OPENCLAW_WECHAT_BOT_ACCOUNT_ID;

      logger.info('WeChat configuration', {
        receiverId: wechatReceiverId,
        botAccountId: wechatBotAccountId
      });

      // 检查 openclawApi 是否包含 channels
      if (!openclawApi || !openclawApi.channels) {
        logger.error('openclawApi.channels not available');
        return {
          success: false,
          error: 'openclawApi.channels not available - WeChat plugin may not be installed'
        };
      }

      // 获取微信 channel 实例
      const wechatChannel = openclawApi.channels['openclaw-weixin'];
      if (!wechatChannel) {
        logger.error('WeChat channel "openclaw-weixin" not found');
        return {
          success: false,
          error: 'WeChat channel "openclaw-weixin" not found - please install and configure the plugin'
        };
      }

      // 直接调用微信 channel 的 send 方法
      // OpenClaw 的 channel API 通常有 send 方法
      logger.debug('Invoking WeChat channel send...', {
        receiverId: wechatReceiverId,
        botAccountId: wechatBotAccountId,
        messageLength: markdownContent.length
      });

      const sendResult = await wechatChannel.send({
        to: wechatReceiverId,
        accountId: wechatBotAccountId,
        message: markdownContent
      });

      const duration = Date.now() - startTime;

      logger.info('WeChat send completed', {
        durationMs: duration,
        messageId: sendResult?.message_id || sendResult?.id || 'unknown',
        success: true
      });

      return {
        success: true,
        messageId: sendResult?.message_id || sendResult?.id || 'unknown',
        error: undefined
      };
    } catch (error) {
      logger.error('WeChat send failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Alternative method: Use OpenClaw's chat interface to send message
   * This sends the message as if the plugin itself is "chatting" to the user
   *
   * @param markdownContent Markdown content to send
   * @param openclawApi OpenClaw API instance
   * @returns Push result
   */
  static async sendViaChat(
    markdownContent: string,
    openclawApi: any
  ): Promise<PushResult> {
    logger.info('Starting WeChat send via chat interface', {
      contentLength: markdownContent.length
    });

    try {
      const startTime = Date.now();

      // Use OpenClaw's chat API to send message
      // This assumes the WeChat plugin is the active channel
      const result = await openclawApi.chat(markdownContent);

      const duration = Date.now() - startTime;

      logger.success('WeChat chat send completed', {
        durationMs: duration,
        messageId: result?.message_id || 'unknown'
      });

      return {
        success: true,
        messageId: result?.message_id || 'unknown',
        error: undefined
      };
    } catch (error) {
      logger.error('WeChat chat send failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}

export default WeChatChannel;
