import { OpenAI } from 'openai';
import { RepositoryInfo } from '../models/repository';

/**
 * AI configuration interface
 */
export interface AIConfig {
  /** OpenAI API key */
  apiKey: string;
  /** Base URL for the API (default: https://api.openai.com/v1) */
  baseUrl?: string;
  /** Model name (default: gpt-4) */
  model?: string;
}

/**
 * AI Summarizer class
 * Generates Chinese summaries for GitHub repositories using OpenAI API
 */
export class AISummarizer {
  private readonly client: OpenAI;
  private readonly model: string;

  /**
   * Create a new AISummarizer instance
   * @param config AI configuration
   */
  constructor(config: AIConfig) {
    const { apiKey, baseUrl = 'https://api.openai.com/v1', model = 'gpt-4' } = config;

    this.client = new OpenAI({
      apiKey: apiKey,
      baseURL: baseUrl
    });
    this.model = model;
  }

  /**
   * Build the prompt for AI summary generation
   * @param repo Repository information
   * @returns Prompt string
   */
  buildPrompt(repo: RepositoryInfo): string {
    const {
      name,
      full_name,
      url,
      stars,
      description,
      language,
      forks,
      readme_content
    } = repo;

    let prompt = `请为以下 GitHub 仓库生成一个简洁的中文摘要：

仓库名称: ${name}
完整名称: ${full_name}
仓库地址: ${url}
-stars: ${stars}
`;

    if (language) {
      prompt += `编程语言: ${language}
`;
    }

    if (forks !== undefined) {
      prompt += `Forks: ${forks}
`;
    }

    if (description) {
      prompt += `仓库描述: ${description}
`;
    }

    if (readme_content) {
      prompt += `README 内容:
${readme_content}
`;
    }

    prompt += `
请根据以上信息以及你从网络上搜集到的该 github 项目的相关信息，生成一个 200-300 字的中文摘要，包含：
1. 仓库的主要功能和用途
2. 核心特性
3. 适合的使用场景

摘要应该简洁明了，突出重点。`;

    return prompt;
  }

  /**
   * Generate AI summary for a repository
   * @param repo Repository information
   * @returns AI-generated summary in Chinese, or empty string if failed
   */
  async generateSummary(repo: RepositoryInfo): Promise<string> {
    const prompt = this.buildPrompt(repo);

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: '你是一个专业的技术文档撰写者。你的任务是为 GitHub 仓库生成简洁、准确的中文摘要。摘要应该用中文编写，适合开发者快速了解仓库的用途和特点。'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 300
      });

      // Extract the summary from the response
      const summary = response.choices[0]?.message?.content || '';
      return summary.trim();
    } catch (error) {
      console.error('Failed to generate AI summary:', error);
      return '';
    }
  }

  /**
   * Generate AI summary from README content
   * @param fullName Repository full name (owner/repo)
   * @param readmeContent README.md content
   * @returns AI-generated summary in Chinese, or empty string if failed
   */
  async summarizeReadme(fullName: string, readmeContent: string): Promise<string> {
    const prompt = `你是一个资深的技术专家。请根据以下 GitHub 项目的 README 内容，用中文简明扼要地总结它的核心功能和使用场景。

项目名称：${fullName}

README 内容：
${readmeContent}

请生成一个 200-300 字的中文摘要，包含：
1. 项目的主要功能和用途
2. 核心特性
3. 适合的使用场景

摘要应该简洁明了，突出重点。`;

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: '你是一个专业的技术文档撰写者。你的任务是根据 GitHub 项目的 README 内容生成简洁、准确的中文摘要。摘要应该用中文编写，适合开发者快速了解项目的用途和特点。'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 300
      });

      // Extract the summary from the response
      const summary = response.choices[0]?.message?.content || '';
      return summary.trim();
    } catch (error) {
      console.error('Failed to generate AI summary from README:', error);
      return '';
    }
  }
}

export default AISummarizer;
