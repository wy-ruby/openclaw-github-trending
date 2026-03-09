import { ConfigManager } from '../../src/core/config';
import { PluginConfig } from '../../src/models/config';

describe('ConfigManager', () => {
  describe('getAIConfig', () => {
    it('should use plugin config when available', () => {
      const pluginConfig: PluginConfig = {
        ai: {
          api_key: 'plugin-key',
          base_url: 'https://plugin.api.com',
          model: 'gpt-4'
        }
      };

      const openclawConfig = {
        defaultApiKey: 'openclaw-key',
        defaultBaseUrl: 'https://openclaw.api.com',
        defaultModel: 'gpt-3.5'
      };

      const result = ConfigManager.getAIConfig(pluginConfig, openclawConfig);

      expect(result.apiKey).toBe('plugin-key');
      expect(result.baseUrl).toBe('https://plugin.api.com');
      expect(result.model).toBe('gpt-4');
    });

    it('should fallback to OpenClaw config when plugin config missing', () => {
      const pluginConfig: PluginConfig = {};
      const openclawConfig = {
        defaultApiKey: 'openclaw-key',
        defaultBaseUrl: 'https://openclaw.api.com',
        defaultModel: 'gpt-3.5'
      };

      const result = ConfigManager.getAIConfig(pluginConfig, openclawConfig);

      expect(result.apiKey).toBe('openclaw-key');
      expect(result.baseUrl).toBe('https://openclaw.api.com');
      expect(result.model).toBe('gpt-3.5');
    });

    it('should use default values when no config is provided', () => {
      const pluginConfig: PluginConfig = {};
      const openclawConfig = {};

      const result = ConfigManager.getAIConfig(pluginConfig, openclawConfig);

      expect(result.apiKey).toBe('');
      expect(result.baseUrl).toBe('https://api.openai.com/v1');
      expect(result.model).toBe('gpt-4');
    });
  });

  describe('detectEmailConfig', () => {
    it('should detect QQ email config', () => {
      const result = ConfigManager.detectEmailConfig('test@qq.com', 'password');

      expect(result.smtp_host).toBe('smtp.qq.com');
      expect(result.smtp_port).toBe(587);
      expect(result.use_tls).toBe(true);
      expect(result.sender).toBe('test@qq.com');
      expect(result.password).toBe('password');
      expect(result.from_name).toBe('GitHub Trending');
    });

    it('should detect 163 email config', () => {
      const result = ConfigManager.detectEmailConfig('test@163.com', 'password');

      expect(result.smtp_host).toBe('smtp.163.com');
      expect(result.smtp_port).toBe(587);
      expect(result.use_tls).toBe(true);
    });

    it('should detect Gmail config', () => {
      const result = ConfigManager.detectEmailConfig('test@gmail.com', 'password');

      expect(result.smtp_host).toBe('smtp.gmail.com');
      expect(result.smtp_port).toBe(587);
      expect(result.use_tls).toBe(true);
    });

    it('should detect Aliyun email config', () => {
      const result = ConfigManager.detectEmailConfig('test@aliyun.com', 'password');

      expect(result.smtp_host).toBe('smtp.aliyun.com');
      expect(result.smtp_port).toBe(587);
      expect(result.use_tls).toBe(true);
    });

    it('should fallback to QQ config for unknown domain', () => {
      const result = ConfigManager.detectEmailConfig('test@unknown.com', 'password');

      expect(result.smtp_host).toBe('smtp.qq.com');
    });
  });
});
