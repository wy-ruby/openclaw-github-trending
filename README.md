# OpenClaw GitHub Trending Plugin

[![npm version](https://badge.fury.io/js/openclaw-plugin-github-trending.svg)](https://badge.fury.io/js/openclaw-plugin-github-trending)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

English | [简体中文](./README_CN.md)

OpenClaw plugin for fetching GitHub trending repositories and pushing to Feishu or Email with AI-powered summaries.

## Features

- 🔥 **GitHub Trending** — Fetch daily, weekly, or monthly trending repositories
- 🤖 **AI Summaries** — Generate intelligent summaries using OpenAI or Anthropic
- 📢 **Multi-Channel Push** — Support Feishu and Email notifications
- 🔄 **Smart Deduplication** — Track repository history and re-push on significant star growth
- ⏰ **Scheduled Tasks** — Integrate with OpenClaw's task scheduler for automated updates

## Installation

```bash
openclaw plugins install openclaw-plugin-github-trending
```

## Quick Start

### 1. Configure AI Provider

Add your AI provider configuration to `.openclaw/openclaw.json`:

**Using OpenAI:**

```json
{
  "plugins": {
    "github-trending": {
      "ai": {
        "provider": "openai",
        "api_key": "sk-xxx",
        "model": "gpt-4o-mini"
      }
    }
  }
}
```

**Using custom provider (e.g., DashScope, Moonshot):**

```json
{
  "plugins": {
    "github-trending": {
      "ai": {
        "provider": "openai",
        "api_key": "sk-xxx",
        "base_url": "https://coding.dashscope.aliyuncs.com/v1",
        "model": "kimi-k2.5"
      },
      "max_workers": 5,
      "github_token": "github_pat_xxx"
    }
  }
}
```

### 2. Configure Push Channels

#### Feishu

```json
{
  "plugins": {
    "github-trending": {
      "channels": {
        "feishu": {
          "webhook_url": "https://open.feishu.cn/open-apis/bot/v2/hook/xxx"
        }
      }
    }
  }
}
```

#### Email

```json
{
  "plugins": {
    "github-trending": {
      "channels": {
        "email": {
          "smtp_host": "smtp.gmail.com",
          "smtp_port": 587,
          "sender": "your.email@gmail.com",
          "password": "your-app-password"
        }
      }
    }
  }
}
```

### 3. Set Up Scheduled Tasks

Define automated tasks in `.openclaw/openclaw.json`:

```json
{
  "tasks": [
    {
      "name": "Daily Trending to Feishu",
      "schedule": "0 9 * * *",
      "tool": "github-trending",
      "params": {
        "since": "daily",
        "channel": "feishu"
      }
    },
    {
      "name": "Weekly Trending to Email",
      "schedule": "0 10 * * 1",
      "tool": "github-trending",
      "params": {
        "since": "weekly",
        "channel": "email",
        "email_to": "team@example.com"
      }
    }
  ]
}
```

## Configuration

### AI Configuration

The plugin supports OpenAI-compatible API providers. If not configured in the plugin, it will fall back to OpenClaw's AI configuration.

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `provider` | string | No | `"openai"` | AI provider (`"openai"` or `"anthropic"`) |
| `api_key` | string | No* | - | AI provider API key |
| `base_url` | string | No | `"https://api.openai.com/v1"` | API base URL for OpenAI-compatible providers |
| `model` | string | No | `"gpt-4o-mini"` | Model name for summarization |

*If not provided, will use OpenClaw's default AI configuration

#### Supported AI Providers

- **OpenAI**: `provider: "openai"`, default base URL
- **Anthropic**: `provider: "anthropic"`
- **Custom providers**: Any OpenAI-compatible API (e.g., DashScope, Moonshot, DeepSeek, etc.)

**Example with custom provider:**

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

**Why configure GitHub token?**
- Without token: 60 requests/hour limit
- With token: 5000 requests/hour limit
- Get your token: https://github.com/settings/tokens

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

*Required if using email channel

### History Configuration

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `enabled` | boolean | No | `true` | Enable history tracking and deduplication |
| `star_threshold` | number | No | `100` | Re-push if stars increased by this amount |

## Tool Parameters

The `github-trending` tool accepts the following parameters:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `since` | string | Yes | Time period: `"daily"`, `"weekly"`, or `"monthly"` |
| `channel` | string | Yes | Push channel: `"feishu"` or `"email"` |
| `email_to` | string | No | Email recipient (overrides config) |
| `feishu_webhook` | string | No | Feishu webhook URL (overrides config) |

## Smart Deduplication

The plugin tracks repository history and intelligently decides when to re-push:

- **First Discovery**: Always push new repositories
- **Star Growth**: Re-push if stars increased by `star_threshold` (default: 100)
- **History Tracking**: Records repository details, AI summaries, and push history

## Examples

### Manual Tool Call

```bash
# Via OpenClaw CLI
openclaw tools call github-trending --params '{"since": "daily", "channel": "feishu"}'

# Via OpenClaw API
curl -X POST http://localhost:3000/api/tools/github-trending \
  -H "Content-Type: application/json" \
  -d '{"since": "daily", "channel": "email", "email_to": "user@example.com"}'
```

### Multiple Scheduled Tasks

```json
{
  "tasks": [
    {
      "name": "Morning Daily Trending",
      "schedule": "0 9 * * *",
      "tool": "github-trending",
      "params": {
        "since": "daily",
        "channel": "feishu"
      }
    },
    {
      "name": "Weekly Report",
      "schedule": "0 10 * * 1",
      "tool": "github-trending",
      "params": {
        "since": "weekly",
        "channel": "email",
        "email_to": "team@company.com"
      }
    },
    {
      "name": "Monthly Highlights",
      "schedule": "0 10 1 * *",
      "tool": "github-trending",
      "params": {
        "since": "monthly",
        "channel": "email",
        "email_to": "management@company.com"
      }
    }
  ]
}
```

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

## Troubleshooting

### "AI API key is required"

Ensure `ai.api_key` is configured in `.openclaw/openclaw.json`.

### "Feishu webhook URL is required"

Provide `channels.feishu.webhook_url` in config or pass `feishu_webhook` parameter.

### "Email recipient is required"

Provide `channels.email.sender` in config or pass `email_to` parameter.

### AI Summary Generation Failed

- Check API key validity
- Verify model availability
- Check API rate limits

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
openclaw plugins install openclaw-plugin-github-trending
```

## Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) for details.

## License

MIT © [王允](https://github.com/yourusername)

## Support

- 📧 Email: 906971957@qq.com
- 🐛 Issues: [GitHub Issues](https://github.com/yourusername/openclaw-plugin-github-trending/issues)
- 💬 Discussions: [GitHub Discussions](https://github.com/yourusername/openclaw-plugin-github-trending/discussions)

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for release history.