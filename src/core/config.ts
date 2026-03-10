import { PluginConfig, AIConfig } from '../models/config';

export interface OpenClawConfig {
  defaultApiKey?: string;
  defaultBaseUrl?: string;
  defaultModel?: string;
}

export interface ResolvedAIConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface SMTPConfig {
  smtp_host: string;
  smtp_port: number;
  use_tls: boolean;
  sender: string;
  password: string;
  from_name: string;
  timeout?: number;
}

export class ConfigManager {
  /**
   * Get AI configuration with fallback logic
   * Priority: plugin config > OpenClaw config
   */
  static getAIConfig(
    pluginConfig: PluginConfig,
    openclawConfig: OpenClawConfig = {}
  ): ResolvedAIConfig {
    // Plugin config takes priority
    if (pluginConfig?.ai?.api_key) {
      return {
        apiKey: pluginConfig.ai.api_key,
        baseUrl: pluginConfig.ai.base_url || 'https://api.openai.com/v1',
        model: pluginConfig.ai.model || 'gpt-4o-mini'
      };
    }

    // Fallback to OpenClaw config
    return {
      apiKey: openclawConfig.defaultApiKey || '',
      baseUrl: openclawConfig.defaultBaseUrl || 'https://api.openai.com/v1',
      model: openclawConfig.defaultModel || 'gpt-4o-mini'
    };
  }

  /**
   * Get max workers configuration
   */
  static getMaxWorkers(pluginConfig: PluginConfig): number {
    return pluginConfig?.max_workers || 5;
  }

  /**
   * Get GitHub token configuration
   */
  static getGitHubToken(pluginConfig: PluginConfig): string | undefined {
    return pluginConfig?.github_token;
  }

  /**
   * Detect email configuration from email address or use configured SMTP
   */
  static getEmailConfig(
    email: string,
    password: string,
    pluginEmailConfig?: any
  ): SMTPConfig {
    // If full SMTP config is provided, use it
    if (pluginEmailConfig?.smtp_host) {
      return {
        smtp_host: pluginEmailConfig.smtp_host,
        smtp_port: pluginEmailConfig.smtp_port || 587,
        use_tls: pluginEmailConfig.use_tls ?? true,
        sender: pluginEmailConfig.sender || email,
        password: pluginEmailConfig.password || password,
        from_name: pluginEmailConfig.from_name || 'GitHub Trending',
        timeout: pluginEmailConfig.timeout || 30
      };
    }

    // Otherwise, detect from email domain
    const domain = email.split('@')[1];

    interface EmailPreset {
      smtp_host: string;
      smtp_port: number;
      use_tls: boolean;
    }

    const presets: { [key: string]: EmailPreset } = {
      'qq.com': {
        smtp_host: 'smtp.qq.com',
        smtp_port: 587,
        use_tls: true
      },
      '163.com': {
        smtp_host: 'smtp.163.com',
        smtp_port: 587,
        use_tls: true
      },
      'gmail.com': {
        smtp_host: 'smtp.gmail.com',
        smtp_port: 587,
        use_tls: true
      },
      'aliyun.com': {
        smtp_host: 'smtp.aliyun.com',
        smtp_port: 587,
        use_tls: true
      }
    };

    const preset = presets[domain] || presets['qq.com'];

    return {
      smtp_host: preset.smtp_host,
      smtp_port: preset.smtp_port,
      use_tls: preset.use_tls,
      sender: email,
      password: password,
      from_name: 'GitHub Trending',
      timeout: 30
    };
  }
}
