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

export interface EmailConfig {
  smtp_host: string;
  smtp_port: number;
  use_tls: boolean;
  sender: string;
  password: string;
  from_name: string;
}

export class ConfigManager {
  /**
   * Get AI configuration with fallback logic
   */
  static getAIConfig(
    pluginConfig: PluginConfig,
    openclawConfig: OpenClawConfig
  ): ResolvedAIConfig {
    // Priority: plugin config > OpenClaw config
    if (pluginConfig?.ai?.api_key) {
      return {
        apiKey: pluginConfig.ai.api_key,
        baseUrl: pluginConfig.ai.base_url || 'https://api.openai.com/v1',
        model: pluginConfig.ai.model || 'gpt-4'
      };
    }

    // Fallback to OpenClaw config
    return {
      apiKey: openclawConfig.defaultApiKey || '',
      baseUrl: openclawConfig.defaultBaseUrl || 'https://api.openai.com/v1',
      model: openclawConfig.defaultModel || 'gpt-4'
    };
  }

  /**
   * Detect email configuration from email address
   */
  static detectEmailConfig(email: string, password: string): EmailConfig {
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
      from_name: 'GitHub Trending'
    };
  }
}
