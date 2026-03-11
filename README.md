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
openclaw plugin install openclaw-github-trending
```

### ⚠️ Security Notice - Allow Non-Bundled Plugin

Since this plugin is a non-bundled plugin (not officially bundled with OpenClaw), you need to explicitly allow it in OpenClaw's configuration file, otherwise you will see a security warning.

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

This tells OpenClaw to trust and allow loading this plugin. The warning will disappear after this configuration.

## Quick Start

### 1. Configure AI Provider

Add your AI provider configuration to `.openclaw/openclaw.json`:

**Using OpenAI:**

```json
{
  "plugins": {
    "openclaw-github-trending": {
      "ai": {
        "provider": "openai",
        "api_key": "sk-xxx",
        "model": "gpt-4o-mini"
      }
    }
  }
}
```

**Using Anthropic (Claude):**

```json
{
  "plugins": {
    "openclaw-github-trending": {
      "ai": {
        "provider": "anthropic",
        "api_key": "sk-ant-xxx",
        "model": "claude-3-5-sonnet-20241022"
      }
    }
  }
}
```

**Using OpenAI-compatible providers (e.g., DashScope, Moonshot, DeepSeek):**

```json
{
  "plugins": {
    "openclaw-github-trending": {
      "ai": {
        "provider": "openai",
        "api_key": "sk-xxx",
        "base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1",
        "model": "qwen-max"
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

#### Email

```json
{
  "plugins": {
    "openclaw-github-trending": {
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

#### Option A: Quick Setup with CLI Command (Recommended)

Use the `/setup-trending` command in OpenClaw chat to quickly verify your configuration and get instructions for scheduling:

**Basic usage:**
```
/setup-trending daily 9:00
/setup-trending weekly monday 10:00
/setup-trending monthly 1st 8:00
```

**With specific channels:**
```
/setup-trending daily 9:00 feishu
/setup-trending daily 9:00 email
/setup-trending daily 9:00 feishu,email
```

**What the command does:**
1. Verifies AI configuration and channel settings
2. Fetches trending repositories once to test the configuration
3. Returns statistics and a ready-to-use cron command

**Example output:**
```
✅ Configuration verified!

Period: daily
Channels: feishu
Repositories found: 25
New repositories: 18
Already seen: 7

To schedule this as a recurring job, run:
openclaw cron add --every 1d --at "9:00" --agent <your-agent-id> --system-event '{"tool":"openclaw-github-trending","params":{"since":"daily","channels":["feishu"]}}'
```

**Common scheduling examples:**

| Frequency | Command | Description |
|-----------|---------|-------------|
| Daily | `/setup-trending daily 9:00` | Fetches **today's** trending, suggests daily at 9:00 AM schedule |
| Weekly | `/setup-trending weekly monday 10:00` | Fetches **this week's** trending, suggests weekly on Monday at 10:00 AM schedule |
| Monthly | `/setup-trending monthly 1st 8:00` | Fetches **this month's** trending, suggests monthly on the 1st at 8:00 AM schedule |

**Schedule using OpenClaw cron:**

After running `/setup-trending`, copy the suggested command and modify the `--agent` parameter to your agent ID:

```bash
# Daily at 9:00 AM
openclaw cron add --every 1d --at "9:00" --agent <your-agent-id> --system-event '{"tool":"openclaw-github-trending","params":{"since":"daily","channels":["feishu"]}}'

# Weekly on Monday at 10:00 AM
openclaw cron add --every 7d --at "monday 10:00" --agent <your-agent-id> --system-event '{"tool":"openclaw-github-trending","params":{"since":"weekly","channels":["email"]}}'

# Monthly on the 1st at 8:00 AM
openclaw cron add --every 30d --at "1st 8:00" --agent <your-agent-id> --system-event '{"tool":"openclaw-github-trending","params":{"since":"monthly","channels":["feishu","email"]}}'
```

**Manage scheduled tasks:**
```bash
# List all scheduled tasks
openclaw cron list

# View run history
openclaw cron runs

# Manually trigger a task
openclaw cron run <job-id>

# Delete a task
openclaw cron rm <job-id>

# Edit a task
openclaw cron edit <job-id>
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
- **Anthropic (Claude)**: `provider: "anthropic"`
- **OpenAI-compatible providers**: Any API compatible with OpenAI format (e.g., DashScope, Moonshot, DeepSeek, Kimi, etc.)

**Example with DashScope (Qwen):**

```json
{
  "ai": {
    "provider": "openai",
    "api_key": "sk-xxx",
    "base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1",
    "model": "qwen-max"
  }
}
```

**Example with Moonshot:**

```json
{
  "ai": {
    "provider": "openai",
    "api_key": "sk-xxx",
    "base_url": "https://api.moonshot.cn/v1",
    "model": "moonshot-v1-8k"
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
| `channels` | array | No | Push channels array: `["feishu"]`, `["email"]`, or `["feishu", "email"]` (recommended) |
| `channel` | string | No | Push channel: `"feishu"` or `"email"` (deprecated, use `channels` instead) |
| `email_to` | string | No | Email recipient (overrides config) |
| `feishu_webhook` | string | No | Feishu webhook URL (overrides config) |

**Push Rules:**
- If `channels` parameter is specified in the call, use the specified channels
- If not specified, automatically read from plugin config's `channels` setting
- Configured Feishu → push to Feishu
- Configured Email → push to Email
- Both configured → push to both channels

## Smart Deduplication

The plugin tracks repository history and intelligently decides when to re-push:

- **First Discovery**: Always push new repositories
- **Star Growth**: Re-push if stars increased by `star_threshold` (default: 100)
- **History Tracking**: Records repository details, AI summaries, and push history

## Examples

### Manual Tool Call

```bash
# Via OpenClaw CLI
openclaw tools call openclaw-github-trending --params '{"since": "daily", "channels": ["feishu"]}'

# Via OpenClaw API
curl -X POST http://localhost:3000/api/tools/openclaw-github-trending \
  -H "Content-Type: application/json" \
  -d '{"since": "daily", "channels": ["email"], "email_to": "user@example.com"}'
```

### Setting Up Multiple Scheduled Tasks

Instead of configuring tasks in JSON, use the `openclaw cron add` command to schedule jobs:

```bash
# Daily trending to Feishu at 9:00 AM
openclaw cron add --every 1d --at "9:00" --agent <your-agent-id> \
  --system-event '{"tool":"openclaw-github-trending","params":{"since":"daily","channels":["feishu"]}}' \
  --name "daily-trending-feishu"

# Weekly trending to Email every Monday at 10:00 AM
openclaw cron add --every 7d --at "monday 10:00" --agent <your-agent-id> \
  --system-event '{"tool":"openclaw-github-trending","params":{"since":"weekly","channels":["email"],"email_to":"team@company.com"}}' \
  --name "weekly-trending-email"

# Monthly trending to both channels on the 1st at 8:00 AM
openclaw cron add --every 30d --at "1st 8:00" --agent <your-agent-id> \
  --system-event '{"tool":"openclaw-github-trending","params":{"since":"monthly","channels":["feishu","email"]}}' \
  --name "monthly-trending-both"
```

**View your scheduled jobs:**
```bash
openclaw cron list
```

**Example output:**
```
ID    NAME                       SCHEDULE         NEXT RUN          STATUS
1     daily-trending-feishu      every 1d @ 9:00  2026-03-12 09:00  enabled
2     weekly-trending-email      every 7d @ mon   2026-03-17 10:00  enabled
3     monthly-trending-both      every 30d @ 1st  2026-04-01 08:00  enabled
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
openclaw plugins install openclaw-github-trending
```

## Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) for details.

## License

MIT © [王允](https://github.com/yourusername)

## Support

- 📧 Email: 906971957@qq.com
- 🐛 Issues: [GitHub Issues](https://github.com/yourusername/openclaw-github-trending/issues)
- 💬 Discussions: [GitHub Discussions](https://github.com/yourusername/openclaw-github-trending/discussions)

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for release history.