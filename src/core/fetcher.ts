import axios from 'axios';
import * as cheerio from 'cheerio';
import { RepositoryInfo } from '../models/repository';
import { FileLogger } from '../core/file-logger';
import { PluginConfig } from '../models/config';

const fileLogger = FileLogger.getInstance();

/**
 * GitHub Trending Fetcher
 * Fetches and parses GitHub trending repositories
 */
export class GitHubFetcher {
  private readonly BASE_URL = 'https://github.com';
  private readonly RAW_URL = 'https://raw.githubusercontent.com';
  private readonly proxyConfig?: { enabled?: boolean; url?: string };

  constructor(config?: PluginConfig) {
    this.proxyConfig = config?.proxy;
    if (this.proxyConfig?.enabled && this.proxyConfig.url) {
      fileLogger.info('[GitHub Fetcher] Proxy enabled', {
        proxyUrl: this.proxyConfig.url
      });
    }
  }

  /**
   * Create axios instance with proxy configuration
   */
  private createAxiosInstance(proxyConfig?: { enabled?: boolean; url?: string }) {
    const axiosConfig: any = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    };

    // Apply proxy if enabled
    if (proxyConfig?.enabled && proxyConfig.url) {
      fileLogger.info('[GitHub Fetcher] Applying proxy to axios', {
        proxyUrl: proxyConfig.url
      });

      const proxyUrl = proxyConfig.url;
      const match = proxyUrl.match(/^(https?):\/\/(?:([^:]+):([^@]+)@)?([^:]+):(\d+)$/);

      if (match) {
        const [, protocol, username, password, host, port] = match;
        axiosConfig.proxy = {
          protocol: protocol || 'http',
          host: host,
          port: parseInt(port, 10),
          ...(username && password ? { auth: { username, password } } : {})
        };
        fileLogger.info('[GitHub Fetcher] Proxy configuration applied', {
          protocol,
          host,
          port,
          hasAuth: !!username
        });
      } else {
        fileLogger.warn('[GitHub Fetcher] Invalid proxy URL format, using default axios instance', {
          proxyUrl
        });
      }
    }

