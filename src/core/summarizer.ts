import { OpenAI } from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { ResolvedAIConfig } from '../models/config';
import { RepositoryInfo } from '../models/repository';

/**
 * AI Summarizer class
 * Generates Chinese summaries for GitHub repositories using OpenAI or Anthropic API
 */
export class AISummarizer {
  private readonly provider: 'openai' | 'anthropic';
  private readonly openaiClient?: OpenAI;
  private readonly anthropicClient?: Anthropic;
  private readonly model: string;

  /**
   * Create a new AISummarizer instance
   * @param config AI configuration
   */
  constructor(config: ResolvedAIConfig) {
    this.provider = config.provider;
    this.model = config.model;

    if (config.provider === 'openai') {
      this.openaiClient = new OpenAI({
        apiKey: config.apiKey,
        baseURL: config.baseUrl
      });
    } else {
      this.anthropicClient = new Anthropic({
        apiKey: config.apiKey,
        baseURL: config.baseUrl
      });
    }
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
   * Generate AI summary for a repository using OpenAI
   * @param repo Repository information
   * @returns AI-generated summary in Chinese, or empty string if failed
   */
  private async generateSummaryOpenAI(repo: RepositoryInfo): Promise<string> {
    const prompt = this.buildPrompt(repo);

    try {
      const response = await this.openaiClient!.chat.completions.create({
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

      const summary = response.choices[0]?.message?.content || '';
      return summary.trim();
    } catch (error) {
      console.error('Failed to generate AI summary with OpenAI:', error);
      return '';
    }
  }

  /**
   * Generate AI summary for a repository using Anthropic
   * @param repo Repository information
   * @returns AI-generated summary in Chinese, or empty string if failed
   */
  private async generateSummaryAnthropic(repo: RepositoryInfo): Promise<string> {
    const prompt = this.buildPrompt(repo);

    try {
      const response = await this.anthropicClient!.messages.create({
        model: this.model,
        max_tokens: 300,
        system: '你是一个专业的技术文档撰写者。你的任务是为 GitHub 仓库生成简洁、准确的中文摘要。摘要应该用中文编写，适合开发者快速了解仓库的用途和特点。',
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      });

      const firstBlock = response.content[0];
      const summary = firstBlock.type === 'text' ? firstBlock.text : '';
      return summary.trim();
    } catch (error) {
      console.error('Failed to generate AI summary with Anthropic:', error);
      return '';
    }
  }

  /**
   * Generate AI summary for a repository
   * @param repo Repository information
   * @returns AI-generated summary in Chinese, or empty string if failed
   */
  async generateSummary(repo: RepositoryInfo): Promise<string> {
    if (this.provider === 'openai') {
      return this.generateSummaryOpenAI(repo);
    } else {
      return this.generateSummaryAnthropic(repo);
    }
  }

  /**
   * Generate AI summary from README content using OpenAI
   * @param fullName Repository full name (owner/repo)
   * @param readmeContent README.md content
   * @returns AI-generated summary in Chinese, or empty string if failed
   */
  private async summarizeReadmeOpenAI(fullName: string, readmeContent: string): Promise<string> {
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
      const response = await this.openaiClient!.chat.completions.create({
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

      const summary = response.choices[0]?.message?.content || '';
      return summary.trim();
    } catch (error) {
      console.error('Failed to generate AI summary from README with OpenAI:', error);
      return '';
    }
  }

  /**
   * Generate AI summary from README content using Anthropic
   * @param fullName Repository full name (owner/repo)
   * @param readmeContent README.md content
   * @returns AI-generated summary in Chinese, or empty string if failed
   */
  private async summarizeReadmeAnthropic(fullName: string, readmeContent: string): Promise<string> {
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
      const response = await this.anthropicClient!.messages.create({
        model: this.model,
        max_tokens: 300,
        system: '你是一个专业的技术文档撰写者。你的任务是根据 GitHub 项目的 README 内容生成简洁、准确的中文摘要。摘要应该用中文编写，适合开发者快速了解项目的用途和特点。',
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      });

      const firstBlock = response.content[0];
      const summary = firstBlock.type === 'text' ? firstBlock.text : '';
      return summary.trim();
    } catch (error) {
      console.error('Failed to generate AI summary from README with Anthropic:', error);
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
    if (this.provider === 'openai') {
      return this.summarizeReadmeOpenAI(fullName, readmeContent);
    } else {
      return this.summarizeReadmeAnthropic(fullName, readmeContent);
    }
  }
}

export default AISummarizer;