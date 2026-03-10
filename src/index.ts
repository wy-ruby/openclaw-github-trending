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
      channel: z.enum(['feishu', 'email']).describe('Push channel'),
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
      const { since, channel, email_to, feishu_webhook } = params;
      const { config: pluginConfig, logger, storage } = context;

      try {
        // 1. Load history from storage
        const historyManager = new HistoryManager();
        if (storage) {
          const historyData = await storage.get('github-trending-history');
          if (historyData) {
            historyManager.importData(historyData);
          }
        }

        // 2. Resolve configuration (parameter first, config fallback)
        const aiConfig = ConfigManager.getAIConfig(pluginConfig, {});
        const channelConfig = channel === 'feishu'
          ? { webhook_url: feishu_webhook || pluginConfig?.channels?.feishu?.webhook_url }
          : {
              email_to: email_to || pluginConfig?.channels?.email?.sender,
              smtp: pluginConfig?.channels?.email
            };

        // 3. Validate configuration
        if (!aiConfig.apiKey) {
          throw new Error('AI API key is required. Please configure it in plugin settings.');
        }

        if (channel === 'feishu' && !channelConfig.webhook_url) {
          throw new Error('Feishu webhook URL is required. Provide it in params or config.');
        }

        if (channel === 'email' && !channelConfig.email_to) {
          throw new Error('Email recipient is required. Provide it in params or config.');
        }

        // 4. Fetch trending repositories
        logger.info(`Fetching GitHub trending repositories (${since})`);
        const fetcher = new GitHubFetcher();
        const repositories = await fetcher.fetchTrending(since);

        // 5. Categorize repositories (new vs should push vs seen)
        const historyConfig = {
          enabled: pluginConfig?.history?.enabled ?? true,
          star_threshold: pluginConfig?.history?.star_threshold ?? 100
        };
        const { shouldPush, newlySeen, alreadySeen } = historyManager.categorizeRepositories(
          repositories,
          historyConfig
        );

        logger.info(`Found ${repositories.length} repos, ${shouldPush.length} to push`);

        // 6. Generate AI summaries for repos to push
        const summarizer = new AISummarizer(aiConfig);
        const reposWithSummary: RepositoryInfo[] = [];

        for (const repo of shouldPush) {
          try {
            const summary = await summarizer.generateSummary(repo);
            reposWithSummary.push({ ...repo, ai_summary: summary });
          } catch (error) {
            logger.warn(`Failed to generate summary for ${repo.full_name}: ${error}`);
            reposWithSummary.push({ ...repo, ai_summary: '' });
          }
        }

        // 7. Push to channel
        let pushResult: PushResult;
        const seenWithSummary = alreadySeen.map(r => ({
          ...r,
          ai_summary: historyManager.getProject(r.full_name)?.ai_summary || ''
        }));

        if (channel === 'feishu') {
          pushResult = await FeishuChannel.push(
            channelConfig.webhook_url!,
            reposWithSummary,
            seenWithSummary
          );
        } else {
          if (!channelConfig.smtp) {
            throw new Error('Email SMTP configuration is missing');
          }
          pushResult = await EmailChannel.send(
            {
              from: channelConfig.smtp.sender!,
              to: channelConfig.email_to!,
              subject: `GitHub Trending ${since === 'daily' ? 'Daily' : since === 'weekly' ? 'Weekly' : 'Monthly'}`,
              smtp: {
                host: channelConfig.smtp.smtp_host || 'smtp.gmail.com',
                port: channelConfig.smtp.smtp_port || 587,
                secure: false,
                auth: {
                  user: channelConfig.smtp.sender!,
                  pass: channelConfig.smtp.password!
                }
              }
            },
            reposWithSummary,
            seenWithSummary
          );
        }

        // 8. Update history
        historyManager.markPushed(reposWithSummary);
        if (storage) {
          await storage.set('github-trending-history', historyManager.exportData());
        }

        // 9. Return result
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: pushResult.success,
              pushed_count: reposWithSummary.length,
              new_count: newlySeen.length,
              seen_count: alreadySeen.length,
              total_count: repositories.length,
              pushed_to: channel,
              timestamp: new Date().toISOString(),
              message: pushResult.success
                ? `Successfully pushed ${reposWithSummary.length} repositories`
                : pushResult.error || 'Push failed'
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