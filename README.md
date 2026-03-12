# OpenClaw GitHub Trending Plugin

[![npm version](https://badge.fury.io/js/openclaw-github-trending.svg)](https://badge.fury.io/js/openclaw-github-trending)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

English | [简体中文](./README_CN.md)

OpenClaw plugin for fetching GitHub trending repositories and pushing to Feishu or Email with AI-powered summaries.

## Features

- 🔥 **GitHub Trending** — Fetch daily (today), weekly (this week), or monthly (this month) trending repositories
- 🤖 **AI Summaries** — Generate intelligent summaries using OpenAI or Anthropic
- 📢 **Multi-Channel Push** — Support Feishu and Email notifications
- 🔄 **Smart Deduplication** — Track repository history and re-push on significant star growth
- ⏰ **Scheduled Tasks** — Integrate with OpenClaw's task scheduler for automated updates

## Installation

```bash
openclaw plugins install openclaw-github-trending
```

### ⚠️ Security Notice - Allow Non-Bundled Plugin

Since this is a non-official bundled plugin, you need to explicitly allow it in OpenClaw's configuration file after installation, otherwise a security warning will appear at the gateway.

1. Open OpenClaw configuration file (usually located at `~/.openclaw/openclaw.json`).

2. Add this plugin's ID to the `plugins.allow` list:

```json
{
  "plugins": {
    "allow": [
      "openclaw-github-trending"
    ]
  }
}
```

This configuration tells OpenClaw to trust and allow loading this plugin. After completing the configuration, the security warning will disappear.

## Quick Start

### ⚡ Minimal Configuration

**Minimum requirement: Only configure a Feishu Webhook URL to run**, the plugin will automatically inherit AI settings from OpenClaw's global configuration:

```json
{
  "plugins": {
    "openclaw-github-trending": {
      "channels": {
        "feishu": {
          "webhook_url": "https://open.feishu.cn/open-apis/bot/v2/hook/xxx"
        }
      }
    }
  }
}
```

**Complete Configuration Example:**

```json
{
  "plugins": {
    "enabled": true,
    "allow": [
      // Configure to allow loading this plugin, otherwise the gateway will show warnings when viewing status or restarting.
      "openclaw-github-trending"
    ],
    "entries": {
      "openclaw-github-trending": {
        "enabled": true,
        "config": {
          // Optional: AI provider, if not configured, will automatically use OpenClaw's global AI configuration.
          "ai": {
            "provider": "openai",
            "api_key": "sk-sp-xxx",
            "base_url": "https://coding.dashscope.aliyuncs.com/v1",
            "model": "kimi-k2.5"
          },
          // Optional: Maximum concurrency, default 5. Adjust according to your AI model to accelerate summary generation.
          "max_workers": 5,
          // Optional: GitHub personal access token. Frequent calls may trigger rate limits, configuring this can avoid GitHub rate limits. Not recommended as this plugin is not called frequently.
          "github_token": "xxx",
          // Required: Configure at least one channel (Feishu or Email), otherwise you won't receive notifications.
          "channels": {
            "feishu": {
              "webhook_url": "https://open.feishu.cn/open-apis/bot/v2/hook/xxx"
            },
            "email": {
              "smtp_host": "smtp.qq.com",
              "smtp_port": 587,
              "sender": "xxx@qq.com",
              "password": "xxx"
            }
          },
          // Optional: Enable history tracking for smart deduplication
          "history": {
            "enabled": true,
            "star_threshold": 100
          },
          // Optional: If your network can directly access GitHub, you don't need to configure a proxy.
          "proxy": {
            "enabled": true,
            "url": "http://127.0.0.1:7897"
          }
        }
      }
    }
  }
}
```

**How to Get Feishu Webhook URL:**

1. **Create a Feishu Bot:**
   - Create a group chat
   - Click Group Settings → Bot Management
   - Click Group Bot → "Add Bot"
   - Select Custom Bot

2. **Configure the Bot:**
   - Name your bot (e.g., "GitHub Trending")
   - Upload an avatar (optional)
   - Add description
   - Click "Add"

3. **Get the Webhook URL:**
   - After creation, you'll see a webhook URL in this format:
     ```
     https://open.feishu.cn/open-apis/bot/v2/hook/YOUR_WEBHOOK_ID
     ```
   - Copy this URL and paste it into your `webhook_url` config
   - **⚠️ Security Note:** Keep this URL private! Anyone with the URL can send messages to your bot.

4. **Test the Bot:**
   - Send a test message using curl:
     ```bash
     curl -X POST https://open.feishu.cn/open-apis/bot/v2/hook/YOUR_WEBHOOK_ID \
       -H "Content-Type: application/json" \
       -d '{"msg_type":"text","content":{"text":"Test message"}}'
     ```
   - You should see the message in your Feishu chat.

### 3. Set Up Scheduled Tasks (Recommended)

Parameter explanation:
- Parameter 1: `daily`, `weekly`, `monthly` represents daily, weekly, or monthly trending.
- Parameter 2: Execution time in HH:mm format, e.g., `9:00` means 9:00 AM, `10:30` means 10:30 AM.
- Parameter 3: Notification channels, only channels you have configured can be pushed. You can specify multiple channels, separated by commas.

Use the registered `/setup-trending` CLI command to quickly set up scheduled tasks. Simply type the command in OpenClaw chat:

```
/setup-trending daily 9:00 feishu
/setup-trending daily 9:00 email
/setup-trending daily 9:00 feishu,email
/setup-trending monthly 8:00 feishu,email
```

**Time format note**: Times are in **Beijing time (CST/UTC+8)**, so `9:00` means 9:00 AM Beijing time.

#### Quick Test (One-Time Execution)

If you just want to test once to see the effect, without setting up a recurring task:

```bash
# Run once at specific UTC time, then delete
openclaw cron add --name "Test plugin execution" \
  --at "2026-03-12T11:42:00Z" \
  --system-event '{"tool":"openclaw-github-trending","params":{"since":"daily","channels":["feishu", "email"]}}' \
  --wake now \
  --delete-after-run
```

**Note**: `--at` time is in **UTC** format. For Beijing time, add 8 hours (e.g., 9:00 AM Beijing = 01:00 AM UTC).

### Manage Scheduled Tasks

After setting up scheduled tasks, you can manage them with OpenClaw's cron commands:

```bash
# List all scheduled tasks
openclaw cron list

# View run history
openclaw cron runs

# Manually trigger a task
openclaw cron run <job-id>

# Delete a task
openclaw cron rm <job-id>
```

## AI Configuration Details

The plugin supports OpenAI-compatible API providers. If not configured in the plugin, it will fall back to OpenClaw's AI configuration.

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `provider` | string | No | `"openai"` | AI provider, supports custom providers |
| `api_key` | string | No* | - | AI provider API key |
| `base_url` | string | No | `"https://api.openai.com/v1"` | API base URL for OpenAI-compatible providers |
| `model` | string | No | `"gpt-4o-mini"` | Model name for summarization |

**If not provided, will use OpenClaw's default AI configuration**

#### Supported AI Providers

- **OpenAI**: `provider: "openai"`, use default base URL
- **Anthropic**: `provider: "anthropic"`
- **Custom Providers**: Any service compatible with OpenAI API (e.g., DashScope, Moonshot, DeepSeek, etc.)

**Custom Provider Example:**

```json
{
  "ai": {
    "provider": "openai",
    "api_key": "sk-xxx",
    "base_url": "https://coding.dashscope.aliyuncs.com/v1",
    "model": "kimi-k2.5"
  }
}
```

### GitHub Configuration

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `github_token` | string | No | - | GitHub personal access token (increases rate limit) |

**Why configure GitHub Token?**
- Without Token: 60 requests/hour limit
- With Token: 5000 requests/hour limit
- Get Token: https://github.com/settings/tokens

### Concurrency Configuration

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `max_workers` | number | No | `5` | Concurrent workers for AI summarization (recommended: 3-10) |

### Channel Configuration

#### Feishu

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `webhook_url` | string | Yes* | Feishu bot webhook URL |

#### Email

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `smtp_host` | string | No | `"smtp.gmail.com"` | SMTP server host |
| `smtp_port` | number | No | `587` | SMTP server port |
| `use_tls` | boolean | No | `true` | Use TLS/STARTTLS |
| `sender` | string | Yes* | - | Sender email address |
| `password` | string | Yes* | - | Email password or app-specific password |
| `from_name` | string | No | `"GitHub Trending"` | Display name for sender |
| `timeout` | number | No | `30` | SMTP connection timeout in seconds |

*Required when using this channel

### History Configuration

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `enabled` | boolean | No | `true` | Enable history tracking and deduplication |
| `star_threshold` | number | No | `100` | Re-push if stars increased by this amount |

### Proxy Configuration

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `enabled` | boolean | No | `false` | Enable proxy for GitHub requests |
| `url` | string | No | - | Proxy URL (supports `http://user:pass@host:port` or `https://host:port` format) |

**Example:**
```json
{
  "plugins": {
    "openclaw-github-trending": {
      "proxy": {
        "enabled": true,
        "url": "http://127.0.0.1:7890"
      }
    }
  }
}
```

**Proxy with authentication:**
```json
{
  "plugins": {
    "openclaw-github-trending": {
      "proxy": {
        "enabled": true,
        "url": "http://username:password@192.168.1.1:8080"
      }
    }
  }
}
```

## Smart Deduplication

The plugin tracks repository history and intelligently decides when to re-push:

- **First Discovery**: Always push new repositories
- **Star Growth**: Re-push if stars increased by `star_threshold` (default: 100)
- **History Tracking**: Records repository details, AI summaries, and push history

## Security Best Practices

### API Keys

- Store API keys in `.openclaw/openclaw.json` (not in environment variables)
- Use app-specific passwords for email (e.g., Gmail App Passwords)
- Restrict API key permissions to minimum required

### Email Configuration

For Gmail:
1. Enable 2-Factor Authentication
2. Generate an App Password: https://myaccount.google.com/apppasswords
3. Use the app password in the `password` field

### Feishu Webhook

- Keep webhook URLs private
- Rotate webhook URLs periodically
- Use IP whitelisting if available

## Development

### Build

```bash
npm run build
```

### Test

```bash
npm test
npm run test:coverage
```

### Local Development

```bash
# Link to local OpenClaw
npm link

# In OpenClaw project
openclaw plugins install openclaw-github-trending
```

## Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) for details.

## License

MIT © [王允](https://github.com/wy-ruby)

## Support

- 📧 Email: 906971957@qq.com
- 🐛 Issues: [GitHub Issues](https://github.com/wy-ruby/openclaw-github-trending/issues)
- 💬 Discussions: [GitHub Discussions](https://github.com/wy-ruby/openclaw-github-trending/discussions)

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for release history.
