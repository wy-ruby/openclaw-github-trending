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
          lines.push('━━━━━━━━━━━━');
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
          lines.push('━━━━━━━━━━━━');
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

    const channelName = config.channel_name || 'openclaw-weixin';

    // 检查微信插件是否已安装并启用
    const wechatPluginEnabled = openclawApi?.config?.plugins?.entries?.['openclaw-weixin']?.enabled;
    const wechatPluginInstalled = openclawApi?.config?.plugins?.installs?.['openclaw-weixin'];

    if (!wechatPluginInstalled) {
      logger.error('WeChat plugin not installed');
      return {
        success: false,
        error: '微信插件未安装：请先运行 `openclaw plugins install @tencent-weixin/openclaw-weixin` 安装微信插件'
      };
    }

    if (wechatPluginEnabled === false) {
      logger.error('WeChat plugin is disabled');
      return {
        success: false,
        error: '微信插件已禁用：请在 openclaw.json 中设置 plugins.entries.openclaw-weixin.enabled = true'
      };
    }

    // 尝试从多个来源获取 receiver_id
    const receiverId = await this.resolveReceiverId(config, openclawApi);

    if (!receiverId) {
      logger.error('WeChat receiver_id not found');
      return {
        success: false,
        error: '微信接收者 ID 未配置。\n\n' +
          '📌 解决方案（选择其一）：\n\n' +
          '1️⃣ 在插件配置中添加 receiver_id（推荐）：\n' +
          '   编辑 ~/.openclaw/openclaw.json\n' +
          '   plugins.entries.openclaw-github-trending.config.channels.wechat.receiver_id = "your-wechat-id@im.wechat"\n\n' +
          '2️⃣ 设置环境变量：\n' +
          '   export OPENCLAW_WECHAT_RECEIVER_ID="your-wechat-id@im.wechat"\n\n' +
          '3️⃣ 从微信发起一次对话：\n' +
          '   如果你在微信中给机器人发送过消息，插件会自动回复给发送者\n\n' +
          '💡 如何获取你的微信 ID：\n' +
          '   运行命令：openclaw message channel list --channel openclaw-weixin\n' +
          '   或者查看会话历史：cat ~/.openclaw/agents/main/sessions/sessions.json | grep weixin\n\n' +
          '提示：微信 ID 格式通常为：xxx@im.wechat'
      };
    }

    const botAccountId = config.bot_account_id || process.env.OPENCLAW_WECHAT_BOT_ACCOUNT_ID;

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
   * 从多个来源解析 receiver_id
   * 优先级：1. 插件配置 2. 环境变量 3. 消息上下文 4. 会话历史 5. OpenClaw API
   */
  private static async resolveReceiverId(
    config: WeChatConfig,
    openclawApi: any
  ): Promise<string | null> {
    // 1. 优先使用插件配置中的 receiver_id
    if (config.receiver_id) {
      logger.info('Using receiver_id from plugin config');
      return config.receiver_id;
    }

    // 2. 尝试从环境变量获取
    if (process.env.OPENCLAW_WECHAT_RECEIVER_ID) {
      logger.info('Using receiver_id from environment variable');
      return process.env.OPENCLAW_WECHAT_RECEIVER_ID;
    }

    // 3. 尝试从消息上下文获取（如果当前会话来自微信）
    if (openclawApi?.context?.channel === 'openclaw-weixin') {
      const fromUser = openclawApi?.context?.from;
      if (fromUser) {
        logger.info('Using receiver_id from message context (echo back to sender)');
        return fromUser;
      }
    }

    // 4. 尝试从 OpenClaw 会话历史中获取最近使用的微信接收者
    // 检查 sessions.json 中的微信会话
    try {
      const { readFileSync } = await import('fs');
      const { join } = await import('path');
      const { homedir } = await import('os');

      const sessionsPath = join(homedir(), '.openclaw', 'agents', 'main', 'sessions', 'sessions.json');
      const sessionsData = JSON.parse(readFileSync(sessionsPath, 'utf-8'));

      // sessions.json 的结构是 { [sessionKey]: sessionData, ... }
      // 查找包含 openclaw-weixin 的会话键
      const sessionKeys = Object.keys(sessionsData);
      for (const key of sessionKeys) {
        if (key.includes('openclaw-weixin')) {
          // session key 格式：agent:main:openclaw-weixin:direct:xxx@im.wechat
          // 从 key 中提取 receiver_id（最后一部分）
          const keyParts = key.split(':');
          const potentialReceiverId = keyParts[keyParts.length - 1];
          
          if (potentialReceiverId && potentialReceiverId.includes('@im.wechat')) {
            // ⚠️ 重要：微信 ID 区分大小写！
            // 如果 ID 是全小写，尝试从已知的发送记录中获取正确的大小写格式
            const lowercaseId = potentialReceiverId.toLowerCase();
            
            // 尝试从 sessions.json 的其他地方查找正确的大小写格式
            // 检查所有消息记录中的 to/from 字段
            for (const sessionKey of sessionKeys) {
              const session = sessionsData[sessionKey];
              if (session?.lastTo && session.lastTo.toLowerCase() === lowercaseId) {
                logger.info(`Using receiver_id from session.lastTo (preserving case): ${session.lastTo.substring(0, 8)}****`);
                return session.lastTo;
              }
              if (session?.lastFrom && session.lastFrom.toLowerCase() === lowercaseId) {
                logger.info(`Using receiver_id from session.lastFrom (preserving case): ${session.lastFrom.substring(0, 8)}****`);
                return session.lastFrom;
              }
              if (session?.label && session.label.toLowerCase() === lowercaseId) {
                logger.info(`Using receiver_id from session.label (preserving case): ${session.label.substring(0, 8)}****`);
                return session.label;
              }
            }
            
            // 如果找不到正确的大小写格式，使用原始提取的 ID
            logger.info(`Using receiver_id from session key: ${potentialReceiverId.substring(0, 8)}****`);
            return potentialReceiverId;
          }
        }
      }
    } catch (error) {
      logger.warn('Failed to read session history', { error: error instanceof Error ? error.message : error });
    }

    // 5. 尝试通过 OpenClaw 获取微信联系人信息
    try {
      logger.info('Attempting to get WeChat receiver_id from OpenClaw...');
      
      // 方法 A: 尝试从微信插件的配置文件中获取
      const { readFileSync, existsSync } = await import('fs');
      const { join } = await import('path');
      const { homedir } = await import('os');
      
      // 尝试读取微信插件的配置文件
      const weixinConfigPaths = [
        join(homedir(), '.openclaw', 'plugins', 'openclaw-weixin', 'config.json'),
        join(homedir(), '.openclaw', 'extensions', 'openclaw-weixin', 'config.json'),
        join(homedir(), '.openclaw', 'credentials.json')
      ];
      
      for (const configPath of weixinConfigPaths) {
        if (existsSync(configPath)) {
          try {
            const configData = JSON.parse(readFileSync(configPath, 'utf-8'));
            // 尝试从配置中提取 receiver_id
            // 微信插件可能存储了联系人信息
            if (configData?.accounts) {
              const accountKeys = Object.keys(configData.accounts);
              if (accountKeys.length > 0) {
                logger.info(`Using receiver_id from WeChat plugin config: ${accountKeys[0].substring(0, 8)}****`);
                return accountKeys[0];
              }
            }
          } catch (e) {
            // 忽略读取错误，继续尝试其他方法
          }
        }
      }
      
      // 方法 B: 尝试从 openclaw-weixin 的 session 中获取
      const sessionsPath = join(homedir(), '.openclaw', 'agents', 'main', 'sessions', 'sessions.json');
      if (existsSync(sessionsPath)) {
        const sessionsData = JSON.parse(readFileSync(sessionsPath, 'utf-8'));
        const sessionKeys = Object.keys(sessionsData);
        
        // 查找最近的微信 direct 会话
        for (const key of sessionKeys) {
          if (key.includes('openclaw-weixin:direct:')) {
            // 从 key 中提取 receiver_id
            const match = key.match(/openclaw-weixin:direct:([a-zA-Z0-9_-]+@im\.wechat)/i);
            if (match && match[1]) {
              logger.info(`Using receiver_id from WeChat direct session: ${match[1].substring(0, 8)}****`);
              return match[1];
            }
          }
        }
      }
    } catch (error) {
      logger.warn('Failed to get receiver_id from OpenClaw', { error: error instanceof Error ? error.message : error });
    }

    logger.warn('No receiver_id found in any source');
    return null;
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

      // if (accountId) {
      //   args.push('--account', accountId);
      // }

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
