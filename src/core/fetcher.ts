import axios from 'axios';
import * as cheerio from 'cheerio';
import { RepositoryInfo } from '../models/repository';

/**
 * GitHub Trending Fetcher
 * Fetches and parses GitHub trending repositories
 */
export class GitHubFetcher {
  private readonly BASE_URL = 'https://github.com';
  private readonly RAW_URL = 'https://raw.githubusercontent.com';

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

    // Find all trending repositories (Box-row items)
    $('.Box-row[data-trending] article.Box-row, .Box-row:not([data-trending])').each((_, element) => {
      const $item = $(element);

      // Extract repository name and URL
      const $link = $item.find('h1lh-condensed a.link-plain.d-inline-block.text-bold, h1.h3.lh-condensed a.link-plain.d-inline-block.text-bold').first();
      const $fullName = $item.find('h1.h3 lh-condensed a').first();

      // Try different selector patterns for the link
      const $repoLink = $item.find('h1.h3.lh-condensed a').first();
      const href = $repoLink.attr('href');
      if (!href) return;

      // Clean up href to get full URL
      let url = href.startsWith('http') ? href : `${this.BASE_URL}${href}`;

      // Extract full name (owner/repo)
      const fullName = href.replace('/', '').replace(/^\/+/, '');

      // Extract name (last part of path)
      const name = href.split('/').pop() || '';

      // Description
      const description = $item.find('p.col-9.text-gray.my-1.pr-4').text().trim();

      // Star count - try multiple selectors
      let starCount = 0;
      const starText = $item.find('span[aria-label="Star"]').first().text() ||
                       $item.find('.d-inline-block.mr-3').first().find('span').first().text();
      if (starText) {
        starCount = this.parseStarCount(starText);
      }

      // Fork count
      const forkText = $item.find('span[aria-label="Fork"]').first().text() ||
                       $item.find('.d-inline-block.mr-3').eq(1).find('span').first().text();
      const forkCount = this.parseStarCount(forkText);

      // Language
      const language = $item.find('span.text-bold.mr-2').last().text().trim() ||
                       $item.find('.f6.text-gray.mt-2 span.text-bold.mr-2').first().text().trim();

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

    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      if (!response.data) {
        throw new Error('Empty response from GitHub');
      }

      if (response.status !== 200) {
        throw new Error(`Failed to fetch trending page: HTTP ${response.status}`);
      }

      return this.parseTrendingPage(response.data);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to fetch trending page: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Fetch README content from a repository
   * @param fullName Repository full name (owner/repo)
   * @returns README content as string
   */
  async fetchReadme(fullName: string): Promise<string> {
    // Construct raw URL for README.md
    const readmeUrl = `${this.RAW_URL}/${fullName}/main/README.md`;

    try {
      let response;
      try {
        response = await axios.get(readmeUrl, {
          headers: {
            'Accept': 'text/plain;charset=utf-8'
          },
          maxRedirects: 5
        });
      } catch (error) {
        // If main branch returns 404, try getter branch
        if (axios.isAxiosError(error) && error.response?.status === 404) {
          const getterReadmeUrl = `${this.RAW_URL}/${fullName}/getter/README.md`;
          try {
            response = await axios.get(getterReadmeUrl, {
              headers: {
                'Accept': 'text/plain;charset=utf-8'
              },
              maxRedirects: 5
            });
          } catch (getterError) {
            // Both branches failed
            if (axios.isAxiosError(getterError) && getterError.response?.status === 404) {
              return '';
            }
            throw new Error(`Failed to fetch README: ${getterError instanceof Error ? getterError.message : 'Unknown error'}`);
          }
        } else {
          throw error;
        }
      }

      if (response && response.status === 200) {
        return response.data || '';
      }
      return '';
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response && error.response.status === 404) {
          return '';
        }
      }
      throw new Error(`Failed to fetch README: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

export default GitHubFetcher;
