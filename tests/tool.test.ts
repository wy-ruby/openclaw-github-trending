import { GitHubFetcher } from '../src/core/fetcher';
import { AISummarizer } from '../src/core/summarizer';
import { FeishuChannel } from '../src/channels/feishu';
import { EmailChannel } from '../src/channels/email';
import { HistoryManager } from '../src/core/history';
import { GitHubTrendingParams } from '../src/models/config';
import { HistoryData } from '../src/core/history';
import { RepositoryInfo } from '../src/models/repository';
import { PushResult } from '../src/channels/types';
import * as toolModule from '../src/tool';

// Mock all external dependencies
jest.mock('../src/core/fetcher');
jest.mock('../src/core/summarizer');
jest.mock('../src/channels/feishu');
jest.mock('../src/channels/email');
jest.mock('../src/core/history');

// Use a mutable reference that will be updated in beforeEach
let currentHistoryData: HistoryData | null = null;

// Create the mock history manager - this will be called in beforeEach
function createMockHistoryManager() {
  const mockData = {
    repositories: {},
    last_updated: new Date().toISOString()
  };

  return {
    data: mockData,
    categorizeRepositories: jest.fn((repos: RepositoryInfo[], config: any) => {
      const newlySeen: RepositoryInfo[] = [];
      const shouldPush: RepositoryInfo[] = [];
      const alreadySeen: RepositoryInfo[] = [];

      repos.forEach(repo => {
        if (currentHistoryData && currentHistoryData.repositories[repo.full_name]) {
          alreadySeen.push(repo);
          // Check if should push based on star threshold
          const history = currentHistoryData.repositories[repo.full_name];
          if (config.enabled && (repo.stars - history.last_stars) >= config.star_threshold) {
            shouldPush.push(repo);
          }
        } else {
          newlySeen.push(repo);
          shouldPush.push(repo);
        }
      });

      return { newlySeen, shouldPush, alreadySeen };
    }),
    markPushed: jest.fn(),
    getProject: jest.fn((fullName: string) => {
      if (currentHistoryData && currentHistoryData.repositories[fullName]) {
        return currentHistoryData.repositories[fullName];
      }
      return undefined;
    }),
    importData: jest.fn((data: HistoryData) => {
      currentHistoryData = data;
      mockData.repositories = data.repositories;
    }),
    exportData: jest.fn(),
    updateAiSummary: jest.fn(),
    clear: jest.fn(),
    getStats: jest.fn(() => ({
      total_repositories: 0,
      total_pushes: 0,
      oldest_entry: undefined,
      newest_entry: undefined
    }))
  };
}

