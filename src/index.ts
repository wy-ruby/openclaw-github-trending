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
import { FileLogger } from './core/file-logger';

const fileLogger = FileLogger.getInstance();

export default function (api: any) {
  fileLogger.info('[Plugin Init] Starting GitHub Trending plugin registration...');
  
  // Store api.config for later use in tool execution
  let openclawConfigFromApi: any = null;
  try {
    openclawConfigFromApi = api.config;
    fileLogger.info('[Plugin Init] api.config available', { hasConfig: !!openclawConfigFromApi });
  } catch (e) {
    fileLogger.warn('[Plugin Init] api.config not available', { error: e });
  }
  
  // Register CLI command for setting up scheduled trending jobs
  api.registerCli?.({
    name: 'setup-trending',
    description: 'Setup GitHub trending schedule or run immediately (e.g., /setup-trending daily 9:00)',
    parameters: [
      {
        name: 'since',
        type: 'string',
        description: 'Time period: daily, weekly, monthly',
        required: true
      },
      {
        name: 'time',
        type: 'string',
        description: 'Time specification (e.g., "9:00", "monday 10:00") or "now" for immediate execution',
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

      // Check if plugin is enabled
      const pluginId = 'openclaw-github-trending';
      const entryConfig = openclawConfig?.plugins?.entries?.[pluginId];
      const isEnabled = entryConfig?.enabled ?? true; // Default to enabled if not specified

      fileLogger.info('[CLI] Plugin enabled status check', { pluginId, isEnabled, entryConfigAvailable: !!entryConfig });

      if (!isEnabled) {
        fileLogger.warn('[CLI] Plugin is disabled, skipping execution');
        logger?.warn(`Plugin ${pluginId} is disabled`);
        return {
          content: [{
            type: 'text',
            text: `❌ 插件 ${pluginId} 已禁用，无法执行。\n\n` +
                  `请在 openclaw.json 中设置：\n` +
                  `\`\`\`json\n` +
                  `{\n` +
                  `  "plugins": {\n` +
                  `    "entries": {\n` +
                  `      "${pluginId}": {\n` +
                  `        "enabled": true,\n` +
                  `        "config": { ... }\n` +
                  `      }\n` +
                  `    }\n` +
                  `  }\n` +
                  `}\n\`\`\``
          }],
          isError: true
        };
      }

      fileLogger.info('[CLI] setup-trending command executed', { args, pluginConfigAvailable: !!pluginConfig });

      if (args.length < 2) {
        return {
          content: [{
            type: 'text',
            text: 'Usage: /setup-trending <daily|weekly|monthly> <time|now> [channels]\n\n' +
                  'Examples:\n' +
                  '  /setup-trending daily now                        # Run immediately\n' +
                  '  /setup-trending daily 9:00                       # Setup for 9:00 daily\n' +
                  '  /setup-trending daily now feishu                 # Run immediately to feishu\n' +
                  '  /setup-trending daily 9:00 feishu                # Setup for 9:00 with feishu\n' +
                  '  /setup-trending weekly monday 10:00 email        # Setup weekly with email\n' +
                  '  /setup-trending monthly 1st 8:00 feishu,email    # Setup monthly with both\n\n' +
                  'Quick testing:\n' +
                  '  /setup-trending daily now                        # Quick test (recommended)\n\n' +
                  'Note: This command verifies configuration and can run immediately or show setup instructions.\n' +
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
      let runNow = false;
      let channelStartIndex = -1;

      // Check if time parameter is "now"
      if (args[1].toLowerCase() === 'now') {
        runNow = true;
        channelStartIndex = 2; // Channels start from args[2] onwards
      } else {
        // Parse channels normally
        for (let i = 1; i < args.length; i++) {
          if (channelKeywords.includes(args[i].toLowerCase()) || args[i].includes(',')) {
            channelStartIndex = i;
            break;
          }
        }
      }

      if (channelStartIndex === -1 || channelStartIndex >= args.length) {
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

        fileLogger.info('[CLI] Running GitHub trending fetch for verification', {
          since,
          channels,
          runNow,
          toolParams
        });

        // Call the tool execute function directly
        const toolContext = {
          config: pluginConfig,
          logger,
          storage: context.storage,
          openclawConfig
        };

        logger?.info(`Running GitHub trending fetch for ${since} period...`);

        // Reuse the tool execution logic
        const toolPluginConfig = toolContext.config;
        const toolStorage = toolContext.storage;

        // Fix: Use OpenClaw config as fallback if plugin config is undefined or empty
        const hasPluginConfig = toolPluginConfig && (Object.keys(toolPluginConfig).length > 0 || toolPluginConfig.channels);
        const effectiveConfig: PluginConfig = hasPluginConfig ? toolPluginConfig : (openclawConfig as any)?.plugins?.entries?.['openclaw-github-trending']?.config || {};

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
          fileLogger.error('[CLI] AI API key not found', { hasPluginConfigAI: !!toolPluginConfig?.ai?.api_key });
          throw new Error('AI API key is required. Please configure it in plugin settings, OpenClaw global config, or environment variables (OPENAI_API_KEY or ANTHROPIC_API_KEY).');
        }

        fileLogger.info('[CLI] Using AI provider', { provider: aiConfig.provider, model: aiConfig.model });
        logger?.info(`Using AI provider: ${aiConfig.provider}, model: ${aiConfig.model}`);

        // Fetch trending repositories
        fileLogger.info('[CLI] Fetching GitHub trending', { period: since });
        logger?.info(`Fetching GitHub trending repositories (${since})`);
        const fetcher = new GitHubFetcher(effectiveConfig);
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

        fileLogger.info('[CLI] Categorization complete', {
          total: repositories.length,
          shouldPush: shouldPush.length,
          newlySeen: newlySeen.length,
          alreadySeen: alreadySeen.length
        });
        logger?.info(`Found ${repositories.length} repos, ${shouldPush.length} to push`);

        // Log detailed repository information
        logger?.info('[CLI] Detailed repository list:');
        repositories.forEach((repo, index) => {
          logger?.info(`  ${index + 1}. ${repo.full_name}`);
          logger?.info(`     Stars: ${repo.stars.toLocaleString()} | Description: ${repo.description || 'N/A'}`);
        });

        logger?.info('[CLI] Categorization results:');
        if (newlySeen.length > 0) {
          logger?.info(`  ➕ Newly seen (${newlySeen.length}):`);
          newlySeen.forEach((repo, idx) => {
            logger?.info(`     ${idx + 1}. ${repo.full_name} (${repo.stars} stars)`);
          });
        }
        if (shouldPush.length > 0) {
          logger?.info(`  ✅ Should push (${shouldPush.length}):`);
          shouldPush.forEach((repo, idx) => {
            logger?.info(`     ${idx + 1}. ${repo.full_name} (${repo.stars} stars)`);
          });
        }
        if (alreadySeen.length > 0) {
          logger?.info(`  🔁 Already seen (${alreadySeen.length}):`);
          alreadySeen.forEach((repo, idx) => {
            const history = historyManager.getProject(repo.full_name);
            const starsDiff = repo.stars - (history?.last_stars || 0);
            logger?.info(`     ${idx + 1}. ${repo.full_name} (${repo.stars} stars, +${starsDiff} since last)`);
          });
        }

        // If runNow flag is set, execute the full tool flow including summaries and push
        if (runNow) {
          fileLogger.info('[CLI] Running immediate execution (runNow=true)');
          logger?.info('[CLI] 🚀 Running immediate execution...');

          // Generate AI summaries
          const summarizer = new AISummarizer(aiConfig);
          const maxWorkers = ConfigManager.getMaxWorkers(toolPluginConfig);
          const reposWithSummary: RepositoryInfo[] = [];

          logger?.info(`Generating AI summaries with ${maxWorkers} workers...`);
          fileLogger.info('[CLI] Generating AI summaries', { maxWorkers, repoCount: shouldPush.length });

          // Process repositories in batches with concurrency control
          for (let i = 0; i < shouldPush.length; i += maxWorkers) {
            const batch = shouldPush.slice(i, i + maxWorkers);

            const batchResults = await Promise.allSettled(
              batch.map(async (repo) => {
                try {
                  logger?.info(`  📖 [${repo.full_name}] Fetching README...`);
                  fileLogger.info('[CLI] Fetching README', { fullName: repo.full_name });
                  const readmeContent = await fetcher.fetchReadme(repo.full_name);

                  let summary = '';

                  if (readmeContent) {
                    const readmePreview = readmeContent.substring(0, 100).replace(/\n/g, ' ').trim();
                    logger?.info(`  ✓ README found (${readmeContent.length} chars), preview: "${readmePreview}..."`);
                    logger?.info(`  🤖 [${repo.full_name}] Generating AI summary from README...`);
                    const startTime = Date.now();
                    summary = await summarizer.summarizeReadme(repo.full_name, readmeContent);
                    const duration = Date.now() - startTime;
                    logger?.info(`  ✓ Summary generated (${summary.length} chars) in ${duration}ms`);
                    if (summary) {
                      logger?.info(`  📝 [${repo.full_name}] Summary: ${summary.substring(0, 100)}...`);
                    } else {
                      logger?.warn(`  ⚠ [${repo.full_name}] Summary is empty`);
                    }
                    fileLogger.info('[CLI] Generating summary from README', { fullName: repo.full_name });
                  } else {
                    logger?.warn(`  ✗ No README found for ${repo.full_name}`);
                    logger?.info(`  🤖 [${repo.full_name}] Generating AI summary from metadata...`);
                    const startTime = Date.now();
                    summary = await summarizer.generateSummary(repo);
                    const duration = Date.now() - startTime;
                    logger?.info(`  ✓ Summary generated (${summary.length} chars) in ${duration}ms`);
                    if (summary) {
                      logger?.info(`  📝 [${repo.full_name}] Summary: ${summary.substring(0, 100)}...`);
                    } else {
                      logger?.warn(`  ⚠ [${repo.full_name}] Summary is empty`);
                    }
                    fileLogger.info('[CLI] Using metadata for summary', { fullName: repo.full_name });
                  }

                  return { ...repo, ai_summary: summary };
                } catch (error) {
                  logger?.warn(`Failed to generate summary for ${repo.full_name}: ${error}`);
                  fileLogger.error('[CLI] Failed to generate summary', {
                    fullName: repo.full_name,
                    error: error instanceof Error ? error.message : 'Unknown error'
                  });
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

          // Push to channels
          logger?.info(`Pushing ${reposWithSummary.length} repos to ${channels.join(', ')}...`);
          fileLogger.info('[CLI] Starting push to channels', { channels, repoCount: reposWithSummary.length });

          const seenWithSummary = alreadySeen.map(r => ({
            ...r,
            ai_summary: historyManager.getProject(r.full_name)?.ai_summary || ''
          }));

          const pushResults: { channel: string; success: boolean; messageId?: string; error?: string }[] = [];

          for (const targetChannel of channels) {
            try {
              if (targetChannel === 'feishu') {
                const webhookUrl = toolPluginConfig?.channels?.feishu?.webhook_url;
                if (!webhookUrl) {
                  fileLogger.warn('[CLI] Feishu webhook URL not configured, skipping');
                  pushResults.push({ channel: 'feishu', success: false, error: 'Webhook URL not configured' });
                  continue;
                }

                const result = await FeishuChannel.push(webhookUrl, reposWithSummary, seenWithSummary, since as 'daily' | 'weekly' | 'monthly');

                if (!result) {
                  fileLogger.error('[CLI] Feishu push returned undefined');
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
                  fileLogger.info('[CLI] ✅ Feishu push successful!');
                  logger?.info(`✅ Feishu push successful!`);
                } else {
                  fileLogger.error(`[CLI] ❌ Feishu push failed: ${result.error || 'Unknown error'}`);
                  logger?.error(`❌ Feishu push failed: ${result.error || 'Unknown error'}`);
                }
              } else if (targetChannel === 'email') {
                const emailTo = toolPluginConfig?.channels?.email?.recipient || toolPluginConfig?.channels?.email?.sender;
                if (!emailTo) {
                  fileLogger.warn('[CLI] Email recipient not configured, skipping');
                  pushResults.push({ channel: 'email', success: false, error: 'Recipient not configured' });
                  continue;
                }

                if (!toolPluginConfig?.channels?.email) {
                  fileLogger.warn('[CLI] Email SMTP configuration missing, skipping');
                  pushResults.push({ channel: 'email', success: false, error: 'SMTP configuration missing' });
                  continue;
                }

                if (!toolPluginConfig.channels.email.password) {
                  fileLogger.warn('[CLI] Email SMTP password missing, skipping');
                  pushResults.push({ channel: 'email', success: false, error: 'SMTP password not configured' });
                  continue;
                }

                logger?.info(`Sending email to ${emailTo}...`);
                fileLogger.info('[CLI] Sending email', { to: emailTo, subject: `GitHub Trending ${since}` });

                const result = await EmailChannel.send(
                  {
                    from: toolPluginConfig.channels.email.sender!,
                    to: emailTo,
                    subject: `GitHub Trending ${since === 'daily' ? 'Daily' : since === 'weekly' ? 'Weekly' : 'Monthly'}`,
                    smtp: {
                      host: toolPluginConfig.channels.email.smtp_host || 'smtp.gmail.com',
                      port: toolPluginConfig.channels.email.smtp_port || 587,
                      secure: false,
                      auth: {
                        user: toolPluginConfig.channels.email.sender!,
                        pass: toolPluginConfig.channels.email.password!
                      }
                    }
                  },
                  reposWithSummary,
                  seenWithSummary,
                  since as 'daily' | 'weekly' | 'monthly'
                );

                pushResults.push({
                  channel: 'email',
                  success: result.success,
                  messageId: result.messageId,
                  error: result.error || undefined
                });

                if (result.success) {
                  fileLogger.info('[CLI] ✅ Email sent successfully!');
                  logger?.info(`✅ Email sent successfully! Message ID: ${result.messageId || 'N/A'}`);
                } else {
                  fileLogger.error(`[CLI] ❌ Failed to send email: ${result.error || 'Unknown error'}`);
                  logger?.error(`❌ Failed to send email: ${result.error || 'Unknown error'}`);
                }
              }
            } catch (error) {
              fileLogger.error(`[CLI] Failed to push to ${targetChannel}`, {
                error: error instanceof Error ? error.message : 'Unknown error',
                stack: error instanceof Error ? error.stack : undefined
              });
              pushResults.push({
                channel: targetChannel,
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
              });
            }
          }

          // Update history
          historyManager.markPushed(reposWithSummary);
          if (toolStorage) {
            await toolStorage.set('github-trending-history', historyManager.exportData());
          }

          const successCount = pushResults.filter(r => r.success).length;
          const failedChannels = pushResults.filter(r => !r.success).map(r => r.channel);

          fileLogger.info('[CLI] Immediate execution completed', {
            successCount,
            failedCount: failedChannels.length,
            totalChannels: channels.length,
            pushResults
          });

          return {
            content: [{
              type: 'text',
              text: `🚀 **Immediate Execution Completed!**\n\n` +
                    `Period: ${since}\n` +
                    `Channels: ${channels.join(', ')}\n` +
                    `Repositories found: ${repositories.length}\n` +
                    `New repositories: ${newlySeen.length}\n` +
                    `Already seen: ${alreadySeen.length}\n` +
                    `Pushed: ${reposWithSummary.length}\n\n` +
                    `Results:\n` +
                    pushResults.map(r =>
                      `${r.success ? '✅' : '❌'} ${r.channel}: ${r.success ? 'Success' : r.error || 'Failed'}`
                    ).join('\n') + '\n\n' +
                    (successCount === channels.length
                      ? `🎉 **All channels pushed successfully!**\n`
                      : successCount > 0
                        ? `⚠️ **Partial success: ${successCount}/${channels.length} channels succeeded**\n`
                        : `❌ **All channels failed!**\n`)
            }]
          };
        } else {
          // Return setup instructions as before
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
        }
      } catch (error) {
        fileLogger.error('[CLI] Failed to setup trending job', error);
        logger?.error('Failed to setup trending job:', error);
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
      const { since, channels, email_to, feishu_webhook } = params;
      const { config: pluginConfig, logger, storage, openclawConfig: openclawConfigFromContext } = context;
      
      // Use api.config as fallback if context.openclawConfig is not available
      const openclawConfig = openclawConfigFromContext || openclawConfigFromApi;

      // Check if plugin is enabled
      const pluginId = 'openclaw-github-trending';
      const entryConfig = openclawConfig?.plugins?.entries?.[pluginId];
      const isEnabled = entryConfig?.enabled ?? true; // Default to enabled if not specified

      fileLogger.info('[Tool Execute] Plugin enabled status check', { pluginId, isEnabled, entryConfigAvailable: !!entryConfig });

      if (!isEnabled) {
        fileLogger.warn('[Tool Execute] Plugin is disabled, rejecting execution');
        throw new Error(`插件 ${pluginId} 已禁用，无法执行。请在 openclaw.json 中设置 plugins.entries.${pluginId}.enabled = true`);
      }

      fileLogger.info('[Tool Execute] Starting execution', {
        params,
        configAvailable: !!pluginConfig,
        storageAvailable: !!storage,
        openclawConfigAvailable: !!openclawConfig
      });

      // Create a logger wrapper that logs to both OpenClaw logger and file
      const safeLogger = {
        info: (msg: string, ...args: any[]) => {
          fileLogger.info(msg, ...args);
          if (logger?.info) logger.info(msg, ...args);
        },
        warn: (msg: string, ...args: any[]) => {
          fileLogger.warn(msg, ...args);
          if (logger?.warn) logger.warn(msg, ...args);
        },
        error: (msg: string, ...args: any[]) => {
          fileLogger.error(msg, ...args);
          if (logger?.error) logger.error(msg, ...args);
        }
      };

      // Fix: Use OpenClaw config as fallback if plugin config is undefined or empty
      const hasPluginConfig = pluginConfig && (Object.keys(pluginConfig).length > 0 || pluginConfig.channels);
      
      // Debug: Log openclawConfig structure
      fileLogger.info('[Tool Execute] openclawConfig structure:', {
        hasPlugins: !!openclawConfig?.plugins,
        hasEntries: !!openclawConfig?.plugins?.entries,
        hasOurEntry: !!openclawConfig?.plugins?.entries?.['openclaw-github-trending'],
        ourEntryKeys: openclawConfig?.plugins?.entries?.['openclaw-github-trending'] ? Object.keys(openclawConfig.plugins.entries['openclaw-github-trending']) : []
      });
      
      const effectiveConfig: PluginConfig = hasPluginConfig ? pluginConfig : (openclawConfig as any)?.plugins?.entries?.['openclaw-github-trending']?.config || {};

      safeLogger.info('[GitHub Trending] Starting execution...');
      safeLogger.info('[GitHub Trending] pluginConfig:', pluginConfig ? 'available' : 'undefined');
      safeLogger.info('[GitHub Trending] pluginConfig content:', JSON.stringify(pluginConfig, null, 2));
      safeLogger.info('[GitHub Trending] openclawConfig available:', openclawConfig ? 'yes' : 'no');
      safeLogger.info('[GitHub Trending] hasPluginConfig check:', hasPluginConfig);
      safeLogger.info('[GitHub Trending] effectiveConfig:', Object.keys(effectiveConfig).length > 0 ? 'available' : 'empty');
      safeLogger.info('[GitHub Trending] effectiveConfig content:', JSON.stringify(effectiveConfig, null, 2));
      safeLogger.info('[GitHub Trending] channels in effectiveConfig:', effectiveConfig?.channels ? JSON.stringify(effectiveConfig.channels) : 'not found');
      safeLogger.info('[GitHub Trending] proxy in effectiveConfig:', effectiveConfig?.proxy ? JSON.stringify(effectiveConfig.proxy) : 'not found');

      try {
        // 解析通道配置（仅使用 channels 参数）
        let targetChannels: ('feishu' | 'email')[] = channels || [];
        
        // 如果没有显式指定通道，从配置中自动读取已配置的通道
        if (targetChannels.length === 0) {
          if (effectiveConfig?.channels?.feishu?.webhook_url) {
            targetChannels.push('feishu');
          }
          if (effectiveConfig?.channels?.email?.sender && effectiveConfig?.channels?.email?.password) {
            targetChannels.push('email');
          }
        }
        
        if (targetChannels.length === 0) {
          throw new Error('请指定至少一个推送通道：channels 参数，或在配置中配置 webhook_url 或 email');
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

        safeLogger.info(`Using AI provider: ${aiConfig.provider}, model: ${aiConfig.model}, baseUrl: ${aiConfig.baseUrl}`);

        // 3. Fetch trending repositories
        safeLogger.info(`Fetching GitHub trending repositories (${since})`);
        const fetcher = new GitHubFetcher(effectiveConfig);
        const repositories = await fetcher.fetchTrending(since as 'daily' | 'weekly' | 'monthly');

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

        // Log detailed repository information
        safeLogger.info('[Repositories] Detailed repository list:');
        repositories.forEach((repo, index) => {
          safeLogger.info(`  ${index + 1}. ${repo.full_name}`);
          safeLogger.info(`     Stars: ${repo.stars.toLocaleString()} | Description: ${repo.description || 'N/A'}`);
        });

        safeLogger.info('[Repositories] Categorization results:');
        if (newlySeen.length > 0) {
          safeLogger.info(`  ➕ Newly seen (${newlySeen.length}):`);
          newlySeen.forEach((repo, idx) => {
            safeLogger.info(`     ${idx + 1}. ${repo.full_name} (${repo.stars} stars)`);
          });
        }
        if (shouldPush.length > 0) {
          safeLogger.info(`  ✅ Should push (${shouldPush.length}):`);
          shouldPush.forEach((repo, idx) => {
            safeLogger.info(`     ${idx + 1}. ${repo.full_name} (${repo.stars} stars)`);
          });
        }
        if (alreadySeen.length > 0) {
          safeLogger.info(`  🔁 Already seen (${alreadySeen.length}):`);
          alreadySeen.forEach((repo, idx) => {
            const history = historyManager.getProject(repo.full_name);
            const starsDiff = repo.stars - (history?.last_stars || 0);
            safeLogger.info(`     ${idx + 1}. ${repo.full_name} (${repo.stars} stars, +${starsDiff} since last)`);
          });
        }

        // 5. Generate AI summaries for repos to push (with concurrency control)
        const summarizer = new AISummarizer(aiConfig);
        const maxWorkers = ConfigManager.getMaxWorkers(effectiveConfig);
        const reposWithSummary: RepositoryInfo[] = [];

        safeLogger.info(`Generating AI summaries with ${maxWorkers} workers...`);

        // Process repositories in batches with concurrency control
        for (let i = 0; i < shouldPush.length; i += maxWorkers) {
          const batch = shouldPush.slice(i, i + maxWorkers);
          safeLogger.info(`[Batch ${Math.floor(i / maxWorkers) + 1}/${Math.ceil(shouldPush.length / maxWorkers)}] Processing ${batch.length} repositories...`);

          const batchResults = await Promise.allSettled(
            batch.map(async (repo) => {
              try {
                safeLogger.info(`  📖 [${repo.full_name}] Fetching README...`);
                const readmeContent = await fetcher.fetchReadme(repo.full_name);

                let summary = '';

                if (readmeContent) {
                  const readmePreview = readmeContent.substring(0, 100).replace(/\n/g, ' ').trim();
                  safeLogger.info(`  ✓ README found (${readmeContent.length} chars), preview: "${readmePreview}..."`);
                  safeLogger.info(`  🤖 [${repo.full_name}] Generating AI summary from README...`);
                  const startTime = Date.now();
                  summary = await summarizer.summarizeReadme(repo.full_name, readmeContent);
                  const duration = Date.now() - startTime;
                  safeLogger.info(`  ✓ Summary generated (${summary.length} chars) in ${duration}ms`);
                  if (summary) {
                    safeLogger.info(`  📝 [${repo.full_name}] Summary: ${summary.substring(0, 100)}...`);
                  } else {
                    safeLogger.warn(`  ⚠ [${repo.full_name}] Summary is empty`);
                  }
                } else {
                  safeLogger.warn(`  ✗ No README found for ${repo.full_name}`);
                  safeLogger.info(`  🤖 [${repo.full_name}] Generating AI summary from metadata...`);
                  const startTime = Date.now();
                  summary = await summarizer.generateSummary(repo);
                  const duration = Date.now() - startTime;
                  safeLogger.info(`  ✓ Summary generated (${summary.length} chars) in ${duration}ms`);
                  if (summary) {
                    safeLogger.info(`  📝 [${repo.full_name}] Summary: ${summary.substring(0, 100)}...`);
                  } else {
                    safeLogger.warn(`  ⚠ [${repo.full_name}] Summary is empty`);
                  }
                }

                return { ...repo, ai_summary: summary };
              } catch (error) {
                safeLogger.error(`  ❌ [${repo.full_name}] Failed to generate summary: ${error}`);
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
              const emailTo = email_to || effectiveConfig?.channels?.email?.recipient || effectiveConfig?.channels?.email?.sender;
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
                    host: effectiveConfig.channels.email.smtp_host || 'smtp.qq.com',
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

        fileLogger.info('[Tool] Execution completed', {
          successCount,
          failedCount: failedChannels.length,
          totalChannels: targetChannels.length,
          pushedCount: reposWithSummary.length,
          newCount: newlySeen.length,
          seenCount: alreadySeen.length,
          channels: pushResults
        });

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
        fileLogger.error('[Tool] Execution failed', {
          error: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined
        });
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
