import { z } from 'zod';
import { GitHubFetcher } from './core/fetcher';
import { AISummarizer } from './core/summarizer';
import { HistoryManager } from './core/history';
import { FeishuChannel } from './channels/feishu';
import { EmailChannel } from './channels/email';
import { ConfigManager, OpenClawGlobalConfig } from './core/config';
import { RepositoryInfo } from './models/repository';
import { PluginConfig, GitHubTrendingParams } from './models/config';
import { PushResult } from './channels/types';

export default function (api: any) {
  // Register CLI command for setting up scheduled trending jobs
  api.registerCli?.({
    name: 'setup-trending',
    description: 'Setup GitHub trending schedule and run once (e.g., /setup-trending daily 9:00)',
    parameters: [
      {
        name: 'since',
        type: 'string',
        description: 'Time period: daily, weekly, or monthly',
        required: true
      },
      {
        name: 'time',
        type: 'string',
        description: 'Time specification (e.g., "9:00", "monday 10:00")',
        required: true
      },
      {
        name: 'channels',
        type: 'string',
        description: 'Channels to push to (feishu,email or just feishu or email)',
        required: false
      }
    ],
    async execute(args: string[], context: any) {
      const { logger, config: pluginConfig, openclawConfig } = context;

      if (args.length < 2) {
        return {
          content: [{
            type: 'text',
            text: 'Usage: /setup-trending <daily|weekly|monthly> <time> [channels]\n\n' +
                  'Examples:\n' +
                  '  /setup-trending daily 9:00\n' +
                  '  /setup-trending daily 9:00 feishu\n' +
                  '  /setup-trending weekly monday 10:00 email\n' +
                  '  /setup-trending daily 9:00 feishu,email\n\n' +
                  'Note: This command sets up the configuration and runs once.\n' +
                  'To schedule recurring jobs, use: openclaw cron add --every <period> --agent <agent-id> --system-event \'{"tool":"openclaw-github-trending","params":{"since":"daily","channels":["feishu"]}}\''
          }],
          isError: true
        };
      }

      // Parse arguments
      const since = args[0].toLowerCase();
      if (!['daily', 'weekly', 'monthly'].includes(since)) {
        return {
          content: [{
            type: 'text',
            text: `Invalid period: ${since}. Must be daily, weekly, or monthly.`
          }],
          isError: true
        };
      }

      // Extract time spec (everything after since until we hit a channel name)
      const channelKeywords = ['feishu', 'email'];
      let channels: string[] = [];

      // Find where channels start
      let channelStartIndex = -1;
      for (let i = 1; i < args.length; i++) {
        if (channelKeywords.includes(args[i].toLowerCase()) || args[i].includes(',')) {
          channelStartIndex = i;
          break;
        }
      }

      if (channelStartIndex === -1) {
        // No explicit channels, use all configured channels
        if (pluginConfig?.channels?.feishu?.webhook_url) channels.push('feishu');
        if (pluginConfig?.channels?.email?.sender) channels.push('email');
      } else {
        // Parse channels
        const channelArg = args.slice(channelStartIndex).join(',');
        channels = channelArg.split(',').map(c => c.trim()).filter(c => channelKeywords.includes(c));
      }

      if (channels.length === 0) {
        return {
          content: [{
            type: 'text',
            text: 'No valid channels specified. Please configure at least one channel (feishu or email) in plugin settings.'
          }],
          isError: true
        };
      }

      try {
        // First, run the tool once to verify configuration
        const toolParams = {
          since,
          channels
        };

        // Call the tool execute function directly
        const toolContext = {
          config: pluginConfig,
          logger,
          storage: context.storage,
          openclawConfig
        };

        logger.info(`Running GitHub trending fetch for ${since} period...`);

        // Reuse the tool execution logic
        const toolPluginConfig = toolContext.config;
        const toolStorage = toolContext.storage;

        // Load history
        const historyManager = new HistoryManager();
        if (toolStorage) {
          const historyData = await toolStorage.get('github-trending-history');
          if (historyData) {
            historyManager.importData(historyData);
          }
        }

        // Resolve AI configuration
        const aiConfig = ConfigManager.getAIConfig(toolPluginConfig, openclawConfig);
        if (!aiConfig.apiKey) {
          throw new Error('AI API key is required. Please configure it in plugin settings, OpenClaw global config, or environment variables (OPENAI_API_KEY or ANTHROPIC_API_KEY).');
        }

        logger.info(`Using AI provider: ${aiConfig.provider}, model: ${aiConfig.model}`);

        // Fetch trending repositories
        logger.info(`Fetching GitHub trending repositories (${since})`);
        const fetcher = new GitHubFetcher();
        const repositories = await fetcher.fetchTrending(since as 'daily' | 'weekly' | 'monthly');

        // Categorize repositories
        const historyConfig = {
          enabled: toolPluginConfig?.history?.enabled ?? true,
          star_threshold: toolPluginConfig?.history?.star_threshold ?? 100
        };
        const { shouldPush, newlySeen, alreadySeen } = historyManager.categorizeRepositories(
          repositories,
          historyConfig
        );

        logger.info(`Found ${repositories.length} repos, ${shouldPush.length} to push`);

        return {
          content: [{
            type: 'text',
            text: `✅ Configuration verified!\n\n` +
                  `Period: ${since}\n` +
                  `Channels: ${channels.join(', ')}\n` +
                  `Repositories found: ${repositories.length}\n` +
                  `New repositories: ${newlySeen.length}\n` +
                  `Already seen: ${alreadySeen.length}\n\n` +
                  `To schedule this as a recurring job, run:\n` +
                  `openclaw cron add --every 1d --agent <your-agent> --system-event '{"tool":"openclaw-github-trending","params":{"since":"${since}","channels":["${channels.join('","')}"]}}'`
          }]
        };
      } catch (error) {
        logger.error('Failed to setup trending job:', error);
        return {
          content: [{
            type: 'text',
            text: `Failed to setup job: ${error instanceof Error ? error.message : 'Unknown error'}`
          }],
          isError: true
        };
      }
    }
  });

  // Register the tool
  api.registerTool({
    name: 'openclaw-github-trending',
    description: 'Fetch GitHub trending repositories and push to Feishu or Email with AI summaries',
    parameters: {
      since: z.enum(['daily', 'weekly', 'monthly']).describe('Time period for trending'),
      channels: z.array(z.enum(['feishu', 'email'])).optional().describe('Push channels (array: ["email"], ["feishu"], or ["email", "feishu"])'),
      channel: z.enum(['feishu', 'email']).optional().describe('Push channel (deprecated, use channels instead)'),
      email_to: z.string().email().optional().describe('Email recipient (overrides config)'),
      feishu_webhook: z.string().url().optional().describe('Feishu webhook URL (overrides config)')
    },
    async execute(
      params: GitHubTrendingParams,
      context: {
        config?: PluginConfig;
        logger?: { info: Function; error: Function; warn: Function };
        storage?: { get: Function; set: Function };
        openclawConfig?: OpenClawGlobalConfig;
      }
    ) {
      const { since, channel, channels, email_to, feishu_webhook } = params;
      const { config: pluginConfig, logger, storage, openclawConfig } = context;

      // Fix: Handle undefined context fields
      const safeLogger = logger || {
        info: console.log,
        warn: console.warn,
        error: console.error
      };

      // Fix: Use OpenClaw config as fallback if plugin config is undefined
      const effectiveConfig: PluginConfig = pluginConfig || (openclawConfig as any)?.plugins?.entries?.['openclaw-github-trending']?.config || {};

      safeLogger.info('[GitHub Trending] Starting execution...');
      safeLogger.info('[GitHub Trending] pluginConfig:', pluginConfig ? 'available' : 'undefined');
      safeLogger.info('[GitHub Trending] effectiveConfig:', Object.keys(effectiveConfig).length > 0 ? 'available' : 'empty');

      try {
        // 解析通道配置（向后兼容单个 channel 参数）
        const targetChannels: ('feishu' | 'email')[] = channels || (channel ? [channel] : []);
        if (targetChannels.length === 0) {
          throw new Error('请指定至少一个推送通道：channels 参数（推荐）或 channel 参数（已废弃）');
        }

        // 1. Load history from storage
        const historyManager = new HistoryManager();
        if (storage) {
          const historyData = await storage.get('github-trending-history');
          if (historyData) {
            historyManager.importData(historyData);
          }
        }

        // 2. Resolve AI configuration (priority: plugin config > OpenClaw config > env vars)
        safeLogger.info('[GitHub Trending] Resolving AI config...');
        const aiConfig = ConfigManager.getAIConfig(effectiveConfig, openclawConfig);
        if (!aiConfig.apiKey) {
          throw new Error('AI API key is required. Please configure it in plugin settings, OpenClaw global config, or environment variables (OPENAI_API_KEY or ANTHROPIC_API_KEY).');
        }

        safeLogger.info(`Using AI provider: ${aiConfig.provider}, model: ${aiConfig.model}`);

        // 3. Fetch trending repositories
        safeLogger.info(`Fetching GitHub trending repositories (${since})`);
        const fetcher = new GitHubFetcher();
        const repositories = await fetcher.fetchTrending(since);

        // 4. Categorize repositories
        const historyConfig = {
          enabled: effectiveConfig?.history?.enabled ?? true,
          star_threshold: effectiveConfig?.history?.star_threshold ?? 100
        };
        const { shouldPush, newlySeen, alreadySeen } = historyManager.categorizeRepositories(
          repositories,
          historyConfig
        );

        safeLogger.info(`Found ${repositories.length} repos, ${shouldPush.length} to push`);

        // 5. Generate AI summaries for repos to push (with concurrency control)
        const summarizer = new AISummarizer(aiConfig);
        const maxWorkers = ConfigManager.getMaxWorkers(effectiveConfig);
        const reposWithSummary: RepositoryInfo[] = [];

        safeLogger.info(`Generating AI summaries with ${maxWorkers} workers...`);

        // Process repositories in batches with concurrency control
        for (let i = 0; i < shouldPush.length; i += maxWorkers) {
          const batch = shouldPush.slice(i, i + maxWorkers);

          const batchResults = await Promise.allSettled(
            batch.map(async (repo) => {
              try {
                safeLogger.info(`Fetching README for ${repo.full_name}...`);
                const readmeContent = await fetcher.fetchReadme(repo.full_name);

                let summary = '';

                if (readmeContent) {
                  safeLogger.info(`README found for ${repo.full_name}, generating summary from README...`);
                  summary = await summarizer.summarizeReadme(repo.full_name, readmeContent);
                } else {
                  safeLogger.info(`No README found for ${repo.full_name}, using repository metadata...`);
                  summary = await summarizer.generateSummary(repo);
                }

                return { ...repo, ai_summary: summary };
              } catch (error) {
                safeLogger.warn(`Failed to generate summary for ${repo.full_name}: ${error}`);
                return { ...repo, ai_summary: '' };
              }
            })
          );

          // Collect results from this batch
          for (const result of batchResults) {
            if (result.status === 'fulfilled') {
              reposWithSummary.push(result.value);
            }
          }
        }

        // 6. Push to channels
        const seenWithSummary = alreadySeen.map(r => ({
          ...r,
          ai_summary: historyManager.getProject(r.full_name)?.ai_summary || ''
        }));

        const pushResults: { channel: string; success: boolean; messageId?: string; error?: string }[] = [];

        for (const targetChannel of targetChannels) {
          try {
            if (targetChannel === 'feishu') {
              const webhookUrl = feishu_webhook || effectiveConfig?.channels?.feishu?.webhook_url;
              if (!webhookUrl) {
                safeLogger.warn('Feishu webhook URL not configured, skipping');
                pushResults.push({ channel: 'feishu', success: false, error: 'Webhook URL not configured' });
                continue;
              }

              safeLogger.info(`Pushing ${reposWithSummary.length} repos to Feishu...`);
              const result = await FeishuChannel.push(webhookUrl, reposWithSummary, seenWithSummary, since);
              
              if (!result) {
                safeLogger.error('FeishuChannel.push returned undefined!');
                pushResults.push({ channel: 'feishu', success: false, error: 'Push returned undefined' });
                continue;
              }
              
              pushResults.push({
                channel: 'feishu',
                success: result.success,
                messageId: result.messageId,
                error: result.error || undefined
              });

              if (result.success) {
                safeLogger.info(`✅ Feishu push successful!`);
              } else {
                safeLogger.error(`❌ Feishu push failed: ${result.error || 'Unknown error'}`);
              }
            } else if (targetChannel === 'email') {
              const emailTo = email_to || effectiveConfig?.channels?.email?.sender;
              if (!emailTo) {
                safeLogger.warn('Email recipient not configured, skipping');
                pushResults.push({ channel: 'email', success: false, error: 'Recipient not configured' });
                continue;
              }

              if (!effectiveConfig?.channels?.email) {
                safeLogger.warn('Email SMTP configuration missing, skipping');
                pushResults.push({ channel: 'email', success: false, error: 'SMTP configuration missing' });
                continue;
              }

              // 验证 SMTP 密码
              if (!effectiveConfig.channels.email.password) {
                safeLogger.warn('Email SMTP password missing, skipping');
                pushResults.push({ channel: 'email', success: false, error: 'SMTP password not configured' });
                continue;
              }

              safeLogger.info(`Sending email...`);
              safeLogger.info(`  From: ${effectiveConfig.channels.email.sender}`);
              safeLogger.info(`  To: ${emailTo}`);
              safeLogger.info(`  Subject: GitHub Trending ${since === 'daily' ? 'Daily' : since === 'weekly' ? 'Weekly' : 'Monthly'}`);
              safeLogger.info(`  Repositories: ${reposWithSummary.length} new + ${alreadySeen.length} seen`);

              const result = await EmailChannel.send(
                {
                  from: effectiveConfig.channels.email.sender!,
                  to: emailTo,
                  subject: `GitHub Trending ${since === 'daily' ? 'Daily' : since === 'weekly' ? 'Weekly' : 'Monthly'}`,
                  smtp: {
                    host: effectiveConfig.channels.email.smtp_host || 'smtp.gmail.com',
                    port: effectiveConfig.channels.email.smtp_port || 587,
                    secure: false,
                    auth: {
                      user: effectiveConfig.channels.email.sender!,
                      pass: effectiveConfig.channels.email.password!
                    }
                  }
                },
                reposWithSummary,
                seenWithSummary,
                since
              );

              pushResults.push({
                channel: 'email',
                success: result.success,
                messageId: result.messageId,
                error: result.error || undefined
              });

              if (result.success) {
                safeLogger.info(`Email sent successfully! Message ID: ${result.messageId || 'N/A'}`);
                safeLogger.info(`Check inbox: ${emailTo}`);
                if (emailTo === effectiveConfig.channels.email.sender) {
                  safeLogger.warn(`Email was sent to sender (self). To send to others, set EMAIL_TO in .env`);
                }
              } else {
                safeLogger.error(`Failed to send email: ${result.error || 'Unknown error'}`);
              }
            }
          } catch (error) {
            safeLogger.error(`Failed to push to ${targetChannel}: ${error}`);
            pushResults.push({
              channel: targetChannel,
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error'
            });
          }
        }

        // 7. Update history
        historyManager.markPushed(reposWithSummary);
        if (storage) {
          await storage.set('github-trending-history', historyManager.exportData());
        }

        // 8. Return result
        const successCount = pushResults.filter(r => r.success).length;
        const failedChannels = pushResults.filter(r => !r.success).map(r => r.channel);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: successCount > 0,
              pushed_count: reposWithSummary.length,
              new_count: newlySeen.length,
              seen_count: alreadySeen.length,
              total_count: repositories.length,
              channels: pushResults,
              timestamp: new Date().toISOString(),
              message: successCount === targetChannels.length
                ? `成功推送到所有 ${successCount} 个通道`
                : successCount > 0
                  ? `部分成功：${successCount}/${targetChannels.length} 个通道推送成功，失败通道：${failedChannels.join(', ')}`
                  : `所有通道推送失败：${failedChannels.join(', ')}`
            }, null, 2)
          }]
        };

      } catch (error) {
        safeLogger.error('GitHub trending tool failed:', error);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error',
              timestamp: new Date().toISOString()
            }, null, 2)
          }],
          isError: true
        };
      }
    }
  });
}

module.exports = exports.default;
