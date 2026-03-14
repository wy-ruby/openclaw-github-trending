import { GitHubFetcher } from './core/fetcher';
import { AISummarizer } from './core/summarizer';
import { HistoryManager } from './core/history';
import { FeishuChannel } from './channels/feishu';
import { EmailChannel } from './channels/email';
import { ConfigManager, OpenClawGlobalConfig, SMTPConfig } from './core/config';
import { RepositoryInfo } from './models/repository';
import { GitHubTrendingParams, GitHubTrendingResult, PluginConfig, AIConfig, FeishuConfig, EmailConfig } from './models/config';
import { PushResult } from './channels/types';
import { EmailConfig as EmailSendConfig } from './channels/email';

/**
 * GitHub Trending Tool
 * Fetches trending repositories and pushes to Feishu or Email with AI summaries
 */
export interface GitHubTrendingTool {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: {
      since: {
        type: string;
        enum: ['daily', 'weekly', 'monthly'];
        description: 'Time period for trending';
      };
      channels?: {
        type: 'array';
        items: {
          type: string;
          enum: ['feishu', 'email'];
        };
        description: 'Push channels (array: ["email"], ["feishu"], or ["email", "feishu"])';
      };
      email_to?: {
        type: string;
        format: 'email';
        description: 'Email recipient (required for email channel)';
      };
      feishu_webhook?: {
        type: string;
        description: 'Feishu webhook URL (required for feishu channel)';
      };
    };
    required: string[];
  };
  handler: (
    params: GitHubTrendingParams,
    pluginConfig: PluginConfig,
    openclawConfig: OpenClawGlobalConfig,
    historyData?: any
  ) => Promise<GitHubTrendingResult>;
}

/**
 * Process repositories with AI summaries concurrently
 * @param repositories Repositories to process
 * @param summarizer AISummarizer instance
 * @param maxWorkers Maximum concurrent workers
 * @returns Repositories with AI summaries
 */
async function processRepositoriesWithAI(
  repositories: RepositoryInfo[],
  summarizer: AISummarizer,
  maxWorkers: number = 5
): Promise<RepositoryInfo[]> {
  const results: RepositoryInfo[] = [];

  // Process in batches to limit concurrency
  for (let i = 0; i < repositories.length; i += maxWorkers) {
    const batch = repositories.slice(i, i + maxWorkers);
    const batchResults = await Promise.all(
      batch.map(async (repo: RepositoryInfo) => {
        const summary = await summarizer.generateSummary(repo);
        return { ...repo, ai_summary: summary };
      })
    );
    results.push(...batchResults);
  }

  return results;
}

/**
 * Main handler for GitHub Trending Tool
 */
