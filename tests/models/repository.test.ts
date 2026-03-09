import { RepositoryInfo } from '../../src/models/repository';

describe('RepositoryInfo', () => {
  it('should create a repository with required fields', () => {
    const repo: RepositoryInfo = {
      name: 'test-repo',
      full_name: 'owner/test-repo',
      url: 'https://github.com/owner/test-repo',
      stars: 100,
      description: 'A test repository'
    };

    expect(repo.name).toBe('test-repo');
    expect(repo.full_name).toBe('owner/test-repo');
    expect(repo.stars).toBe(100);
  });

  it('should allow optional fields', () => {
    const repo: RepositoryInfo = {
      name: 'test-repo',
      full_name: 'owner/test-repo',
      url: 'https://github.com/owner/test-repo',
      stars: 100,
      description: 'A test repository',
      readme_content: '# Test README',
      ai_summary: 'AI generated summary',
      first_seen: '2026-03-09T10:00:00Z'
    };

    expect(repo.readme_content).toBe('# Test README');
    expect(repo.ai_summary).toBe('AI generated summary');
    expect(repo.first_seen).toBe('2026-03-09T10:00:00Z');
  });
});