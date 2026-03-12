/**
 * AI configuration
 */
export interface AIConfig {
  provider?: 'openai' | 'anthropic';
  api_key?: string;
  base_url?: string;
  model?: string;
}

/**
 * Resolved AI configuration with all required fields
 */
export interface ResolvedAIConfig {
  provider: 'openai' | 'anthropic';
  apiKey: string;
  baseUrl: string;
  model: string;
}

/**
 * Feishu channel configuration
 */
export interface FeishuConfig {
  webhook_url?: string;
}

/**
 * Email channel configuration
 */
export interface EmailConfig {
  smtp_host?: string;
  smtp_port?: number;
  use_tls?: boolean;
  sender?: string;
  password?: string;
  from_name?: string;
  timeout?: number;
  recipient?: string;
}

/**
 * Channels configuration
 */
export interface ChannelsConfig {
  feishu?: FeishuConfig;
  email?: EmailConfig;
}

/**
 * History configuration
 */
export interface HistoryConfig {
  enabled?: boolean;
  star_threshold?: number;
}

/**
 * Proxy configuration (supports http://user:pass@host:port or https://host:port format)
 */
export interface ProxyConfig {
  enabled?: boolean;
  url?: string;
}

/**
 * Plugin configuration
 */
export interface PluginConfig {
  ai?: AIConfig;
  channels?: ChannelsConfig;
  history?: HistoryConfig;
  max_workers?: number;
  github_token?: string;
  proxy?: ProxyConfig;
}

/**
 * Tool parameters
 */
export interface GitHubTrendingParams {
  since: 'daily' | 'weekly' | 'monthly';
  channels?: ('feishu' | 'email')[];
  email_to?: string;
  feishu_webhook?: string;
}

/**
 * Tool result
 */
export interface GitHubTrendingResult {
  success: boolean;
  pushed_count: number;
  new_count: number;
  seen_count: number;
  total_count: number;
  pushed_to: string;
  timestamp: string;
  message: string;
}