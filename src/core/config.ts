import { PluginConfig, AIConfig, ResolvedAIConfig } from '../models/config';

/**
 * Plugin entry configuration
 */
export interface PluginEntryConfig {
  enabled?: boolean;
  config?: Record<string, unknown>;
}

/**
 * Plugins configuration
 */
export interface PluginsConfig {
  enabled?: boolean;
  allow?: string[];
  deny?: string[];
  entries?: Record<string, PluginEntryConfig>;
}

/**
 * OpenClaw global configuration structure
 * Based on OpenClaw's actual config schema
 */
export interface OpenClawGlobalConfig {
  agents?: {
    defaults?: {
      model?: string | { primary?: string; secondary?: string };
      workspace?: string;
    };
  };
  models?: {
    providers?: Record<string, {
      baseUrl?: string;
      apiKey?: string;
      api?: string;  // "openai" or "anthropic-messages"
      models?: Array<{ id: string; name?: string }>;
    }>;
  };
  plugins?: PluginsConfig;
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
   * Parse OpenClaw's model string format "provider/model" (e.g., "openai-codex/gpt-4o")
   * @param modelString Model string in "provider/model" format
   * @returns Object with provider and model, or undefined if invalid
   */
  private static parseModelString(modelString: string): { provider: string; model: string } | undefined {
    const trimmed = modelString.trim();
    const slashIndex = trimmed.indexOf('/');

    if (slashIndex === -1) {
      return undefined;
    }

    const provider = trimmed.substring(0, slashIndex).trim();
    const model = trimmed.substring(slashIndex + 1).trim();

    return provider && model ? { provider, model } : undefined;
  }

  /**
   * Get AI configuration with proper fallback logic
   * Priority: plugin config > OpenClaw global config > default values
   *
   * @param pluginConfig Plugin's own configuration
   * @param openclawConfig OpenClaw's global configuration (from api.config)
   * @returns Resolved AI configuration with all required fields
   */
  static getAIConfig(
    pluginConfig: PluginConfig | undefined,
    openclawConfig?: OpenClawGlobalConfig
  ): ResolvedAIConfig {
    // Priority 1: Plugin config (explicit user setting)
    if (pluginConfig?.ai?.api_key) {
      const provider = pluginConfig.ai.provider || 'openai';
      const defaultBaseUrl = provider === 'anthropic'
        ? 'https://api.anthropic.com'
        : 'https://api.openai.com/v1';

      return {
        provider,
        apiKey: pluginConfig.ai.api_key,
        baseUrl: pluginConfig.ai.base_url || defaultBaseUrl,
        model: pluginConfig.ai.model || (provider === 'anthropic' ? 'claude-3-5-sonnet-20241022' : 'gpt-4o-mini')
      };
    }

    // Priority 2: OpenClaw global config (from api.config)
    if (openclawConfig) {
      const defaultsModel = openclawConfig.agents?.defaults?.model;
      const primaryModel = typeof defaultsModel === 'string'
        ? defaultsModel.trim()
        : (defaultsModel?.primary?.trim() ?? undefined);

      if (primaryModel) {
        const parsed = this.parseModelString(primaryModel);

        if (parsed) {
          const { provider, model } = parsed;
          const providerConfig = openclawConfig.models?.providers?.[provider];

          if (providerConfig?.apiKey) {
            // Determine provider type
            const isAnthropic = providerConfig.api === 'anthropic-messages' ||
                                provider.toLowerCase().includes('anthropic');

            const defaultBaseUrl = isAnthropic
              ? 'https://api.anthropic.com'
              : 'https://api.openai.com/v1';

            return {
              provider: isAnthropic ? 'anthropic' : 'openai',
              apiKey: providerConfig.apiKey,
              baseUrl: providerConfig.baseUrl || defaultBaseUrl,
              model: model
            };
          }
        }
      }
    }

    // Priority 3: Return default config with empty API key (will cause error later if not configured)
    // This allows the plugin to initialize even without AI config, and the error will be caught at usage time
    const defaultProvider = 'openai';
    return {
      provider: defaultProvider,
      apiKey: '', // Will cause error when actually used
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini'
    };
  }

  /**
   * Get max workers configuration
   */
  static getMaxWorkers(pluginConfig: PluginConfig | undefined): number {
    return pluginConfig?.max_workers || 5;
  }

  /**
   * Get GitHub token configuration
   */
  static getGitHubToken(pluginConfig: PluginConfig | undefined): string | undefined {
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