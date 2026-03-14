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

  // Use configured max workers, cap at 10 to avoid overwhelming the API
  const actualMaxWorkers = Math.min(maxWorkers, 10);

  // Process in batches to limit concurrency
  for (let i = 0; i < repositories.length; i += actualMaxWorkers) {
    const batch = repositories.slice(i, i + actualMaxWorkers);

    console.log(`[AI Summarizer] Processing batch ${Math.floor(i / actualMaxWorkers) + 1}/${Math.ceil(repositories.length / actualMaxWorkers)} (${batch.length} repos with ${actualMaxWorkers} workers)...`);

    // Use Promise.allSettled to handle individual failures gracefully
    const batchResults = await Promise.allSettled(
      batch.map(async (repo: RepositoryInfo) => {
        try {
          // Add timeout for each summary request (3 minutes max to match OpenClaw CLI limit)
          const startTime = Date.now();
          const summary = await Promise.race([
            summarizer.generateSummary(repo),
            new Promise<string>((_, reject) =>
              setTimeout(() => reject(new Error('Summary timeout')), 180000)
            )
          ]);
          const duration = Date.now() - startTime;

          console.log(`✅ ${repo.full_name} summary generated (${duration}ms, ${summary.length} chars)`);
          return { ...repo, ai_summary: summary };
        } catch (error) {
          console.log(`⚠️  ${repo.full_name} 摘要生成失败：${error instanceof Error ? error.message : 'Unknown error'}`);
          return { ...repo, ai_summary: '' };
        }
      })
    );

    // Collect successful results
    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      }
    }
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

  // Categorize repositories with proper history config from plugin
  const historyConfig = {
    enabled: pluginConfig?.history?.enabled ?? true,
    star_threshold: pluginConfig?.history?.star_threshold ?? 100
  };

  const historyStatsBefore = historyManager.getStats();
  console.log('[History Manager] Configuration:', JSON.stringify(historyConfig, null, 2));
  console.log('[History Manager] History loaded from storage:', historyData ? '✅ Yes' : '❌ No');
  console.log('[History Manager] Total repositories in history:', Object.keys(historyManager['data'].repositories).length);
  console.log('[History Manager] Statistics before processing:');
  console.log(`  - Total repositories tracked: ${historyStatsBefore.total_repositories}`);
  console.log(`  - Total pushes: ${historyStatsBefore.total_pushes}`);
  console.log(`  - Oldest entry: ${historyStatsBefore.oldest_entry || 'N/A'}`);
  console.log(`  - Newest entry: ${historyStatsBefore.newest_entry || 'N/A'}`);

  const { newlySeen, shouldPush, alreadySeen } = historyManager.categorizeRepositories(
    repositories,
    historyConfig
  );

  console.log(`[History Manager] Results - New: ${newlySeen.length}, Should Push: ${shouldPush.length}, Already Seen: ${alreadySeen.length}`);
  if (newlySeen.length > 0) {
    console.log('[History Manager] Newly seen repositories:');
    newlySeen.forEach((repo, i) => console.log(`  ${i + 1}. ${repo.full_name} (${repo.stars} stars)`));
  }
  if (alreadySeen.length > 0) {
    console.log('[History Manager] Already seen repositories:');
    alreadySeen.forEach((repo, i) => {
      const history = historyManager.getProject(repo.full_name);
      const starsDiff = repo.stars - (history?.last_stars || 0);
      console.log(`  ${i + 1}. ${repo.full_name} (${repo.stars} stars, +${starsDiff} since last push)`);
    });
  }

  // Step 4: Get max workers from config and generate AI summaries for repositories to push
  const maxWorkers = ConfigManager.getMaxWorkers(pluginConfig);
  console.log(`[AI Summarizer] Using ${maxWorkers} concurrent workers for ${shouldPush.length} repositories`);

  let processedRepositories: RepositoryInfo[] = [];
  const startTime = Date.now();

  try {
    processedRepositories = await processRepositoriesWithAI(shouldPush, summarizer, maxWorkers);
  } catch (error) {
    // Continue with empty summaries if AI processing fails
    processedRepositories = shouldPush.map((r: RepositoryInfo) => ({ ...r, ai_summary: '' }));
  }

  const summaryDuration = Date.now() - startTime;
  console.log(`[AI Summarizer] ✅ All summaries generated in ${summaryDuration}ms (${summaryDuration / shouldPush.length}ms per repo on average)`);

  // Update history
  historyManager.markPushed(processedRepositories);

  // Prepare seen repositories with AI summaries from history (skip AI generation)
  const seenReposWithSummary = alreadySeen.map((r: RepositoryInfo) => {
    const history = historyManager.getProject(r.full_name);
    const summary = history?.ai_summary || '';
    if (summary) {
      console.log(`[History Manager] ✅ Using cached summary for ${r.full_name} (${summary.length} chars)`);
    } else {
      console.log(`[History Manager] ⚠️  No cached summary for ${r.full_name}`);
    }
    return {
      ...r,
      ai_summary: summary
    };
  });

  // Display summary statistics
  console.log(`\n[Summary Statistics]`);
  console.log(`  - New repositories processed with AI: ${processedRepositories.length}`);
  console.log(`  - Already seen repositories (using cached summaries): ${alreadySeen.length}`);
  console.log(`  - Total repositories to push: ${processedRepositories.length}`);
  console.log(`  - Total repositories shown: ${processedRepositories.length + alreadySeen.length}`);

  // Step 5: Push to each channel
  const pushResults: { channel: string; success: boolean; messageId?: string; error?: string }[] = [];
  const pushLogs: string[] = []; // 收集推送日志

  // Display history statistics
  const historyStats = historyManager.getStats();
  console.log('\n[History Statistics]');
  console.log(`  - Total repositories tracked: ${historyStats.total_repositories}`);
  console.log(`  - Total pushes: ${historyStats.total_pushes}`);
  console.log(`  - Oldest entry: ${historyStats.oldest_entry || 'N/A'}`);
  console.log(`  - Newest entry: ${historyStats.newest_entry || 'N/A'}`);

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
    message,
    history_data: historyManager.exportData() // Return updated history for persistence
  };
}

// Export history manager for persistence
export { HistoryManager };

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
