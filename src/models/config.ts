/**
 * AI configuration
 */
export interface AIConfig {
  api_key?: string;
  base_url?: string;
  model?: string;
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
}

/**
 * Channels configuration
 */
export interface ChannelsConfig {
  feishu?: FeishuConfig;
  email?: EmailConfig;
}

/**
 * Plugin configuration
 */
export interface PluginConfig {
  ai?: AIConfig;
  channels?: ChannelsConfig;
  max_workers?: number;
  github_token?: string;
}

/**
 * Tool parameters
 */
export interface GitHubTrendingParams {
  since: 'daily' | 'weekly' | 'monthly';
  channel: 'feishu' | 'email';
  email_to?: string;
  feishu_webhook?: string;
}

/**
 * Tool result
 */
export interface GitHubTrendingResult {
  success: boolean;
  new_count: number;
  seen_count: number;
  pushed_to: string;
  timestamp: string;
  message: string;
}

/**
 * History project interface
 */
export interface HistoryProject {
  full_name: string;
  url: string;
  stars: number;
  ai_summary: string;
  first_seen: string;
}

/**
 * History data interface
 */
export interface HistoryData {
  projects: {
    [full_name: string]: HistoryProject;
  };
}