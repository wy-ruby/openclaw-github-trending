import { z } from 'zod';
import { GitHubFetcher } from './core/fetcher';
import { AISummarizer } from './core/summarizer';
import { HistoryManager } from './core/history';
import { FeishuChannel } from './channels/feishu';
import { EmailChannel } from './channels/email';
import { ConfigManager } from './core/config';
import { RepositoryInfo } from './models/repository';
import { PluginConfig, GitHubTrendingParams } from './models/config';
import { PushResult } from './channels/types';

export default function (api: any) {
  api.registerTool({
    name: 'github-trending',
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
        config: PluginConfig;
        logger: { info: Function; error: Function; warn: Function };
        storage?: { get: Function; set: Function };
      }
    ) {
      const { since, channel, channels, email_to, feishu_webhook } = params;
      const { config: pluginConfig, logger, storage } = context;

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

        // 2. Resolve AI configuration
        const aiConfig = ConfigManager.getAIConfig(pluginConfig, {});
        if (!aiConfig.apiKey) {
          throw new Error('AI API key is required. Please configure it in plugin settings.');
        }

        // 3. Fetch trending repositories
        logger.info(`Fetching GitHub trending repositories (${since})`);
        const fetcher = new GitHubFetcher();
        const repositories = await fetcher.fetchTrending(since);

        // 4. Categorize repositories
        const historyConfig = {
          enabled: pluginConfig?.history?.enabled ?? true,
          star_threshold: pluginConfig?.history?.star_threshold ?? 100
        };
        const { shouldPush, newlySeen, alreadySeen } = historyManager.categorizeRepositories(
          repositories,
          historyConfig
        );

        logger.info(`Found ${repositories.length} repos, ${shouldPush.length} to push`);

        // 5. Generate AI summaries for repos to push
        const summarizer = new AISummarizer(aiConfig);
        const reposWithSummary: RepositoryInfo[] = [];

        for (const repo of shouldPush) {
          try {
            logger.info(`Fetching README for ${repo.full_name}...`);
            const readmeContent = await fetcher.fetchReadme(repo.full_name);

            let summary = '';

            if (readmeContent) {
              logger.info(`README found for ${repo.full_name}, generating summary from README...`);
              summary = await summarizer.summarizeReadme(repo.full_name, readmeContent);
            } else {
              logger.info(`No README found for ${repo.full_name}, using repository metadata...`);
              summary = await summarizer.generateSummary(repo);
            }

            reposWithSummary.push({ ...repo, ai_summary: summary });
          } catch (error) {
            logger.warn(`Failed to generate summary for ${repo.full_name}: ${error}`);
            reposWithSummary.push({ ...repo, ai_summary: '' });
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
              const webhookUrl = feishu_webhook || pluginConfig?.channels?.feishu?.webhook_url;
              if (!webhookUrl) {
                logger.warn('Feishu webhook URL not configured, skipping');
                pushResults.push({ channel: 'feishu', success: false, error: 'Webhook URL not configured' });
                continue;
              }

              logger.info(`Pushing ${reposWithSummary.length} repos to Feishu...`);
              const result = await FeishuChannel.push(webhookUrl, reposWithSummary, seenWithSummary);
              pushResults.push({
                channel: 'feishu',
                success: result.success,
                messageId: result.messageId,
                error: result.error
              });

              if (result.success) {
                logger.info(`✅ Feishu push successful!`);
              } else {
                logger.error(`❌ Feishu push failed: ${result.error || 'Unknown error'}`);
              }
            } else if (targetChannel === 'email') {
              const emailTo = email_to || pluginConfig?.channels?.email?.sender;
              if (!emailTo) {
                logger.warn('Email recipient not configured, skipping');
                pushResults.push({ channel: 'email', success: false, error: 'Recipient not configured' });
                continue;
              }

              if (!pluginConfig?.channels?.email) {
                logger.warn('Email SMTP configuration missing, skipping');
                pushResults.push({ channel: 'email', success: false, error: 'SMTP configuration missing' });
                continue;
              }

              // 验证 SMTP 密码
              if (!pluginConfig.channels.email.password) {
                logger.warn('Email SMTP password missing, skipping');
                pushResults.push({ channel: 'email', success: false, error: 'SMTP password not configured' });
                continue;
              }

              logger.info(`Sending email...`);
              logger.info(`  From: ${pluginConfig.channels.email.sender}`);
              logger.info(`  To: ${emailTo}`);
              logger.info(`  Subject: GitHub Trending ${since === 'daily' ? 'Daily' : since === 'weekly' ? 'Weekly' : 'Monthly'}`);
              logger.info(`  Repositories: ${reposWithSummary.length} new + ${alreadySeen.length} seen`);

              const result = await EmailChannel.send(
                {
                  from: pluginConfig.channels.email.sender!,
                  to: emailTo,
                  subject: `GitHub Trending ${since === 'daily' ? 'Daily' : since === 'weekly' ? 'Weekly' : 'Monthly'}`,
                  smtp: {
                    host: pluginConfig.channels.email.smtp_host || 'smtp.gmail.com',
                    port: pluginConfig.channels.email.smtp_port || 587,
                    secure: false,
                    auth: {
                      user: pluginConfig.channels.email.sender!,
                      pass: pluginConfig.channels.email.password!
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
                error: result.error
              });

              if (result.success) {
                logger.info(`Email sent successfully! Message ID: ${result.messageId || 'N/A'}`);
                logger.info(`Check inbox: ${emailTo}`);
                if (emailTo === pluginConfig.channels.email.sender) {
                  logger.warn(`Email was sent to sender (self). To send to others, set EMAIL_TO in .env`);
                }
              } else {
                logger.error(`Failed to send email: ${result.error || 'Unknown error'}`);
              }
            }
          } catch (error) {
            logger.error(`Failed to push to ${targetChannel}: ${error}`);
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
        logger.error('GitHub trending tool failed:', error);
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