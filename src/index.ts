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
import { Logger } from './utils/logger';

const logger = Logger.get('Plugin');

export default function (api: any) {
  logger.info('Starting GitHub Trending plugin registration...');

  // Store api.config for later use in tool execution
  let openclawConfigFromApi: any = null;
  try {
    openclawConfigFromApi = api.config;
    logger.info('api.config available', { hasConfig: !!openclawConfigFromApi });
  } catch (e) {
    logger.warn('api.config not available', { error: e });
  }
  
  // Register CLI command for creating cron jobs or running immediately
  api.registerCli(
    ({ program }: any) => {
      program
        .command('setup-trending <mode> <since> [args...]')
        .description('Setup GitHub trending cron job or run immediately. Mode: "now" for immediate, "cron" for scheduled')
        .option('--schedule <cron>', 'Cron expression (e.g., "0 10 * * 3" for Wed 10:00)')
        .option('--email-to <email>', 'Override email recipient')
        .option('--feishu-webhook <url>', 'Override Feishu webhook URL')
        .action(async (mode: string, since: string, args: string[], options: any) => {
          const cliLogger = Logger.get('CLI');
          const pluginId = 'openclaw-github-trending';
          
          let schedule: string | undefined;
          let channelList: string[] = [];

          // Parse args based on mode
          const modeLower = mode.toLowerCase();
          const sinceLower = since.toLowerCase();

          if (modeLower === 'now') {
            // For "now" mode: args are channels
            channelList = args;
            if (args.length === 1 && args[0].includes(',')) {
              channelList = args[0].split(',').map((c: string) => c.trim());
            }
          } else if (modeLower === 'cron') {
            // For "cron" mode: first arg is schedule, rest are channels
            if (args.length < 1) {
              console.error(`❌ 错误：cron 模式需要 cron 表达式`);
              console.error(`示例：openclaw setup-trending cron weekly "0 10 * * 3" feishu,email`);
              process.exit(1);
            }
            schedule = args[0];
            channelList = args.slice(1);
            if (channelList.length === 1 && channelList[0].includes(',')) {
              channelList = channelList[0].split(',').map((c: string) => c.trim());
            }
          }

          cliLogger.info('setup-trending command executed', { mode: modeLower, since: sinceLower, schedule, channels: channelList, options });

          // Validate since parameter
          const validSince = ['daily', 'weekly', 'monthly'];
          if (!validSince.includes(sinceLower)) {
            console.error(`❌ 错误：since 参数必须是 ${validSince.join(', ')} 之一`);
            console.error(`\n用法:`);
            console.error(`  openclaw setup-trending now <since> [channels...]                    # 立即执行`);
            console.error(`  openclaw setup-trending cron <since> "<cron>" [channels...]           # 创建定时任务`);
            console.error(`\n示例:`);
            console.error(`  openclaw setup-trending now daily feishu,email                        # 立即执行`);
            console.error(`  openclaw setup-trending cron weekly "0 10 * * 3" email,feishu         # 每周三 10:00`);
            console.error(`  openclaw setup-trending cron monthly "0 9 1 * *" feishu               # 每月 1 号 9:00`);
            console.error(`\n选项:`);
            console.error(`  --email-to <email>        覆盖默认邮箱`);
            console.error(`  --feishu-webhook <url>    覆盖默认飞书 webhook`);
            process.exit(1);
          }

          // Check mode: immediate execution or cron scheduling
          if (modeLower === 'now') {
            cliLogger.info('Running immediately', { since: sinceLower, channels: channelList });
            
            // Show clean, user-friendly output
            console.log(`🚀 正在获取 GitHub ${sinceLower === 'daily' ? '今日' : sinceLower === 'weekly' ? '本周' : '本月'} 热榜项目...`);
            console.log(`📬 结果将推送到：${channelList.includes('feishu') ? '飞书' : ''}${channelList.includes('feishu') && channelList.includes('email') ? ' 和 ' : ''}${channelList.includes('email') ? '邮箱' : ''}`);
            console.log('');
            console.log('⏳ 抓取热榜项目并让 AI 进行总结可能需要 1-3 分钟，请稍后...');
            console.log('');

            // Import and call the tool execute function directly
            const githubTrendingTool = await import('./tool');
            
            const toolParams: any = {
              since: sinceLower,
              channels: channelList
            };
            if (options.emailTo) toolParams.email_to = options.emailTo;
            if (options.feishuWebhook) toolParams.feishu_webhook = options.feishuWebhook;

            try {
              // Get plugin config from api
              const pluginConfig = api.config?.plugins?.entries?.[pluginId]?.config || {};
              const openclawConfig = api.config || {};
              
              const result = await githubTrendingTool.githubTrendingTool.handler(
                toolParams,
                pluginConfig,
                openclawConfig
              );

              if (result.success) {
                console.log('✅ 执行成功！');
                console.log(`   已推送 ${result.pushed_count} 个热榜项目`);
                console.log(`   新项目：${result.new_count} 个`);
                console.log(`   已见过：${result.seen_count} 个`);
                console.log('');
                console.log(`📬 请留意您的${channelList.includes('feishu') ? '飞书' : ''}${channelList.includes('feishu') && channelList.includes('email') ? '和' : ''}${channelList.includes('email') ? '邮箱' : ''}，查看详细推送内容。`);
                process.exit(0);
              } else {
                console.error(`❌ 执行失败：${result.message}`);
                process.exit(1);
              }
            } catch (error: any) {
              cliLogger.error('Execution failed', { error: error.message, stack: error.stack });
              console.error(`❌ 执行出错：${error.message}`);
              console.error('');
              console.error('详细日志已记录到：~/.openclaw/logs/github-trending/');
              process.exit(1);
            }
          } else if (modeLower === 'cron') {
            cliLogger.info('Creating cron job', { since: sinceLower, schedule, channels: channelList });
            
            console.log(`📅 正在创建定时任务...`);
            console.log(`   热榜周期：${sinceLower === 'daily' ? '每日' : sinceLower === 'weekly' ? '每周' : '每月'}`);
            console.log(`   执行时间：${schedule}`);
            console.log(`   推送渠道：${channelList.join(', ')}`);
            console.log('');

            // Build tool params for cron job
            const toolParams: any = { since: sinceLower, channels: channelList };
            if (options.emailTo) toolParams.email_to = options.emailTo;
            if (options.feishuWebhook) toolParams.feishu_webhook = options.feishuWebhook;
            
            // Create cron job using openclaw cron add command
            const jobName = `GitHub Trending ${sinceLower} (${channelList.join(',')})`;
            const cronCmd = `openclaw cron add --name "${jobName}" --cron "${schedule}" --system-event '${JSON.stringify({tool: "openclaw-github-trending", params: toolParams})}'`;
            
            const { exec } = await import('child_process');
            try {
              const result = await new Promise((resolve, reject) => {
                exec(cronCmd, (error, stdout, stderr) => {
                  if (error) reject(error);
                  else resolve({ stdout, stderr });
                });
              });
              console.log(`✅ 定时任务创建成功！`);
              console.log(`   任务将按以下时间执行：${schedule}`);
              console.log(`   执行内容：抓取 GitHub ${sinceLower === 'daily' ? '今日' : sinceLower === 'weekly' ? '本周' : '本月'} 热榜`);
              console.log(`   推送渠道：${channelList.join(', ')}`);
              console.log('');
              console.log(`管理任务：`);
              console.log(`  openclaw cron list          # 查看所有任务`);
              console.log(`  openclaw cron remove <id>   # 删除任务`);
              console.log(`  openclaw cron run <id>      # 手动执行任务`);
              process.exit(0);
            } catch (error: any) {
              console.error(`❌ 创建任务失败：${error.message}`);
              console.error(`输出：${error.stdout || ''}`);
              console.error(`错误：${error.stderr || ''}`);
              process.exit(1);
            }
          } else {
            console.error(`❌ 错误：mode 必须是 "now" 或 "cron"`);
            console.error(`用法：openclaw setup-trending <now|cron> <since> [args...]`);
            process.exit(1);
          }
        });
    },
    { commands: ['setup-trending'] }
  );

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

      // Internal logger instance for file logging
      const internalLogger = Logger.get('Tool');

      // Check if plugin is enabled
      const pluginId = 'openclaw-github-trending';
      const entryConfig = openclawConfig?.plugins?.entries?.[pluginId];
      const isEnabled = entryConfig?.enabled ?? true; // Default to enabled if not specified

      internalLogger.info('Plugin enabled status check', { pluginId, isEnabled, entryConfigAvailable: !!entryConfig });

      if (!isEnabled) {
        internalLogger.warn('Plugin is disabled, rejecting execution');
        throw new Error(`插件 ${pluginId} 已禁用，无法执行。请在 openclaw.json 中设置 plugins.entries.${pluginId}.enabled = true`);
      }

      internalLogger.info('Starting execution', {
        params,
        configAvailable: !!pluginConfig,
        storageAvailable: !!storage,
        openclawConfigAvailable: !!openclawConfig
      });

      // Create a logger wrapper that logs to both OpenClaw logger and file
      const safeLogger = {
        info: (msg: string, ...args: any[]) => {
          logger?.info(msg, ...args);
          internalLogger.info(msg, ...args);
        },
        warn: (msg: string, ...args: any[]) => {
          logger?.warn(msg, ...args);
          internalLogger.warn(msg, ...args);
        },
        error: (msg: string, ...args: any[]) => {
          logger?.error(msg, ...args);
          internalLogger.error(msg, ...args);
        }
      };

      // Parse channels (use params.channels, not context)
      const targetChannels = channels || [];
      if (targetChannels.length === 0) {
        // Fallback to configured channels if not specified in params
        if (pluginConfig?.channels?.feishu?.webhook_url) targetChannels.push('feishu');
        if (pluginConfig?.channels?.email?.sender) targetChannels.push('email');
      }

      if (targetChannels.length === 0) {
        safeLogger.error('No channels configured or specified');
        throw new Error('请指定至少一个推送通道：channels 参数，或在配置中配置 webhook_url 或 email');
      }

      // Override channels with provided values
      if (email_to && targetChannels.includes('email')) {
        pluginConfig!.channels!.email!.recipient = email_to;
      }
      if (feishu_webhook && targetChannels.includes('feishu')) {
        pluginConfig!.channels!.feishu!.webhook_url = feishu_webhook;
      }

      try {
        // Initialize history manager
        const historyManager = new HistoryManager();
        if (storage) {
          const historyData = await storage.get('github-trending-history');
          if (historyData) {
            historyManager.importData(historyData);
          }
        }

        // Resolve AI configuration
        const aiConfig = ConfigManager.getAIConfig(pluginConfig, openclawConfig);
        if (!aiConfig.apiKey) {
          safeLogger.error('AI API key not found');
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: 'AI API key is required. Please configure it in plugin settings, OpenClaw global config, or environment variables (OPENAI_API_KEY or ANTHROPIC_API_KEY).',
                timestamp: new Date().toISOString()
              }, null, 2)
            }],
            isError: true
          };
        }

        safeLogger.info(`Using AI provider: ${aiConfig.provider}, model: ${aiConfig.model}`);

        // Fetch trending repositories
        safeLogger.info(`Fetching GitHub trending repositories (${since})`);
        const fetcher = new GitHubFetcher(pluginConfig);
        const repositories = await fetcher.fetchTrending(since);

        // Categorize repositories
        const historyConfig = {
          enabled: pluginConfig?.history?.enabled ?? true,
          star_threshold: pluginConfig?.history?.star_threshold ?? 100
        };
        const { newlySeen, shouldPush, alreadySeen } = historyManager.categorizeRepositories(
          repositories,
          historyConfig
        );

        safeLogger.info(`Found ${repositories.length} repos, ${shouldPush.length} to push`);

        // Log detailed repository information
        safeLogger.info('Detailed repository list:');
        repositories.forEach((repo, index) => {
          safeLogger.info(`  ${index + 1}. ${repo.full_name}`);
          safeLogger.info(`     Stars: ${repo.stars.toLocaleString()} | Description: ${repo.description || 'N/A'}`);
        });

        safeLogger.info('Categorization results:');
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

        // Generate AI summaries (with concurrency control)
        const summarizer = new AISummarizer(aiConfig);
        const maxWorkers = ConfigManager.getMaxWorkers(pluginConfig);
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

        // Push to channels
        const seenWithSummary = alreadySeen.map(r => ({
          ...r,
          ai_summary: historyManager.getProject(r.full_name)?.ai_summary || ''
        }));

        const pushResults: { channel: string; success: boolean; messageId?: string; error?: string }[] = [];

        for (const targetChannel of targetChannels) {
          try {
            if (targetChannel === 'feishu') {
              const webhookUrl = pluginConfig?.channels?.feishu?.webhook_url;
              if (!webhookUrl) {
                safeLogger.warn('Feishu webhook URL not configured, skipping');
                pushResults.push({ channel: 'feishu', success: false, error: 'Webhook URL not configured' });
                continue;
              }

              safeLogger.info(`Pushing ${reposWithSummary.length} repos to Feishu...`);
              const result = await FeishuChannel.push(webhookUrl, reposWithSummary, seenWithSummary, since as 'daily' | 'weekly' | 'monthly');

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
              const emailConfig = pluginConfig?.channels?.email;
              const emailTo = emailConfig?.recipient || emailConfig?.sender;
              if (!emailTo) {
                safeLogger.warn('Email recipient not configured, skipping');
                pushResults.push({ channel: 'email', success: false, error: 'Recipient not configured' });
                continue;
              }

              if (!emailConfig) {
                safeLogger.warn('Email SMTP configuration missing, skipping');
                pushResults.push({ channel: 'email', success: false, error: 'SMTP configuration missing' });
                continue;
              }

              if (!emailConfig.password) {
                safeLogger.warn('Email SMTP password missing, skipping');
                pushResults.push({ channel: 'email', success: false, error: 'SMTP password not configured' });
                continue;
              }

              // Build email config for EmailChannel
              const emailChannelConfig = {
                from: emailConfig.sender || '',
                to: emailTo,
                subject: `GitHub Trending ${since === 'daily' ? 'Daily' : since === 'weekly' ? 'Weekly' : 'Monthly'}`,
                smtp: {
                  host: emailConfig.smtp_host || 'smtp.gmail.com',
                  port: emailConfig.smtp_port || 587,
                  secure: emailConfig.use_tls !== false,
                  auth: {
                    user: emailConfig.sender || '',
                    pass: emailConfig.password
                  }
                }
              };

              safeLogger.info(`Sending email...`);
              safeLogger.info(`  From: ${emailConfig.sender}`);
              safeLogger.info(`  To: ${emailTo}`);
              safeLogger.info(`  Subject: ${emailChannelConfig.subject}`);
              safeLogger.info(`  Repositories: ${reposWithSummary.length} new + ${alreadySeen.length} seen`);

              const result = await EmailChannel.send(
                emailChannelConfig,
                reposWithSummary,
                seenWithSummary,
                since as 'daily' | 'weekly' | 'monthly'
              );

              if (!result) {
                safeLogger.error('EmailChannel.send returned undefined!');
                pushResults.push({ channel: 'email', success: false, error: 'Send returned undefined' });
                continue;
              }

              pushResults.push({
                channel: 'email',
                success: result.success,
                messageId: result.messageId,
                error: result.error || undefined
              });

              if (result.success) {
                safeLogger.info(`✅ Email sent successfully! Message ID: ${result.messageId}`);
                safeLogger.info(`Check inbox: ${emailTo}`);
              } else {
                safeLogger.error(`❌ Email send failed: ${result.error || 'Unknown error'}`);
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

        // Update history
        historyManager.markPushed(reposWithSummary);
        if (storage) {
          await storage.set('github-trending-history', historyManager.exportData());
        }

        // Calculate result statistics
        const successCount = pushResults.filter(r => r.success).length;
        const failedCount = pushResults.filter(r => !r.success).length;
        const pushedCount = reposWithSummary.length;
        const newCount = newlySeen.length;
        const seenCount = alreadySeen.length;
        const totalCount = repositories.length;

        // Build response
        const response = {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: successCount > 0,
              pushed_count: pushedCount,
              new_count: newCount,
              seen_count: seenCount,
              total_count: totalCount,
              channels: pushResults,
              timestamp: new Date().toISOString(),
              message: successCount > 0 ? `成功推送到所有 ${successCount} 个通道` : `推送失败`
            }, null, 2)
          }],
          isError: successCount === 0
        };

        safeLogger.info('Tool execution completed', {
          successCount,
          failedCount,
          totalChannels: targetChannels.length,
          pushedCount,
          newCount,
          seenCount,
          channels: pushResults
        });

        return response;
      } catch (error) {
        safeLogger.error('Tool execution failed', {
          error: error instanceof Error ? error.message : error,
          stack: error instanceof Error ? error.stack : undefined
        });

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

  logger.info('GitHub Trending plugin registration complete');
}
