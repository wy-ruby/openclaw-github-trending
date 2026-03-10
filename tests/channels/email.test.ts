import { EmailChannel } from '../../src/channels/email';
import { RepositoryInfo } from '../../src/models/repository';
import * as markdown from '../../src/utils/markdown';
import nodemailer from 'nodemailer';

// Mock nodemailer and marked
jest.mock('nodemailer');
jest.mock('../../src/utils/markdown', () => ({
  // Simple mock that converts basic markdown and escapes dangerous HTML
  markdownToHTML: (text: string): string => {
    // Escape HTML special characters first
    let escaped = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

    // Convert basic markdown to HTML (for tests that expect HTML)
    escaped = escaped
      .replace(/^# (.*)$/gm, '<h1>$1</h1>')  // h1
      .replace(/^## (.*)$/gm, '<h2>$1</h2>')  // h2
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')  // bold
      .replace(/\*(.*?)\*/g, '<em>$1</em>');  // italic
    return escaped;
  }
}));

describe('EmailChannel', () => {
  const mockEmailConfig: EmailChannelConfig = {
    from: 'trending@example.com',
    to: 'user@example.com',
    subject: 'GitHub Trending Daily',
    smtp: {
      host: 'smtp.example.com',
      port: 587,
      secure: false,
      auth: {
        user: 'test@example.com',
        pass: 'testpass'
      }
    }
  };

  interface EmailChannelConfig {
    from: string;
    to: string;
    subject: string;
    smtp: {
      host: string;
      port: number;
      secure: boolean;
      auth: {
        user: string;
        pass: string;
      };
    };
  }

  const mockTransport = {
    sendMail: jest.fn()
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (nodemailer.createTransport as jest.Mock).mockReturnValue(mockTransport);
  });

  describe('generateHTML', () => {
    it('should generate HTML with proper structure for new repositories', () => {
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

      const html = EmailChannel.generateHTML(repositories, []);

      // Verify HTML contains required elements
      expect(html).toContain('GitHub 热榜推送');
      expect(html).toContain('test-repo');
      expect(html).toContain('TypeScript');
      expect(html).toContain('1.2k');
      expect(html).toContain('567');
    });

    it('should use靛蓝色系设计', () => {
      const repositories: RepositoryInfo[] = [];
      const html = EmailChannel.generateHTML(repositories, []);

      // Verify靛 blue color scheme is used
      expect(html).toContain('#4A6FA5');
      expect(html).toContain('#5B8CB3');
    });

    it('should include date in email title', () => {
      const repositories: RepositoryInfo[] = [];
      const html = EmailChannel.generateHTML(repositories, []);

      const currentDate = new Date();
      const dateStr = currentDate.toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
      expect(html).toContain(dateStr);
    });

    it('should handle empty repository list', () => {
      const html = EmailChannel.generateHTML([], []);

      expect(html).toContain('暂无 trending 项目');
    });

    it('should format large star count with k suffix', () => {
      const repositories: RepositoryInfo[] = [
        {
          name: 'large-repo',
          full_name: 'org/large-repo',
          url: 'https://github.com/org/large-repo',
          stars: 15000,
          description: 'Large repo',
          language: 'Go'
        }
      ];

      const html = EmailChannel.generateHTML(repositories, []);
      expect(html).toContain('15.0k');
    });

    it('should include forks count when available', () => {
      const repositories: RepositoryInfo[] = [
        {
          name: 'fork-repo',
          full_name: 'org/fork-repo',
          url: 'https://github.com/org/fork-repo',
          stars: 3000,
          description: 'Forked repo',
          language: 'Rust',
          forks: 2500
        }
      ];

      const html = EmailChannel.generateHTML(repositories, []);
      expect(html).toContain('2.5k');
    });

    it('should include language badge', () => {
      const repositories: RepositoryInfo[] = [
        {
          name: 'lang-repo',
          full_name: 'org/lang-repo',
          url: 'https://github.com/org/lang-repo',
          stars: 1000,
          description: 'Repo with language',
          language: 'Python'
        }
      ];

      const html = EmailChannel.generateHTML(repositories, []);
      expect(html).toContain('Python');
    });

    it('should convert markdown AI summary to HTML', () => {
      const repositories: RepositoryInfo[] = [
        {
          name: 'md-repo',
          full_name: 'org/md-repo',
          url: 'https://github.com/org/md-repo',
          stars: 100,
          description: 'Test description',
          language: 'JavaScript',
          ai_summary: '# Header\n\n**Bold** and *italic* text.'
        }
      ];

      const html = EmailChannel.generateHTML(repositories, []);
      expect(html).toContain('<h1>Header</h1>');
      expect(html).toContain('<strong>Bold</strong>');
      expect(html).toContain('<em>italic</em>');
    });

    it('should include seen repositories section', () => {
      const newRepos: RepositoryInfo[] = [
        {
          name: 'new-repo',
          full_name: 'org/new-repo',
          url: 'https://github.com/org/new-repo',
          stars: 1000,
          description: 'New repo',
          language: 'Go'
        }
      ];

      const seenRepos: RepositoryInfo[] = [
        {
          name: 'seen-repo',
          full_name: 'org/seen-repo',
          url: 'https://github.com/org/seen-repo',
          stars: 10000,
          description: 'Seen repo',
          language: 'Swift',
          forks: 500
        }
      ];

      const html = EmailChannel.generateHTML(newRepos, seenRepos);

      expect(html).toContain('新上榜项目');
      expect(html).toContain('持续霸榜项目');
      expect(html).toContain('new-repo');
      expect(html).toContain('seen-repo');
    });

    it('should sanitize dangerous HTML content', () => {
      const repositories: RepositoryInfo[] = [
        {
          name: 'safe-repo',
          full_name: 'org/safe-repo',
          url: 'https://github.com/org/safe-repo',
          stars: 100,
          description: '<script>alert(1)</script>Normal text',
          language: 'Rust',
          ai_summary: 'Normal text from AI'
        }
      ];

      const html = EmailChannel.generateHTML(repositories, []);
      // The AI summary should be sanitized - script tags should be removed
      expect(html).not.toContain('<script>');
      expect(html).toContain('Normal text from AI');
    });
  });

  describe('send', () => {
    it('should create transport with correct SMTP config', async () => {
      const config = {
        ...mockEmailConfig,
        smtp: {
          host: 'smtp.example.com',
          port: 587,
          secure: false,
          auth: {
            user: 'user@example.com',
            pass: 'password'
          }
        }
      };

      await EmailChannel.send(config, [], []);

      expect(nodemailer.createTransport).toHaveBeenCalledWith({
        host: 'smtp.example.com',
        port: 587,
        secure: false,
        auth: {
          user: 'user@example.com',
          pass: 'password'
        }
      });
    });

    it('should send email with correct from address', async () => {
      await EmailChannel.send(mockEmailConfig, [], []);

      expect(mockTransport.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'trending@example.com'
        })
      );
    });

    it('should send email to correct recipient', async () => {
      await EmailChannel.send(mockEmailConfig, [], []);

      expect(mockTransport.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@example.com'
        })
      );
    });

    it('should send email with correct subject', async () => {
      await EmailChannel.send(mockEmailConfig, [], []);

      expect(mockTransport.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: 'GitHub Trending Daily'
        })
      );
    });

    it('should send HTML content in email', async () => {
      await EmailChannel.send(mockEmailConfig, [{ name: 'repo', full_name: 'org/repo', url: 'https://github.com/org/repo', stars: 100, description: 'Desc', language: 'JS' }], []);

      expect(mockTransport.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          html: expect.stringContaining('GitHub Trending')
        })
      );
    });

    it('should return success when email is sent successfully', async () => {
      mockTransport.sendMail.mockResolvedValue({ messageId: '123' });

      const result = await EmailChannel.send(mockEmailConfig, [], []);

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('123');
    });

    it('should return error when email sending fails', async () => {
      mockTransport.sendMail.mockRejectedValue(new Error('SMTP Error'));

      const result = await EmailChannel.send(mockEmailConfig, [], []);

      expect(result.success).toBe(false);
      expect(result.error).toContain('SMTP Error');
    });

    it('should handle transport creation failure', async () => {
      (nodemailer.createTransport as jest.Mock).mockImplementation(() => {
        throw new Error('Invalid config');
      });

      const result = await EmailChannel.send(mockEmailConfig, [], []);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid config');
    });
  });

  describe('integration', () => {
    it('should build and send a complete email successfully', async () => {
      const newRepos: RepositoryInfo[] = [
        {
          name: 'integration-repo',
          full_name: 'testorg/integration-repo',
          url: 'https://github.com/testorg/integration-repo',
          stars: 5000,
          description: 'Integration test repository with **markdown** description.',
          language: 'TypeScript',
          forks: 300
        }
      ];

      const seenRepos: RepositoryInfo[] = [
        {
          name: 'seen-integration',
          full_name: 'testorg/seen-integration',
          url: 'https://github.com/testorg/seen-integration',
          stars: 15000,
          description: 'Already seen repository with *italic* description.',
          language: 'Rust',
          forks: 600
        }
      ];

      const config = {
        ...mockEmailConfig,
        smtp: {
          host: 'smtp.gmail.com',
          port: 587,
          secure: false,
          auth: {
            user: 'test@example.com',
            pass: 'testpass'
          }
        }
      };

      mockTransport.sendMail.mockResolvedValue({ messageId: 'test123' });

      const result = await EmailChannel.send(config, newRepos, seenRepos);

      expect(result.success).toBe(true);
      expect(mockTransport.sendMail).toHaveBeenCalled();
    });

    it('should handle large number of repositories', async () => {
      const newRepos: RepositoryInfo[] = Array.from({ length: 20 }, (_, i) => ({
        name: `repo-${i}`,
        full_name: `org/repo-${i}`,
        url: `https://github.com/org/repo-${i}`,
        stars: (i + 1) * 1000,
        description: `Description for repository ${i}`,
        language: ['JavaScript', 'Python', 'Ruby', 'Go'][i % 4]
      }));

      mockTransport.sendMail.mockResolvedValue({ messageId: 'large123' });

      const result = await EmailChannel.send(mockEmailConfig, newRepos, []);

      expect(result.success).toBe(true);
    });
  });
});
