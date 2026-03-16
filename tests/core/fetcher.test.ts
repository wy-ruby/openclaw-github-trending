import { readFileSync } from 'fs';
import { join } from 'path';
import axios from 'axios';
import { GitHubFetcher } from '../../src/core/fetcher';

const FIXTURES_DIR = join(__dirname, '..', 'fixtures');

// Mock axios
jest.mock('axios');

describe('GitHubFetcher', () => {
  let fetcher: GitHubFetcher;

  beforeEach(() => {
    fetcher = new GitHubFetcher();
    jest.clearAllMocks();

    // Mock axios instance methods
    (axios.create as jest.Mock).mockImplementation(() => {
      return {
        get: jest.fn()
      };
    });
  });

  describe('parseStarCount', () => {
    it('should parse simple star count', () => {
      expect(fetcher.parseStarCount('2345')).toBe(2345);
    });

    it('should parse star count with k suffix', () => {
      expect(fetcher.parseStarCount('1.2k')).toBe(1200);
      expect(fetcher.parseStarCount('5k')).toBe(5000);
      expect(fetcher.parseStarCount('10k')).toBe(10000);
    });

    it('should handle edge cases for k suffix', () => {
      expect(fetcher.parseStarCount('1k')).toBe(1000);
      expect(fetcher.parseStarCount('999k')).toBe(999000);
    });

    it('should handle invalid input', () => {
      expect(fetcher.parseStarCount('')).toBe(0);
      expect(fetcher.parseStarCount('invalid')).toBe(0);
      expect(fetcher.parseStarCount(null as any)).toBe(0);
      expect(fetcher.parseStarCount(undefined as any)).toBe(0);
    });
  });

  describe('parseTrendingPage', () => {
    it('should parse trending page HTML and extract repositories', () => {
      const htmlPath = join(FIXTURES_DIR, 'trending-page.html');
      const html = readFileSync(htmlPath, 'utf-8');

      const repos = fetcher.parseTrendingPage(html);

      expect(Array.isArray(repos)).toBe(true);
      expect(repos.length).toBe(4);

      // Check first repository
      expect(repos[0].name).toBe('semantic-kernel');
      expect(repos[0].full_name).toBe('microsoft/semantic-kernel');
      expect(repos[0].url).toBe('https://github.com/microsoft/semantic-kernel');
      expect(repos[0].stars).toBe(2345);
      expect(repos[0].description).toContain('A lightweight SDK for integrating LLMs');

      // Check second repository (with k suffix)
      expect(repos[1].name).toBe('pytorch-book');
      expect(repos[1].stars).toBe(1200);

      // Check third repository
      expect(repos[2].stars).toBe(890);

      // Check fourth repository
      expect(repos[3].stars).toBe(100);
    });

    it('should extract language from trending item', () => {
      const htmlPath = join(FIXTURES_DIR, 'trending-page.html');
      const html = readFileSync(htmlPath, 'utf-8');

      const repos = fetcher.parseTrendingPage(html);

      expect(repos[0].language).toBe('TypeScript');
      expect(repos[1].language).toBe('Python');
      expect(repos[2].language).toBe('Shell');
      expect(repos[3].language).toBe('JavaScript');
    });

    it('should handle empty HTML', () => {
      const repos = fetcher.parseTrendingPage('');
      expect(repos).toEqual([]);
    });

    it('should handle HTML with no trending items', () => {
      const repos = fetcher.parseTrendingPage('<html><body>No trending here</body></html>');
      expect(repos).toEqual([]);
    });
  });

  describe('fetchTrending', () => {
    it('should fetch trending page for daily', async () => {
      const mockHtml = '<html><body><div class="Box-row">test</div></body></html>';

      const mockInstance = { get: jest.fn() };
      (axios.create as jest.Mock).mockReturnValue(mockInstance);
      mockInstance.get.mockResolvedValue({
        status: 200,
        data: mockHtml
      });

      const repos = await fetcher.fetchTrending('daily');

      expect(mockInstance.get).toHaveBeenCalledWith('https://github.com/trending?since=daily');
      expect(Array.isArray(repos)).toBe(true);
    });

    it('should fetch trending page for weekly', async () => {
      const mockHtml = '<html><body><div class="Box-row">test</div></body></html>';

      const mockInstance = { get: jest.fn() };
      (axios.create as jest.Mock).mockReturnValue(mockInstance);
      mockInstance.get.mockResolvedValue({
        status: 200,
        data: mockHtml
      });

      const repos = await fetcher.fetchTrending('weekly');

      expect(mockInstance.get).toHaveBeenCalledWith('https://github.com/trending?since=weekly');
      expect(Array.isArray(repos)).toBe(true);
    });

    it('should fetch trending page for monthly', async () => {
      const mockHtml = '<html><body><div class="Box-row">test</div></body></html>';

      const mockInstance = { get: jest.fn() };
      (axios.create as jest.Mock).mockReturnValue(mockInstance);
      mockInstance.get.mockResolvedValue({
        status: 200,
        data: mockHtml
      });

      const repos = await fetcher.fetchTrending('monthly');

      expect(mockInstance.get).toHaveBeenCalledWith('https://github.com/trending?since=monthly');
      expect(Array.isArray(repos)).toBe(true);
    });

    it('should throw error for invalid since parameter', async () => {
      await expect(fetcher.fetchTrending('hourly' as any)).rejects.toThrow('Invalid since parameter');
    });

    it('should throw error for non-200 response', async () => {
      const mockInstance = { get: jest.fn() };
      (axios.create as jest.Mock).mockReturnValue(mockInstance);
      mockInstance.get.mockResolvedValue({
        status: 404,
        data: 'Not Found'
      });

      await expect(fetcher.fetchTrending('daily')).rejects.toThrow('Failed to fetch trending page');
      expect(mockInstance.get).toHaveBeenCalledWith('https://github.com/trending?since=daily');
    });

    it('should throw error for network failure', async () => {
      const mockInstance = { get: jest.fn() };
      (axios.create as jest.Mock).mockReturnValue(mockInstance);
      mockInstance.get.mockRejectedValue(new Error('Network Error'));

      await expect(fetcher.fetchTrending('daily')).rejects.toThrow('Failed to fetch trending page');
    });
  });

  describe('fetchReadme', () => {
    it('should fetch README content from repository', async () => {
      const mockInstance = { get: jest.fn() };
      (axios.create as jest.Mock).mockReturnValue(mockInstance);
      mockInstance.get.mockResolvedValue({
        status: 200,
        data: '# Test README\n\nThis is a test repository.'
      });

      const readme = await fetcher.fetchReadme('test-user/test-repo');

      expect(mockInstance.get).toHaveBeenCalledWith('https://raw.githubusercontent.com/test-user/test-repo/main/README.md', expect.any(Object));
      expect(readme).toBe('# Test README\n\nThis is a test repository.');
    });

    it('should handle 404 for README', async () => {
      const mockInstance = { get: jest.fn() };
      (axios.create as jest.Mock).mockReturnValue(mockInstance);
      mockInstance.get.mockResolvedValue({
        status: 404,
        data: ''
      });

      const readme = await fetcher.fetchReadme('test-user/test-repo');

      expect(readme).toBe('');
    });

    it('should handle 404 for main branch (fallback to getter)', async () => {
      // When main branch 404s (caught in inner try), it tries getter branch
      // When getter also 404s, we return empty string
      // Simulate this by resolving 404 status (not rejecting)
      const mockInstance = { get: jest.fn() };
      (axios.create as jest.Mock).mockReturnValue(mockInstance);
      mockInstance.get.mockResolvedValue({
        status: 404,
        data: ''
      });

      const readme = await fetcher.fetchReadme('test-user/test-repo');

      // When both main and getter would return 404 (simulated by resolved 404),
      // we should get empty string
      expect(readme).toBe('');
    });

    it('should return empty string for other HTTP errors', async () => {
      const mockInstance = { get: jest.fn() };
      (axios.create as jest.Mock).mockReturnValue(mockInstance);
      mockInstance.get.mockRejectedValue(new Error('Internal Server Error'));

      const readme = await fetcher.fetchReadme('test-user/test-repo');

      // New implementation catches errors and returns empty string
      expect(readme).toBe('');
    });
  });
});