    return axios.create(axiosConfig);
  }

  /**
   * Parse star count from string (supports k suffix)
   * @param countString Star count as string (e.g., "1.2k", "2345")
   * @returns Number of stars
   */
  parseStarCount(countString: string | null | undefined): number {
    if (!countString || typeof countString !== 'string') {
      return 0;
    }

    const trimmed = countString.trim();
    if (!trimmed) {
      return 0;
    }

    // Check for k suffix (thousands)
    const match = trimmed.match(/^([\d.]+)k$/i);
    if (match) {
      const num = parseFloat(match[1]);
      return isNaN(num) ? 0 : Math.floor(num * 1000);
    }

    // Remove any non-numeric characters (commas, etc.)
    const clean = trimmed.replace(/[^0-9]/g, '');
    const num = parseInt(clean, 10);
    return isNaN(num) ? 0 : num;
  }

  /**
   * Parse trending page HTML and extract repository information
   * @param html HTML content of trending page
   * @returns Array of RepositoryInfo objects
   */
  parseTrendingPage(html: string): RepositoryInfo[] {
    const $ = cheerio.load(html);
    const repositories: RepositoryInfo[] = [];

    // Find all trending repositories using simple, reliable selector
    $('article.Box-row').each((_, element) => {
      const $item = $(element);

      // Extract repository link - support both h1 and h2 (GitHub changed this)
      const $repoLink = $item.find('h2.h3 a, h1.h3 a').first();
      const href = $repoLink.attr('href');
      if (!href) return;

      // Clean up href to get full URL
      let url = href.startsWith('http') ? href : `${this.BASE_URL}${href}`;

      // Extract full name (owner/repo) - clean up whitespace and slashes
      const rawName = $repoLink.text();
      const fullName = rawName.replace(/\s+/g, '').replace('/', '/');

      // Extract name (repo name only)
      const name = href.split('/').pop() || '';

      // Description
      const description = $item.find('p.col-9').text().trim();

      // Total Star count - try new format first, then fallback to old format
      let starCount = 0;
      const starLink = $item.find('a[href$="/stargazers"]');
      if (starLink.length > 0) {
        // New GitHub format: link to stargazers
        const starText = starLink.text().trim();
        starCount = this.parseStarCount(starText);
      } else {
        // Old format: span with aria-label="Star"
        const starText = $item.find('span[aria-label="Star"]').first().text() ||
                         $item.find('.d-inline-block.mr-3').first().find('span').first().text();
        if (starText) {
          starCount = this.parseStarCount(starText);
        }
      }

      // Fork count - try new format first, then fallback to old format
      let forkCount = 0;
      const forkLink = $item.find('a[href$="/forks"]');
      if (forkLink.length > 0) {
        // New GitHub format: link to forks
        const forkText = forkLink.text().trim();
        forkCount = this.parseStarCount(forkText);
      } else {
        // Old format: span with aria-label="Fork"
        const forkText = $item.find('span[aria-label="Fork"]').first().text() ||
                         $item.find('.d-inline-block.mr-3').eq(1).find('span').first().text();
        if (forkText) {
          forkCount = this.parseStarCount(forkText);
        }
      }

      // Language - try itemprop first (real GitHub), then fallback (test fixtures)
      const language = $item.find('span[itemprop="programmingLanguage"]').text().trim() ||
                       $item.find('span.text-bold.mr-2').last().text().trim();

      repositories.push({
        name,
        full_name: fullName,
        url,
        stars: starCount,
        description,
        language,
        forks: forkCount
      });
    });

    return repositories;
  }

  /**
   * Fetch trending repositories
   * @param since Time period: 'daily', 'weekly', 'monthly'
   * @returns Array of RepositoryInfo objects
   */
  async fetchTrending(since: 'daily' | 'weekly' | 'monthly' = 'daily'): Promise<RepositoryInfo[]> {
    if (!['daily', 'weekly', 'monthly'].includes(since)) {
      throw new Error('Invalid since parameter. Must be "daily", "weekly", or "monthly".');
    }

    const url = `${this.BASE_URL}/trending?since=${since}`;

    fileLogger.info('[GitHub Fetcher] Fetching trending repositories', {
      since,
      url,
      proxyConfig: this.proxyConfig,
    });

    try {
      const axiosInstance = this.createAxiosInstance(this.proxyConfig);
      const startTime = Date.now();
      const response = await axiosInstance.get(url);
      const duration = Date.now() - startTime;

      fileLogger.info('[GitHub Fetcher] Got response from GitHub', {
        status: response.status,
        durationMs: duration,
        dataLength: response.data?.length || 0
      });

      if (!response.data) {
        throw new Error('Empty response from GitHub');
      }

      if (response.status !== 200) {
        throw new Error(`Failed to fetch trending page: HTTP ${response.status}`);
      }

      fileLogger.debug('[GitHub Fetcher] Parsing HTML content...');
      const repos = this.parseTrendingPage(response.data);
      fileLogger.info('[GitHub Fetcher] ✅ Successfully parsed trending page', {
        repoCount: repos.length
      });

      return repos;
    } catch (error) {
      fileLogger.error('[GitHub Fetcher] Failed to fetch trending repositories', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });

      if (error instanceof Error) {
        throw new Error(`Failed to fetch trending page: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Fetch README content from a repository
   * Tries multiple file names (README.md, README.rst, README.txt, README) and branches (main, master)
   * @param fullName Repository full name (owner/repo)
   * @returns README content as string, or empty string if not found
   */
  async fetchReadme(fullName: string): Promise<string> {
    const readmeFiles = ['README.md', 'README.rst', 'README.txt', 'README'];
    const branches = ['main', 'master'];

    fileLogger.debug('[GitHub Fetcher] Fetching README', {
      fullName,
      readmeFiles,
      branches
    });

    for (const readmeName of readmeFiles) {
      for (const branch of branches) {
        const readmeUrl = `${this.RAW_URL}/${fullName}/${branch}/${readmeName}`;

        try {
          const axiosInstance = this.createAxiosInstance(this.proxyConfig);
          const startTime = Date.now();
          const response = await axiosInstance.get(readmeUrl, {
            timeout: 10000 // 10 second timeout
          });
          const duration = Date.now() - startTime;

          if (response.status === 200 && response.data) {
            fileLogger.info('[GitHub Fetcher] ✅ README found', {
              fullName,
              readmeName,
              branch,
              contentLength: response.data.length,
              durationMs: duration
            });
            return response.data;
          }
        } catch (error) {
          // Continue to next combination if this one fails
          if (axios.isAxiosError(error) && error.response?.status === 404) {
            fileLogger.debug('[GitHub Fetcher] README not found', {
              fullName,
              readmeName,
              branch
            });
            continue;
          }
          // For other errors, log and continue
          fileLogger.warn('[GitHub Fetcher] Error fetching README', {
            fullName,
            readmeName,
            branch,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
          continue;
        }
      }
    }

    // No README found in any combination
    fileLogger.info('[GitHub Fetcher] No README found in any combination', { fullName });
    return '';
  }
}

export default GitHubFetcher;
