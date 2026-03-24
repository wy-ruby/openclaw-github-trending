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
  sender?: string;
  password?: string;
  from_name?: string;
  timeout?: number;
  recipient?: string;
}

/**
 * WeChat channel configuration (uses @tencent-weixin/openclaw-weixin plugin)
 */
export interface WeChatConfig {
  enabled?: boolean; // Plugin enabled status (controlled by OpenClaw plugin system)
  receiver_id?: string; // WeChat user ID to receive messages
  bot_account_id?: string; // WeChat bot account ID
}

/**
 * Channels configuration
 */
export interface ChannelsConfig {
  feishu?: FeishuConfig;
  email?: EmailConfig;
  wechat?: WeChatConfig;
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
  channels?: ('feishu' | 'email' | 'wechat')[];
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
  history_data?: any; // History data for persistence
}