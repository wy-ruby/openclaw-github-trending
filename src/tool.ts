import { GitHubFetcher } from './core/fetcher';
import { AISummarizer } from './core/summarizer';
import { HistoryManager } from './core/history';
import { FeishuChannel } from './channels/feishu';
import { EmailChannel } from './channels/email';
import { ConfigManager } from './core/config';
import { RepositoryInfo } from './models/repository';
import { GitHubTrendingParams, GitHubTrendingResult, PluginConfig, AIConfig, FeishuConfig, EmailConfig } from './models/config';
import { PushResult } from './channels/types';
import { OpenClawConfig, EmailConfig as InternalEmailConfig } from './core/config';

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
      channel: {
        type: string;
        enum: ['feishu', 'email'];
        description: 'Push channel: feishu or email';
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
    openclawConfig: OpenClawConfig,
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
  openclawConfig: OpenClawConfig = {},
  historyData?: any
): Promise<GitHubTrendingResult> {
  const { since, channel, email_to, feishu_webhook } = params;

  // Step 1: Resolve AI configuration with fallback logic
  const aiConfig = ConfigManager.getAIConfig(pluginConfig, openclawConfig);
  const summarizer = new AISummarizer(aiConfig);

  // Step 2: Initialize fetcher and fetch trending repositories
  const fetcher = new GitHubFetcher();
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
      pushed_to: channel,
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

  // Step 5: Build push content based on channel
  let pushResult: PushResult;

  if (channel === 'feishu') {
    const webhookUrl = feishu_webhook || pluginConfig?.channels?.feishu?.webhook_url;
    if (!webhookUrl) {
      return {
        success: false,
        pushed_count: 0,
        new_count: newlySeen.length,
        seen_count: alreadySeen.length,
        total_count: repositories.length,
        pushed_to: 'feishu',
        timestamp: new Date().toISOString(),
        message: 'Feishu webhook URL not provided'
      };
    }

    pushResult = await FeishuChannel.push(webhookUrl, processedRepositories, seenReposWithSummary);
  } else if (channel === 'email') {
    const emailTo = email_to || pluginConfig?.channels?.email?.sender;
    if (!emailTo) {
      return {
        success: false,
        pushed_count: 0,
        new_count: newlySeen.length,
        seen_count: alreadySeen.length,
        total_count: repositories.length,
        pushed_to: 'email',
        timestamp: new Date().toISOString(),
        message: 'Email recipient not provided'
      };
    }

    // Detect email configuration
    const emailConfig = ConfigManager.detectEmailConfig(emailTo, pluginConfig?.channels?.email?.password || '');
    const internalEmailConfig: EmailChannelEmailConfig = {
      from: emailConfig.sender,
      to: emailTo,
      subject: `GitHub Trending ${since === 'daily' ? 'Daily' : since === 'weekly' ? 'Weekly' : 'Monthly'}`,
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

    pushResult = await EmailChannel.send(internalEmailConfig, processedRepositories, seenReposWithSummary);
  } else {
    return {
      success: false,
      pushed_count: 0,
      new_count: 0,
      seen_count: 0,
      total_count: repositories.length,
      pushed_to: channel,
      timestamp: new Date().toISOString(),
      message: `Invalid channel: ${channel}`
    };
  }

  // Step 6: Return result
  if (pushResult.success) {
    return {
      success: true,
      pushed_count: processedRepositories.length,
      new_count: newlySeen.length,
      seen_count: alreadySeen.length,
      total_count: repositories.length,
      pushed_to: channel,
      timestamp: new Date().toISOString(),
      message: pushResult.msg || (pushResult.messageId ? `Email sent: ${pushResult.messageId}` : 'Pushed successfully')
    };
  } else {
    return {
      success: false,
      pushed_count: processedRepositories.length,
      new_count: newlySeen.length,
      seen_count: alreadySeen.length,
      total_count: repositories.length,
      pushed_to: channel,
      timestamp: new Date().toISOString(),
      message: pushResult.error || `Push failed with code: ${pushResult.code}`
    };
  }
}

/**
 * Export the GitHub Trending Tool
 */
export const githubTrendingTool: GitHubTrendingTool = {
  name: 'github-trending',
  description: 'Fetch GitHub trending repositories and push to Feishu or Email',
  parameters: {
    type: 'object',
    properties: {
      since: {
        type: 'string',
        enum: ['daily', 'weekly', 'monthly'],
        description: 'Time period for trending'
      },
      channel: {
        type: 'string',
        enum: ['feishu', 'email'],
        description: 'Push channel: feishu or email'
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
    required: ['since', 'channel']
  },
  handler: githubTrendingHandler
};

export default githubTrendingTool;

// Internal type for EmailChannel email config
interface EmailChannelEmailConfig {
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
