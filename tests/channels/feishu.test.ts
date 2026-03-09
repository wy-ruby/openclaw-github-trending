import { FeishuChannel } from '../../src/channels/feishu';
import { RepositoryInfo } from '../../src/models/repository';
import axios from 'axios';

// Mock axios
jest.mock('axios');

describe('FeishuChannel', () => {
  let channel: FeishuChannel;
  const mockWebhookUrl = 'https://open.feishu.cn/open-apis/bot/v2/hook/test-webhook';

  beforeEach(() => {
    channel = new FeishuChannel(mockWebhookUrl);
    jest.clearAllMocks();
  });

  describe('buildCard', () => {
    it('should build a valid Feishu card for new repositories', () => {
      const repositories: RepositoryInfo[] = [
        {
          name: 'test-repo',
          full_name: 'user/test-repo',
          url: 'https://github.com/user/test-repo',
          stars: 1234,
          description: 'A test repository',
          language: 'TypeScript',
          forks: 567
        }
      ];

      const card = channel['buildCard'](repositories, []);

      // Verify card structure
      expect(card.config).toHaveProperty('wide_screen_mode', true);
      expect(card.header).toBeDefined();
      expect(card.header?.title).toBeDefined();
      expect(card.header?.template).toBe('waph');

      // Verify new repositories section exists
      expect(card.elements).toBeDefined();
      expect(Array.isArray(card.elements)).toBe(true);
    });

    it('should include correct title with date', () => {
      const repositories: RepositoryInfo[] = [];
      const card = channel['buildCard'](repositories, []);

      const title = card.header?.title;
      expect(title).toBeDefined();
      expect(title?.content).toContain('GitHub Trending');
    });

    it('should build card with both new and seen repositories', () => {
      const newRepos: RepositoryInfo[] = [
        {
          name: 'new-repo',
          full_name: 'user/new-repo',
          url: 'https://github.com/user/new-repo',
          stars: 1000,
          description: 'New repository',
          language: 'Python'
        }
      ];

      const seenRepos: RepositoryInfo[] = [
        {
          name: 'seen-repo',
          full_name: 'user/seen-repo',
          url: 'https://github.com/user/seen-repo',
          stars: 5000,
          description: 'Seen repository',
          language: 'JavaScript'
        }
      ];

      const card = channel['buildCard'](newRepos, seenRepos);

      // Verify both sections exist
      expect(card.elements?.length).toBeGreaterThan(0);
    });

    it('should handle empty repository list', () => {
      const card = channel['buildCard']([], []);

      expect(card.elements?.length).toBeGreaterThan(0);
      // Should still have a header
      expect(card.header?.title).toBeDefined();
    });

    it('should format star count with k suffix for large numbers', () => {
      const repositories: RepositoryInfo[] = [
        {
          name: 'large-repo',
          full_name: 'org/large-repo',
          url: 'https://github.com/org/large-repo',
          stars: 1500,
          description: 'Large repo',
          language: 'Go'
        }
      ];

      const card = channel['buildCard'](repositories, []);
      const cardContent = JSON.stringify(card);

      // Should contain 1.5k for 1500 stars
      expect(cardContent).toContain('1.5k');
    });

    it('should include repository description in card', () => {
      const repositories: RepositoryInfo[] = [
        {
          name: 'desc-repo',
          full_name: 'org/desc-repo',
          url: 'https://github.com/org/desc-repo',
          stars: 100,
          description: 'This is a detailed description with multiple lines. It contains important information about the repository. Lines 3 of description.',
          language: 'Rust'
        }
      ];

      const card = channel['buildCard'](repositories, []);
      const cardContent = JSON.stringify(card);

      expect(cardContent).toContain('This is a detailed description');
    });

    it('should include language tag when available', () => {
      const repositories: RepositoryInfo[] = [
        {
          name: 'lang-repo',
          full_name: 'org/lang-repo',
          url: 'https://github.com/org/lang-repo',
          stars: 200,
          description: 'Repo with language',
          language: 'Java'
        }
      ];

      const card = channel['buildCard'](repositories, []);
      const cardContent = JSON.stringify(card);

      expect(cardContent).toContain('Java');
    });

    it('should format forks count with k suffix', () => {
      const repositories: RepositoryInfo[] = [
        {
          name: 'fork-repo',
          full_name: 'org/fork-repo',
          url: 'https://github.com/org/fork-repo',
          stars: 3000,
          description: 'Forked repo',
          language: 'Swift',
          forks: 2500
        }
      ];

      const card = channel['buildCard'](repositories, []);
      const cardContent = JSON.stringify(card);

      expect(cardContent).toContain('2.5k');
    });
  });

  describe('push', () => {
    it('should send POST request to webhook URL', async () => {
      const repositories: RepositoryInfo[] = [];
      (axios.post as jest.Mock).mockResolvedValue({
        status: 200,
        data: { code: 0, msg: 'success' }
      });

      await channel.push(repositories, []);

      expect(axios.post).toHaveBeenCalledWith(
        mockWebhookUrl,
        expect.any(Object),
        expect.objectContaining({
          headers: { 'Content-Type': 'application/json' }
        })
      );
    });

    it('should return success when webhook returns 200', async () => {
      const repositories: RepositoryInfo[] = [];
      (axios.post as jest.Mock).mockResolvedValue({
        status: 200,
        data: { code: 0, msg: 'success' }
      });

      const result = await channel.push(repositories, []);

      expect(result.success).toBe(true);
      expect(result.code).toBe(0);
    });

    it('should handle non-200 webhook response', async () => {
      const repositories: RepositoryInfo[] = [];
      (axios.post as jest.Mock).mockResolvedValue({
        status: 400,
        data: { code: 1000, msg: 'invalid parameter' }
      });

      const result = await channel.push(repositories, []);

      expect(result.success).toBe(false);
    });

    it('should handle webhook request failure', async () => {
      const repositories: RepositoryInfo[] = [];
      (axios.post as jest.Mock).mockRejectedValue(new Error('Network Error'));

      const result = await channel.push(repositories, []);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Network Error');
    });

    it('should return error message when available', async () => {
      const repositories: RepositoryInfo[] = [];
      (axios.post as jest.Mock).mockRejectedValue(new Error('Connection timeout'));

      const result = await channel.push(repositories, []);

      expect(result.error).toBe('Connection timeout');
    });
  });

  describe('integration', () => {
    it('should build and push a complete card successfully', async () => {
      const newRepos: RepositoryInfo[] = [
        {
          name: 'integration-repo',
          full_name: 'testorg/integration-repo',
          url: 'https://github.com/testorg/integration-repo',
          stars: 2000,
          description: 'Integration test repository with long description that should be properly handled by the Feishu card. This demonstrates the card generation with substantial content.',
          language: 'C++',
          forks: 150
        }
      ];

      const seenRepos: RepositoryInfo[] = [
        {
          name: 'seen-integration',
          full_name: 'testorg/seen-integration',
          url: 'https://github.com/testorg/seen-integration',
          stars: 8000,
          description: 'Already seen repository',
          language: 'Kotlin',
          forks: 300
        }
      ];

      (axios.post as jest.Mock).mockResolvedValue({
        status: 200,
        data: { code: 0, msg: 'success' }
      });

      const result = await channel.push(newRepos, seenRepos);

      expect(result.success).toBe(true);
      expect(axios.post).toHaveBeenCalled();
    });

    it('should handle large number of repositories', async () => {
      const newRepos: RepositoryInfo[] = Array.from({ length: 20 }, (_, i) => ({
        name: `repo-${i}`,
        full_name: `org/repo-${i}`,
        url: `https://github.com/org/repo-${i}`,
        stars: (i + 1) * 100,
        description: `Description for repository ${i}`,
        language: ['JavaScript', 'Python', 'Ruby', 'Go'][i % 4]
      }));

      const seenRepos: RepositoryInfo[] = Array.from({ length: 10 }, (_, i) => ({
        name: `seen-${i}`,
        full_name: `org/seen-${i}`,
        url: `https://github.com/org/seen-${i}`,
        stars: (i + 1) * 5000,
        description: `Seen repository ${i}`,
        language: 'Rust'
      }));

      (axios.post as jest.Mock).mockResolvedValue({
        status: 200,
        data: { code: 0, msg: 'success' }
      });

      const result = await channel.push(newRepos, seenRepos);

      expect(result.success).toBe(true);
    });
  });
});