async function githubTrendingHandler(
  params: GitHubTrendingParams,
  pluginConfig: PluginConfig = {},
  openclawConfig: OpenClawGlobalConfig = {},
  historyData?: any
): Promise<GitHubTrendingResult> {
  console.log('\n[GitHub Trending Tool] Handler called');
  console.log('[GitHub Trending Tool] pluginConfig:', JSON.stringify(pluginConfig, null, 2));
  console.log('[GitHub Trending Tool] pluginConfig.proxy:', pluginConfig.proxy);
  console.log('[GitHub Trending Tool] params:', params);
  console.log('[GitHub Trending Tool] openclawConfig available:', !!openclawConfig);

  const { since, channels, email_to, feishu_webhook } = params;

  // 解析通道配置（仅使用 channels 参数）
  const targetChannels: ('feishu' | 'email')[] = channels || [];
  if (targetChannels.length === 0) {
    return {
      success: false,
      pushed_count: 0,
      new_count: 0,
      seen_count: 0,
      total_count: 0,
      pushed_to: '',
      timestamp: new Date().toISOString(),
      message: '请指定至少一个推送通道：channels 参数'
    };
  }

  // Step 1: Resolve AI configuration with fallback logic
  const aiConfig = ConfigManager.getAIConfig(pluginConfig, openclawConfig);
  const summarizer = new AISummarizer(aiConfig);

  // Step 2: Initialize fetcher and fetch trending repositories
  const fetcher = new GitHubFetcher(pluginConfig);
  let repositories: RepositoryInfo[];

  try {
    repositories = await fetcher.fetchTrending(since);
  } catch (error) {
    return {
      success: false,
      pushed_count: 0,
      new_count: 0,
      seen_count: 0,
      total_count: 0,
      pushed_to: targetChannels.join(','),
      timestamp: new Date().toISOString(),
      message: `Failed to fetch trending: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }

  // Step 3: Initialize history manager and separate new/seen repositories
  const historyManager = new HistoryManager();
  if (historyData) {
    historyManager.importData(historyData);
  }

  // Categorize repositories
  const historyConfig = {
    enabled: pluginConfig?.history?.enabled ?? true,
    star_threshold: pluginConfig?.history?.star_threshold ?? 100
  };
  const { newlySeen, shouldPush, alreadySeen } = historyManager.categorizeRepositories(
    repositories,
    historyConfig
  );

  // Step 4: Generate AI summaries for repositories to push
  let processedRepositories: RepositoryInfo[] = [];
  try {
    processedRepositories = await processRepositoriesWithAI(shouldPush, summarizer);
  } catch (error) {
    // Continue with empty summaries if AI processing fails
    processedRepositories = shouldPush.map((r: RepositoryInfo) => ({ ...r, ai_summary: '' }));
  }

  // Update history
  historyManager.markPushed(processedRepositories);

  // Prepare seen repositories with AI summaries
  const seenReposWithSummary = alreadySeen.map((r: RepositoryInfo) => ({
    ...r,
    ai_summary: historyManager.getProject(r.full_name)?.ai_summary || ''
  }));

  // Step 5: Push to each channel
  const pushResults: { channel: string; success: boolean; messageId?: string; error?: string }[] = [];
  const pushLogs: string[] = []; // 收集推送日志

  for (const targetChannel of targetChannels) {
    try {
      if (targetChannel === 'feishu') {
        const webhookUrl = feishu_webhook || pluginConfig?.channels?.feishu?.webhook_url;
        if (!webhookUrl) {
          pushResults.push({ channel: 'feishu', success: false, error: 'Feishu webhook URL not provided' });
          pushLogs.push('[Feishu Channel] ❌ 推送失败: Feishu webhook URL not provided');
          continue;
        }

        const result = await FeishuChannel.push(webhookUrl, processedRepositories, seenReposWithSummary);
        pushResults.push({
          channel: 'feishu',
          success: result.success,
          messageId: result.messageId,
          error: result.error
        });
        pushLogs.push(`[Feishu Channel] ${result.success ? '✅ 推送成功' : '❌ 推送失败'}${result.error ? ': ' + result.error : ''}`);
      } else if (targetChannel === 'email') {
        const emailTo = email_to || pluginConfig?.channels?.email?.recipient || pluginConfig?.channels?.email?.sender;
        if (!emailTo) {
          pushResults.push({ channel: 'email', success: false, error: 'Email recipient not provided' });
          pushLogs.push('[Email Channel] ❌ 推送失败: Email recipient not provided');
          continue;
        }

        // Detect email configuration
        const emailConfig = ConfigManager.getEmailConfig(
          emailTo,
          pluginConfig?.channels?.email?.password || '',
          pluginConfig?.channels?.email
        );
        const internalEmailConfig: EmailSendConfig = {
          from: emailConfig.sender,
          to: emailTo,
          subject: `GitHub ${since === 'daily' ? '今日' : since === 'weekly' ? '本周' : '本月'}热榜推送`,
          smtp: {
            host: emailConfig.smtp_host,
            port: emailConfig.smtp_port,
            secure: false, // Use STARTTLS
            auth: {
              user: emailConfig.sender,
              pass: emailConfig.password
            }
          }
        };

        const result = await EmailChannel.send(internalEmailConfig, processedRepositories, seenReposWithSummary, since);
        pushResults.push({
          channel: 'email',
          success: result.success,
          messageId: result.messageId,
          error: result.error
        });
        pushLogs.push(`[Email Channel] ${result.success ? '✅ 推送成功' : '❌ 推送失败'}${result.error ? ': ' + result.error : ''}`);
      }
    } catch (error) {
      pushResults.push({
        channel: targetChannel,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      pushLogs.push(`[${targetChannel} Channel] ❌ 推送失败: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // 统一输出推送日志在最后
  console.log('\n========== 推送结果汇总 ==========');
  pushLogs.forEach(log => console.log(log));
  console.log('====================================\n');

  // Step 6: Return result
  const successCount = pushResults.filter(r => r.success).length;
  const failedChannels = pushResults.filter(r => !r.success).map(r => r.channel);
  const successChannels = pushResults.filter(r => r.success).map(r => r.channel);

  // 构建详细的消息
  let message = '';
  if (successCount === targetChannels.length) {
    message = `成功推送到所有 ${successCount} 个通道`;
  } else if (successCount > 0) {
    const failedDetails = pushResults
      .filter(r => !r.success)
      .map(r => `${r.channel}: ${r.error}`)
      .join(', ');
    message = `部分成功：${successCount}/${targetChannels.length} 个通道推送成功，失败：${failedDetails}`;
  } else {
    const failedDetails = pushResults
      .filter(r => !r.success)
      .map(r => `${r.channel}: ${r.error}`)
      .join(', ');
    message = `所有通道推送失败：${failedDetails}`;
  }

  return {
    success: successCount > 0,
    pushed_count: processedRepositories.length,
    new_count: newlySeen.length,
    seen_count: alreadySeen.length,
    total_count: repositories.length,
    pushed_to: successChannels.join(','),
    timestamp: new Date().toISOString(),
    message
  };
}

/**
 * Export the GitHub Trending Tool
 */
export const githubTrendingTool: GitHubTrendingTool = {
  name: 'openclaw-github-trending',
  description: 'Fetch GitHub trending repositories and push to Feishu or Email',
  parameters: {
    type: 'object',
    properties: {
      since: {
        type: 'string',
        enum: ['daily', 'weekly', 'monthly'],
        description: 'Time period for trending'
      },
      channels: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['feishu', 'email']
        },
        description: 'Push channels (array: ["email"], ["feishu"], or ["email", "feishu"])'
      },
      email_to: {
        type: 'string',
        format: 'email',
        description: 'Email recipient (required for email channel)'
      },
      feishu_webhook: {
        type: 'string',
        description: 'Feishu webhook URL (required for feishu channel)'
      }
    },
    required: ['since']
  },
  handler: githubTrendingHandler
};

export default githubTrendingTool;