describe('githubTrendingTool', () => {
  const mockFetchTrending = jest.fn();
  const mockGenerateSummary = jest.fn();
  const mockPush = jest.fn();
  const mockSend = jest.fn();

  // This will be set in beforeEach
  let mockHistoryManager: any;

  beforeEach(() => {
    // Reset state
    currentHistoryData = null;
    mockHistoryManager = createMockHistoryManager();

    // Mock GitHubFetcher
    (GitHubFetcher as unknown as jest.Mock).mockImplementation(() => ({
      fetchTrending: mockFetchTrending
    }));

    // Mock AISummarizer
    (AISummarizer as unknown as jest.Mock).mockImplementation(() => ({
      generateSummary: mockGenerateSummary
    }));

    // Mock FeishuChannel
    (FeishuChannel as unknown as jest.Mock).mockImplementation(() => ({
      push: mockPush
    }));
    (FeishuChannel.push as jest.Mock).mockResolvedValue({ success: true, code: 0, msg: 'success' });

    // Mock EmailChannel
    (EmailChannel as unknown as jest.Mock).mockImplementation(() => ({
      send: mockSend
    }));
    (EmailChannel.send as jest.Mock).mockResolvedValue({ success: true, messageId: '123' });

    // Mock HistoryManager - return the same instance for all calls
    (HistoryManager as unknown as jest.Mock).mockImplementation(() => mockHistoryManager);
  });

  describe('tool definition', () => {
    it('should have correct name', () => {
      expect(toolModule.githubTrendingTool.name).toBe('openclaw-github-trending');
    });

    it('should have correct description', () => {
      expect(toolModule.githubTrendingTool.description).toBe('Fetch GitHub trending repositories and push to Feishu or Email');
    });

    it('should have correct parameters schema', () => {
      const params = toolModule.githubTrendingTool.parameters;
      expect(params).toBeDefined();
      expect(params.type).toBe('object');
      expect(params.properties).toBeDefined();

      const props = params.properties as any;
      expect(props.since).toBeDefined();
      expect(props.channels).toBeDefined();

      // Verify since enum values
      expect(props.since.enum).toEqual(['daily', 'weekly', 'monthly']);

      // Verify channels array items
      expect(props.channels.type).toBe('array');
      expect(props.channels.items.enum).toEqual(['feishu', 'email']);
    });
  });

  describe('handler', () => {
    const mockParams: GitHubTrendingParams = {
      since: 'daily',
      channels: ['feishu'],
      feishu_webhook: 'https://open.feishu.cn/open-apis/bot/v2/hook/test'
    };

    const mockRepositories: RepositoryInfo[] = [
      {
        name: 'repo-1',
        full_name: 'user/repo-1',
        url: 'https://github.com/user/repo-1',
        stars: 1000,
        description: 'Repository 1 description',
        language: 'TypeScript',
        forks: 100
      },
      {
        name: 'repo-2',
        full_name: 'user/repo-2',
        url: 'https://github.com/user/repo-2',
        stars: 2000,
        description: 'Repository 2 description',
        language: 'Go',
        forks: 200
      }
    ];

    const mockAiSummaries: Record<string, string> = {
      'user/repo-1': 'AI summary for repository 1',
      'user/repo-2': 'AI summary for repository 2'
    };

    const mockHistoryDataObj: HistoryData = {
      repositories: {
        'user/repo-1': {
          full_name: 'user/repo-1',
          url: 'https://github.com/user/repo-1',
          stars: 1000,
          ai_summary: 'AI summary for repository 1',
          first_seen: '2026-03-08T10:00:00Z',
          last_seen: '2026-03-08T10:00:00Z',
          last_stars: 900,
          push_count: 1,
          last_pushed: '2026-03-08T10:00:00Z'
        }
      },
      last_updated: '2026-03-08T10:00:00Z'
    };

    describe('successful execution', () => {
      it('should fetch trending, generate AI summaries, and push to Feishu', async () => {
        // Setup mocks
        mockFetchTrending.mockResolvedValue(mockRepositories);
        mockGenerateSummary.mockImplementation(async (repo: RepositoryInfo) => {
          return mockAiSummaries[repo.full_name] || '';
        });

        // Execute
        const result = await toolModule.githubTrendingTool.handler(mockParams, {}, {});

        // Verify results
        expect(result.success).toBe(true);
        expect(result.new_count).toBe(2);
        expect(result.seen_count).toBe(0);
        expect(result.pushed_to).toBe('feishu');
        expect(result.message).toContain('成功推送');

        // Verify GitHubFetcher was called
        expect(mockFetchTrending).toHaveBeenCalledWith('daily');

        // Verify AI summarizer was called for each repo
        expect(mockGenerateSummary).toHaveBeenCalledTimes(2);
        expect(mockGenerateSummary).toHaveBeenCalledWith(expect.objectContaining({ full_name: 'user/repo-1' }));
        expect(mockGenerateSummary).toHaveBeenCalledWith(expect.objectContaining({ full_name: 'user/repo-2' }));

        // Verify Feishu push was called
        expect(FeishuChannel.push).toHaveBeenCalledWith(
          'https://open.feishu.cn/open-apis/bot/v2/hook/test',
          expect.any(Array),
          expect.any(Array)
        );
      });

      it('should handle seen repositories from history', async () => {
        const mockRepositoriesWithHistory: RepositoryInfo[] = [
          {
            name: 'repo-1',
            full_name: 'user/repo-1',
            url: 'https://github.com/user/repo-1',
            stars: 1000,
            description: 'Repository 1 description',
            language: 'TypeScript',
            forks: 100
          },
          {
            name: 'repo-new',
            full_name: 'user/repo-new',
            url: 'https://github.com/user/repo-new',
            stars: 3000,
            description: 'New repository',
            language: 'Python',
            forks: 300
          }
        ];

        mockFetchTrending.mockResolvedValue(mockRepositoriesWithHistory);
        mockGenerateSummary.mockImplementation(async (repo: RepositoryInfo) => {
          return mockAiSummaries[repo.full_name] || '';
        });

        const result = await toolModule.githubTrendingTool.handler(mockParams, {}, {}, mockHistoryDataObj);

        expect(result.success).toBe(true);
        expect(result.new_count).toBe(1); // Only repo-new is new
        expect(result.seen_count).toBe(1); // repo-1 is seen
      });

      it('should handle empty repository list', async () => {
        mockFetchTrending.mockResolvedValue([]);

        const result = await toolModule.githubTrendingTool.handler(mockParams, {}, {}, undefined);

        expect(result.success).toBe(true);
        expect(result.new_count).toBe(0);
        expect(result.seen_count).toBe(0);
        expect(result.pushed_to).toBe('feishu');
      });

      it('should return error when fetch fails', async () => {
        mockFetchTrending.mockRejectedValue(new Error('Network Error'));

        const result = await toolModule.githubTrendingTool.handler(mockParams, {}, {}, undefined);

        expect(result.success).toBe(false);
        expect(result.message).toContain('Network Error');
        expect(result.new_count).toBe(0);
        expect(result.seen_count).toBe(0);
      });
    });

    describe('channel-specific behavior', () => {
      it('should include repository data with AI summaries in Feishu card', async () => {
        mockFetchTrending.mockResolvedValue(mockRepositories);
        mockGenerateSummary.mockImplementation(async (repo: RepositoryInfo) => {
          return mockAiSummaries[repo.full_name] || '';
        });

        await toolModule.githubTrendingTool.handler(mockParams, {}, {}, undefined);

        const pushArgs = (FeishuChannel.push as jest.Mock).mock.calls[0];
        const newRepos = pushArgs[1];
        const seenRepos = pushArgs[2];

        expect(newRepos).toHaveLength(2);
        expect(newRepos[0]).toHaveProperty('ai_summary', mockAiSummaries['user/repo-1']);
        expect(newRepos[1]).toHaveProperty('ai_summary', mockAiSummaries['user/repo-2']);
        expect(seenRepos).toEqual([]);
      });

      it('should include repository data with AI summaries in email HTML', async () => {
        const emailParams: GitHubTrendingParams = {
          since: 'daily',
          channels: ['email'],
          email_to: 'user@example.com'
        };

        mockFetchTrending.mockResolvedValue(mockRepositories);
        mockGenerateSummary.mockImplementation(async (repo: RepositoryInfo) => {
          return mockAiSummaries[repo.full_name] || '';
        });

        // Mock the email config detection
        const detectSpy = jest.spyOn(require('../src/core/config').ConfigManager, 'getEmailConfig');
        detectSpy.mockReturnValue({
          smtp_host: 'smtp.gmail.com',
          smtp_port: 587,
          use_tls: true,
          sender: 'user@example.com',
          password: 'password',
          from_name: 'GitHub Trending'
        });

        await toolModule.githubTrendingTool.handler(emailParams, {}, {}, undefined);

        const sendArgs = (EmailChannel.send as jest.Mock).mock.calls[0];
        const newRepos = sendArgs[1];
        const seenRepos = sendArgs[2];

        expect(newRepos).toHaveLength(2);
        expect(newRepos[0]).toHaveProperty('ai_summary', mockAiSummaries['user/repo-1']);
        expect(newRepos[1]).toHaveProperty('ai_summary', mockAiSummaries['user/repo-2']);
        expect(seenRepos).toEqual([]);

        detectSpy.mockRestore();
      });
    });

    describe('error handling', () => {
      it('should handle Feishu push failure', async () => {
        (FeishuChannel.push as jest.Mock).mockResolvedValue({
          success: false,
          error: 'Webhook error'
        });
        mockFetchTrending.mockResolvedValue(mockRepositories);
        mockGenerateSummary.mockResolvedValue('');

        const result = await toolModule.githubTrendingTool.handler(mockParams, {}, {}, undefined);

        expect(result.success).toBe(false);
        expect(result.message).toContain('Webhook error');
      });

      it('should handle email send failure', async () => {
        const emailParams: GitHubTrendingParams = {
          since: 'daily',
          channels: ['email'],
          email_to: 'user@example.com'
        };

        (EmailChannel.send as jest.Mock).mockResolvedValue({
          success: false,
          error: 'SMTP error'
        });
        mockFetchTrending.mockResolvedValue(mockRepositories);
        mockGenerateSummary.mockResolvedValue('');

        // Mock the email config detection
        const spy = jest.spyOn(require('../src/core/config').ConfigManager, 'getEmailConfig');
        spy.mockReturnValue({
          smtp_host: 'smtp.gmail.com',
          smtp_port: 587,
          use_tls: true,
          sender: 'user@example.com',
          password: 'password',
          from_name: 'GitHub Trending'
        });

        const result = await toolModule.githubTrendingTool.handler(emailParams, {}, {}, undefined);

        expect(result.success).toBe(false);
        expect(result.message).toContain('SMTP error');

        spy.mockRestore();
      });
    });

    describe('multi-channel support', () => {
      it('should push to both email and feishu when channels array provided', async () => {
        const multiChannelParams: GitHubTrendingParams = {
          since: 'daily',
          channels: ['email', 'feishu'],
          email_to: 'user@example.com',
          feishu_webhook: 'https://open.feishu.cn/open-apis/bot/v2/hook/test'
        };

        (EmailChannel.send as jest.Mock).mockResolvedValue({
          success: true,
          messageId: 'test-message-id'
        });
        (FeishuChannel.push as jest.Mock).mockResolvedValue({
          success: true,
          msg: 'success'
        });
        mockFetchTrending.mockResolvedValue(mockRepositories);
        mockGenerateSummary.mockResolvedValue('');

        const spy = jest.spyOn(require('../src/core/config').ConfigManager, 'getEmailConfig');
        spy.mockReturnValue({
          smtp_host: 'smtp.gmail.com',
          smtp_port: 587,
          use_tls: true,
          sender: 'user@example.com',
          password: 'password',
          from_name: 'GitHub Trending'
        });

        const result = await toolModule.githubTrendingTool.handler(multiChannelParams, {}, {}, undefined);

        expect(result.success).toBe(true);
        expect(result.message).toContain('成功推送到所有 2 个通道');
        expect(EmailChannel.send).toHaveBeenCalled();
        expect(FeishuChannel.push).toHaveBeenCalled();

        spy.mockRestore();
      });

      it('should handle partial failure when one channel fails', async () => {
        const multiChannelParams: GitHubTrendingParams = {
          since: 'daily',
          channels: ['email', 'feishu'],
          email_to: 'user@example.com',
          feishu_webhook: 'https://open.feishu.cn/open-apis/bot/v2/hook/test'
        };

        (EmailChannel.send as jest.Mock).mockResolvedValue({
          success: false,
          error: 'SMTP error'
        });
        (FeishuChannel.push as jest.Mock).mockResolvedValue({
          success: true,
          msg: 'success'
        });
        mockFetchTrending.mockResolvedValue(mockRepositories);
        mockGenerateSummary.mockResolvedValue('');

        const spy = jest.spyOn(require('../src/core/config').ConfigManager, 'getEmailConfig');
        spy.mockReturnValue({
          smtp_host: 'smtp.gmail.com',
          smtp_port: 587,
          use_tls: true,
          sender: 'user@example.com',
          password: 'password',
          from_name: 'GitHub Trending'
        });

        const result = await toolModule.githubTrendingTool.handler(multiChannelParams, {}, {}, undefined);

        expect(result.success).toBe(true); // One channel succeeded
        expect(result.message).toContain('部分成功');
        expect(result.message).toContain('1/2');
        expect(result.message).toContain('email');

        spy.mockRestore();
      });

      it('should handle all channels failure', async () => {
        const multiChannelParams: GitHubTrendingParams = {
          since: 'daily',
          channels: ['email', 'feishu'],
          email_to: 'user@example.com',
          feishu_webhook: 'https://open.feishu.cn/open-apis/bot/v2/hook/test'
        };

        (EmailChannel.send as jest.Mock).mockResolvedValue({
          success: false,
          error: 'SMTP error'
        });
        (FeishuChannel.push as jest.Mock).mockResolvedValue({
          success: false,
          error: 'Webhook error'
        });
        mockFetchTrending.mockResolvedValue(mockRepositories);
        mockGenerateSummary.mockResolvedValue('');

        const spy = jest.spyOn(require('../src/core/config').ConfigManager, 'getEmailConfig');
        spy.mockReturnValue({
          smtp_host: 'smtp.gmail.com',
          smtp_port: 587,
          use_tls: true,
          sender: 'user@example.com',
          password: 'password',
          from_name: 'GitHub Trending'
        });

        const result = await toolModule.githubTrendingTool.handler(multiChannelParams, {}, {}, undefined);

        expect(result.success).toBe(false);
        expect(result.message).toContain('所有通道推送失败');

        spy.mockRestore();
      });

      it('should maintain backward compatibility with single channel parameter', async () => {
        // 清理之前的 mock 调用
        jest.clearAllMocks();

        const singleChannelParams: GitHubTrendingParams = {
          since: 'daily',
          channels: ['feishu'],
          feishu_webhook: 'https://open.feishu.cn/open-apis/bot/v2/hook/test'
        };

        (FeishuChannel.push as jest.Mock).mockResolvedValue({
          success: true,
          msg: 'success'
        });
        mockFetchTrending.mockResolvedValue(mockRepositories);
        mockGenerateSummary.mockResolvedValue('');

        const result = await toolModule.githubTrendingTool.handler(singleChannelParams, {}, {}, undefined);

        expect(result.success).toBe(true);
        expect(result.pushed_to).toBe('feishu');
        expect(FeishuChannel.push).toHaveBeenCalledTimes(1);
      });
    });

    describe('concurrent AI processing', () => {
      it('should process multiple repositories concurrently', async () => {
        // Reset mock call counts before this test
        jest.clearAllMocks();

        const manyRepositories: RepositoryInfo[] = Array.from({ length: 5 }, (_, i) => ({
          name: `repo-${i}`,
          full_name: `user/repo-${i}`,
          url: `https://github.com/user/repo-${i}`,
          stars: (i + 1) * 100,
          description: `Description ${i}`,
          language: ['JavaScript', 'Python', 'Ruby', 'Go', 'Rust'][i % 5],
          forks: 10
        }));

        mockFetchTrending.mockResolvedValue(manyRepositories);
        mockGenerateSummary.mockImplementation(async (repo: RepositoryInfo) => {
          return `Summary for ${repo.full_name}`;
        });

        const result = await toolModule.githubTrendingTool.handler(mockParams, {}, {}, undefined);

        expect(result.success).toBe(true);
        expect(result.new_count).toBe(5);
        expect(mockGenerateSummary).toHaveBeenCalledTimes(5);
      });
    });
  });
});
