import { AISummarizer } from '../../src/core/summarizer';
import { RepositoryInfo } from '../../src/models/repository';

// Mock OpenAI SDK
const mockCreateCompletion = jest.fn();

jest.mock('openai', () => {
  return {
    OpenAI: jest.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: mockCreateCompletion
        }
      }
    }))
  };
});

describe('AISummarizer', () => {
  let summarizer: AISummarizer;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

    summarizer = new AISummarizer({
      apiKey: 'test-api-key',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4'
    });
  });

  describe('buildPrompt', () => {
    it('should build prompt with repository information', () => {
      const repo: RepositoryInfo = {
        name: 'test-repo',
        full_name: 'test-user/test-repo',
        url: 'https://github.com/test-user/test-repo',
        stars: 1234,
        description: 'A test repository',
        language: 'TypeScript',
        forks: 567,
        readme_content: '# Test README\n\nThis is a test repository.'
      };

      const prompt = summarizer.buildPrompt(repo);

      expect(prompt).toContain('test-repo');
      expect(prompt).toContain('test-user/test-repo');
      expect(prompt).toContain('1234');
      expect(prompt).toContain('TypeScript');
      expect(prompt).toContain('# Test README');
      expect(prompt).toContain('请为以下 GitHub 仓库生成一个简洁的中文摘要');
    });

    it('should build prompt without readme when not provided', () => {
      const repo: RepositoryInfo = {
        name: 'test-repo',
        full_name: 'test-user/test-repo',
        url: 'https://github.com/test-user/test-repo',
        stars: 1234,
        description: 'A test repository',
        language: 'TypeScript'
      };

      const prompt = summarizer.buildPrompt(repo);

      expect(prompt).toContain('test-repo');
      expect(prompt).not.toContain('README');
    });

    it('should build prompt with minimal repository information', () => {
      const repo: RepositoryInfo = {
        name: 'minimal',
        full_name: 'user/minimal',
        url: 'https://github.com/user/minimal',
        stars: 100,
        description: 'Minimal repo'
      };

      const prompt = summarizer.buildPrompt(repo);

      expect(prompt).toContain('Minimal repo');
      expect(prompt).toContain('user/minimal');
    });

    it('should handle empty description', () => {
      const repo: RepositoryInfo = {
        name: 'empty-desc',
        full_name: 'user/empty-desc',
        url: 'https://github.com/user/empty-desc',
        stars: 50,
        description: ''
      };

      const prompt = summarizer.buildPrompt(repo);

      expect(prompt).toContain('empty-desc');
    });

    it('should include description in prompt', () => {
      const repo: RepositoryInfo = {
        name: 'repo-with-desc',
        full_name: 'user/repo-with-desc',
        url: 'https://github.com/user/repo-with-desc',
        stars: 1000,
        description: 'A great repository with cool features',
        language: 'Python'
      };

      const prompt = summarizer.buildPrompt(repo);

      expect(prompt).toContain('A great repository with cool features');
    });
  });

  describe('generateSummary', () => {
    it('should generate summary from OpenAI API', async () => {
      const repo: RepositoryInfo = {
        name: 'test-repo',
        full_name: 'test-user/test-repo',
        url: 'https://github.com/test-user/test-repo',
        stars: 1234,
        description: 'A test repository',
        language: 'TypeScript'
      };

      const mockResponse = {
        choices: [
          {
            message: {
              content: '这是一个测试仓库的中文摘要。'
            }
          }
        ]
      };

      mockCreateCompletion.mockResolvedValue(mockResponse);

      const summary = await summarizer.generateSummary(repo);

      expect(summary).toBe('这是一个测试仓库的中文摘要。');
      expect(mockCreateCompletion).toHaveBeenCalled();
    });

    it('should handle API errors gracefully', async () => {
      const repo: RepositoryInfo = {
        name: 'test-repo',
        full_name: 'test-user/test-repo',
        url: 'https://github.com/test-user/test-repo',
        stars: 1234,
        description: 'A test repository',
        language: 'TypeScript'
      };

      mockCreateCompletion.mockRejectedValue(new Error('API Error'));

      const summary = await summarizer.generateSummary(repo);

      expect(summary).toBe('');
    });

    it('should handle empty response from API', async () => {
      const repo: RepositoryInfo = {
        name: 'test-repo',
        full_name: 'test-user/test-repo',
        url: 'https://github.com/test-user/test-repo',
        stars: 1234,
        description: 'A test repository',
        language: 'TypeScript'
      };

      mockCreateCompletion.mockResolvedValue({
        choices: []
      });

      const summary = await summarizer.generateSummary(repo);

      expect(summary).toBe('');
    });

    it('should handle missing message in response', async () => {
      const repo: RepositoryInfo = {
        name: 'test-repo',
        full_name: 'test-user/test-repo',
        url: 'https://github.com/test-user/test-repo',
        stars: 1234,
        description: 'A test repository',
        language: 'TypeScript'
      };

      mockCreateCompletion.mockResolvedValue({
        choices: [
          {
            message: {}
          }
        ]
      });

      const summary = await summarizer.generateSummary(repo);

      expect(summary).toBe('');
    });

    it('should use custom model if provided', async () => {
      const customSummarizer = new AISummarizer({
        apiKey: 'test-api-key',
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-3.5-turbo'
      });

      const repo: RepositoryInfo = {
        name: 'test-repo',
        full_name: 'test-user/test-repo',
        url: 'https://github.com/test-user/test-repo',
        stars: 1234,
        description: 'A test repository',
        language: 'TypeScript'
      };

      const mockResponse = {
        choices: [
          {
            message: {
              content: '使用 gpt-3.5-turbo 生成的摘要。'
            }
          }
        ]
      };

      mockCreateCompletion.mockResolvedValue(mockResponse);

      const summary = await customSummarizer.generateSummary(repo);

      expect(summary).toBe('使用 gpt-3.5-turbo 生成的摘要。');
      expect(mockCreateCompletion).toHaveBeenCalled();
      const callArgs = mockCreateCompletion.mock.calls[0][0];
      expect(callArgs.model).toBe('gpt-3.5-turbo');
      expect(callArgs.messages).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('should handle network timeout', async () => {
      const repo: RepositoryInfo = {
        name: 'test-repo',
        full_name: 'test-user/test-repo',
        url: 'https://github.com/test-user/test-repo',
        stars: 1234,
        description: 'A test repository',
        language: 'TypeScript'
      };

      mockCreateCompletion.mockRejectedValue(new Error('Network Timeout'));

      const summary = await summarizer.generateSummary(repo);

      expect(summary).toBe('');
    });

    it('should handle invalid API key scenario', async () => {
      const repo: RepositoryInfo = {
        name: 'test-repo',
        full_name: 'test-user/test-repo',
        url: 'https://github.com/test-user/test-repo',
        stars: 1234,
        description: 'A test repository',
        language: 'TypeScript'
      };

      mockCreateCompletion.mockRejectedValue(new Error('Authentication error'));

      const summary = await summarizer.generateSummary(repo);

      expect(summary).toBe('');
    });
  });

  describe('integration with RepositoryInfo', () => {
    it('should summarize multiple repositories sequentially', async () => {
      const repos: RepositoryInfo[] = [
        {
          name: 'repo1',
          full_name: 'user/repo1',
          url: 'https://github.com/user/repo1',
          stars: 100,
          description: 'First repository'
        },
        {
          name: 'repo2',
          full_name: 'user/repo2',
          url: 'https://github.com/user/repo2',
          stars: 200,
          description: 'Second repository'
        }
      ];

      mockCreateCompletion.mockResolvedValue({
        choices: [
          {
            message: {
              content: '仓库摘要'
            }
          }
        ]
      });

      const summaries = await Promise.all(repos.map(repo => summarizer.generateSummary(repo)));

      expect(summaries.length).toBe(2);
      expect(summaries[0]).toBe('仓库摘要');
      expect(summaries[1]).toBe('仓库摘要');
    });
  });
});
