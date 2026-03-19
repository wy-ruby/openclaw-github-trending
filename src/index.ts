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
import { FileStorageManager, getStorageManager } from './core/file-storage';

const logger = Logger.get('Plugin');

export default function (api: any) {
  let openclawConfigFromApi: any = null;
  try {
    openclawConfigFromApi = api.config;
  } catch (e) {
    logger.warn('api.config not available', { error: e });
  }

  // Register CLI command for creating cron jobs or running immediately
  api.registerCli(
    ({ program }: any) => {
      program
        .command('gen-cron <mode> <since> <channels>')
        .description('生成 GitHub 热榜定时任务或立即执行')
        .addHelpText('after', `
参数说明：
  mode      执行模式
            - "now" 表示立即执行
            - Cron 表达式（格式：分 时 日 月 周）表示定时执行

  since     热榜周期
            - daily   今日热榜
            - weekly  本周热榜
            - monthly 本月热榜

  channels  推送渠道（多个渠道用逗号分隔）
            - email    推送到邮箱
            - feishu   推送到飞书
            - email,feishu  同时推送到邮箱和飞书

Cron 表达式格式：
  格式：分(0-59) 时(0-23) 日(1-31) 月(1-12) 周(0-7, 0和7都是周日)
  时区：使用服务器本地时间

常用 Cron 示例：
  "0 8 * * *"    - 每天 8:00
  "0 10 * * 3"   - 每周三 10:00
  "0 9 1 * *"    - 每月 1 号 9:00

示例：
  # 立即执行：获取今日热榜并推送到飞书和邮箱
  openclaw gen-cron now daily email,feishu

  # 创建定时任务：每周三 10:00 获取本周热榜并推送到飞书
  openclaw gen-cron "0 10 * * 3" weekly feishu

  # 创建定时任务：每月 1 号 9:00 获取本月热榜并推送到邮箱和飞书
  openclaw gen-cron "0 9 1 * *" monthly email,feishu

  # 创建定时任务：每天早上 8:00 获取今日热榜并推送到邮箱
  openclaw gen-cron "0 8 * * *" daily email

提示：
  - 推送渠道需要在 ~/.openclaw/openclaw.json 中配置
`)
        .action(async (mode: string, since: string, channels: string) => {
          const cliLogger = Logger.get('CLI');
          const pluginId = 'openclaw-github-trending';

          const modeLower = mode.toLowerCase();
          const sinceLower = since.toLowerCase();
          let schedule: string | undefined;
          let channelList: string[] = channels.split(',').map(c => c.trim());

          // Validate since parameter
          const validSince = ['daily', 'weekly', 'monthly'];
          if (!validSince.includes(sinceLower)) {
            console.error(``);
            console.error(`❌ 错误：since 参数必须是 ${validSince.join('、')} 之一`);
            console.error(``);
            console.error(`📌 命令用法：`);
            console.error(`   openclaw gen-cron <mode> <since> <channels>`);
            console.error(``);
            console.error(`📘 参数说明：`);
            console.error(`   mode      : 执行模式 - "now" 表示立即执行，或 Cron 表达式（格式：分 时 日 月 周）`);
            console.error(`   since     : 热榜周期 - "daily"（今日）、"weekly"（本周）、"monthly"（本月）`);
            console.error(`   channels  : 推送渠道 - "email"、"feishu" 或 "email,feishu"（多个渠道用逗号分隔）`);
            console.error(``);
            console.error(`📋 示例：`);
            console.error(`   # 立即执行：获取今日热榜并推送到飞书和邮箱`);
            console.error(`   openclaw gen-cron now daily email,feishu`);
            console.error(``);
            console.error(`   # 创建定时任务：每周三 10:00 获取本周热榜并推送到飞书`);
            console.error(`   openclaw gen-cron "0 10 * * 3" weekly feishu`);
            console.error(``);
            console.error(`   # 创建定时任务：每月 1 号 9:00 获取本月热榜并推送到邮箱和飞书`);
            console.error(`   openclaw gen-cron "0 9 1 * *" monthly email,feishu`);
            console.error(``);
            console.error(`   # 创建定时任务：每天早上 8:00 获取今日热榜并推送到邮箱`);
            console.error(`   openclaw gen-cron "0 8 * * *" daily email`);
            console.error(``);
            console.error(`💡 提示：`);
            console.error(`   - Cron 表达式格式：分(0-59) 时(0-23) 日(1-31) 月(1-12) 周(0-7, 0和7都是周日)`);
            console.error(`   - 常用示例：`);
            console.error(`     "0 8 * * *"   - 每天 8:00`);
            console.error(`     "0 10 * * 3"  - 每周三 10:00`);
            console.error(`     "0 9 1 * *"   - 每月 1 号 9:00`);
            console.error(`   - 推送渠道需要在 ~/.openclaw/openclaw.json 中配置`);
            console.error(``);
            process.exit(1);
          }

          // Validate channels
          const validChannels = ['email', 'feishu'];
          const invalidChannels = channelList.filter(c => !validChannels.includes(c));
          if (invalidChannels.length > 0) {
            console.error(``);
            console.error(`❌ 错误：无效的渠道 "${invalidChannels.join(', ')}"`);
            console.error(``);
            console.error(`📌 可用渠道：${validChannels.join('、')}`);
            console.error(``);
            process.exit(1);
          }

          if (modeLower === 'now') {
            // Immediate execution mode
            cliLogger.info('Running immediately', { since: sinceLower, channels: channelList });

            console.log(``);
            console.log(`🚀 正在获取 GitHub ${sinceLower === 'daily' ? '今日' : sinceLower === 'weekly' ? '本周' : '本月'} 热榜项目...`);
            console.log(`📬 推送渠道：${channelList.map(c => c === 'feishu' ? '🚀 飞书' : '📧 邮箱').join(' + ')}`);
            console.log(``);
            console.log(`⏳ 抓取热榜项目并让 AI 进行总结可能需要 1-3 分钟，请稍候...`);
            console.log(``);

            // Import and call the tool execute function directly
            const githubTrendingTool = await import('./tool');

            const toolParams: any = {
              since: sinceLower,
              channels: channelList
            };

            try {
              // Get plugin config from api - use the same way as registerTool does
              const pluginEntryConfig = api.config?.plugins?.entries?.[pluginId];
              const pluginConfig = pluginEntryConfig?.config || {};
              const openclawConfig = api.config || {};

              cliLogger.info('CLI execution - Plugin config loaded', {
                pluginId,
                pluginConfigAvailable: Object.keys(pluginConfig).length > 0,
                pluginConfigKeys: Object.keys(pluginConfig),
                hasProxyConfig: !!pluginConfig.proxy
              });

              // Load history data from file storage (fallback to OpenClaw API if available)
              let historyData = null;
              try {
                // Primary: Use file-based storage manager
                const storageManager = getStorageManager(pluginId);
                historyData = await storageManager.get('github-trending-history');

                if (historyData) {
                  cliLogger.info('CLI execution - History data loaded from file storage', {
                    hasHistory: true,
                    repoCount: Object.keys(historyData.repositories || {}).length,
                    storagePath: `~/.openclaw/plugins/${pluginId}/data/${storageManager['getCurrentMonthKey']()}.json`
                  });
                } else {
                  cliLogger.info('CLI execution - No existing history found in file storage');
                }
              } catch (storageError) {
                cliLogger.warn('Failed to load history data from file storage', { error: storageError });
              }

              const result = await githubTrendingTool.githubTrendingTool.handler(
                toolParams,
                pluginConfig,
                openclawConfig,
                historyData // ✅ 传递历史数据
              );

              // Save history data back to file storage using returned history
              try {
                const storageManager = getStorageManager(pluginId);

                // Use history_data returned from handler (contains updated data)
                if (result.history_data) {
                  await storageManager.set('github-trending-history', result.history_data);
                  cliLogger.info('CLI execution - History data saved successfully to file storage', {
                    repoCount: Object.keys(result.history_data.repositories || {}).length,
                    pushedCount: result.pushed_count,
                    newCount: result.new_count
                  });

                  // Log storage statistics
                  const stats = await storageManager.getStats();
                  cliLogger.info('Storage statistics', {
                    currentMonth: stats.currentMonth,
                    currentMonthSize: stats.currentMonthSize,
                    totalMonths: stats.totalMonths,
                    totalSize: stats.totalSize
                  });
                } else {
                  cliLogger.warn('CLI execution - No history_data returned from handler');
                }
              } catch (saveError) {
                cliLogger.warn('Failed to save history data to file storage', { error: saveError });
              }

              if (result.success) {
                console.log(`✅ 执行成功！`);
                console.log(`   已推送 ${result.pushed_count} 个热榜项目`);
                console.log(`   新项目：${result.new_count} 个`);
                console.log(`   已见过：${result.seen_count} 个`);
                console.log(``);
                console.log(`📬 请查看您的 ${channelList.map(c => c === 'feishu' ? '飞书' : '邮箱').join(' 和 ')}，查看详细推送内容。`);
                console.log(``);
                process.exit(0);
              } else {
                console.error(`❌ 执行失败：${result.message}`);
                console.error(``);
                process.exit(1);
              }
            } catch (error: any) {
              cliLogger.error('Execution failed', { error: error.message, stack: error.stack });
              console.error(`❌ 执行出错：${error.message}`);
              console.error(``);
              console.error(`📄 详细日志已记录到：~/.openclaw/logs/github-trending/`);
              console.error(``);
              process.exit(1);
            }
          } else {
            // Cron scheduling mode
            schedule = mode;

            console.log(`📅 正在创建定时任务...`);
            console.log(`   热榜周期：${sinceLower === 'daily' ? '每日' : sinceLower === 'weekly' ? '每周' : '每月'}`);
            console.log(`   执行时间：${schedule}`);
            console.log(`   推送渠道：${channelList.map(c => c === 'feishu' ? '🚀 飞书' : '📧 邮箱').join(' + ')}`);
            console.log(``);

            // Build tool params for cron job
            const toolParams: any = { since: sinceLower, channels: channelList };

            // Create cron job using openclaw cron add command
            const periodLabel = sinceLower === 'daily' ? '每日' : sinceLower === 'weekly' ? '每周' : '每月';
            const channelLabel = channelList.map(c => c === 'feishu' ? '飞书' : '邮箱').join('+');
            const jobName = `GitHub 热榜 ${periodLabel} ${channelLabel}`;

            // 修复：使用自然语言格式而不是 JSON 格式，这样 Agent 可以正确理解和调用工具
            const channelsParam = channelList.join(',');
            const systemEventText = `请获取 GitHub ${sinceLower === 'daily' ? '今日' : sinceLower === 'weekly' ? '本周' : '本月'} 热榜项目，使用 openclaw-github-trending 工具，参数 since=${sinceLower}, channels=[${channelsParam}]，推送到${channelList.map(c => c === 'feishu' ? '飞书' : '邮箱').join('和')}`;

            const cronCmd = `openclaw cron add --name "${jobName}" --cron "${schedule}" --system-event '${systemEventText.replace(/'/g, "\\'")}'`;

            const { exec } = await import('child_process');
            try {
              await new Promise((resolve, reject) => {
                exec(cronCmd, (error, stdout, stderr) => {
                  if (error) reject(error);
                  else resolve({ stdout, stderr });
                });
              });
              console.log(`✅ 定时任务创建成功！`);
              console.log(``);
              console.log(`📌 任务信息：`);
              console.log(`   执行时间：${schedule}`);
              console.log(`   执行内容：抓取 GitHub ${sinceLower === 'daily' ? '今日' : sinceLower === 'weekly' ? '本周' : '本月'} 热榜`);
              console.log(`   推送渠道：${channelList.map(c => c === 'feishu' ? '🚀 飞书' : '📧 邮箱').join(' + ')}`);
              console.log(``);
              console.log(`⚙️  管理任务：`);
              console.log(`   openclaw cron list          # 👀 查看所有定时任务`);
              console.log(`   openclaw cron run <id>      # ▶️  立即手动执行任务`);
              console.log(`   openclaw cron remove <id>   # 🗑️  删除任务`);
              console.log(``);
              process.exit(0);
            } catch (error: any) {
              console.error(`❌ 创建任务失败：${error.message}`);
              console.error(``);
              process.exit(1);
            }
          }
        });
    },
    { commands: ['gen-cron'] }
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
        openclawConfigAvailable: !!openclawConfig,
        channels: channels || []
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
      // Handle both array format (from zod validation) and string format (from CLI cron job)
      let targetChannels: ('feishu' | 'email')[] = [];

      // Support both array format from zod validation and string format from CLI cron jobs
      if (channels) {
        if (Array.isArray(channels)) {
          // Array format from zod validation
          targetChannels = channels;
        } else {
          // String format - this shouldn't happen with zod validation, but handle it just in case
          const stringChannels = String(channels).split(',').map(c => c.trim());
          targetChannels = stringChannels.filter(c => c === 'feishu' || c === 'email') as ('feishu' | 'email')[];
        }
      }

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

        // Save to both OpenClaw storage and file storage (for redundancy)
        if (storage) {
          await storage.set('github-trending-history', historyManager.exportData());
          safeLogger.info('History saved to OpenClaw storage');
        }

        // Also save to file storage as backup
        try {
          const storageManager = getStorageManager(pluginId);
          await storageManager.set('github-trending-history', historyManager.exportData());
          safeLogger.info('History saved to file storage', {
            path: `~/.openclaw/plugins/${pluginId}/data/${storageManager['getCurrentMonthKey']()}.json`,
            repoCount: Object.keys(historyManager['data'].repositories).length
          });
        } catch (fileStorageError) {
          safeLogger.warn('Failed to save history to file storage', { error: fileStorageError });
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
}
