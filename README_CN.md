# OpenClaw GitHub Trending 插件

[![npm version](https://badge.fury.io/js/openclaw-github-trending.svg)](https://badge.fury.io/js/openclaw-github-trending)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

[English](./README.md) | 简体中文

OpenClaw 插件，用于获取 GitHub 趋势仓库并通过 AI 生成的摘要推送到飞书或邮件。

## 功能特性

- 🔥 **GitHub 热榜** — 获取每日（今日）、每周（本周）或每月（本月）热榜项目
- 🤖 **AI 摘要** — 使用 OpenAI 或 Anthropic 生成智能摘要
- 📢 **多渠道推送** — 支持飞书和邮件通知
- 🔄 **智能去重** — 追踪仓库历史，在 Star 大幅增长时重新推送
- ⏰ **定时任务** — 与 OpenClaw 任务调度器集成，实现自动化更新

## 安装

```bash
openclaw plugins install openclaw-github-trending
```

### ⚠️ 安全提示 - 允许非捆绑插件

由于本插件属于非官方捆绑插件，安装后请在 OpenClaw 的配置文件中显式允许加载，否则会出现安全警告。

1. 打开 OpenClaw 配置文件（通常位于 `~/.openclaw/openclaw.json`）。

2. 在 `plugins.allow` 列表中添加本插件的 ID：

```json
{
  "plugins": {
    "allow": [
      "openclaw-github-trending"
    ]
  }
}
```

此配置告诉 OpenClaw 信任并允许加载此插件。配置完成后，安全警告将消失。

## 快速开始

### 1. 配置 AI 提供商

在 `.openclaw/openclaw.json` 中添加 AI 配置：

**使用 OpenAI：**

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

**使用自定义供应商（如百炼、月之暗面等）：**

```json
{
  "plugins": {
    "openclaw-github-trending": {
      "ai": {
        "provider": "bailian",
        "api_key": "sk-xxx",
        "base_url": "https://coding.dashscope.aliyuncs.com/v1",
        "model": "qwen3.5-plus"
      },
      "max_workers": 5,
      "github_token": "github_pat_xxx"
    }
  }
}
```

### 2. 配置推送渠道

#### 飞书

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

#### 邮件

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

### 3. 设置定时任务

#### 方式 A：使用命令快速配置（推荐）

在 OpenClaw 对话中使用 `/setup-trending` 命令快速配置定时任务：

**示例：每天 9 点推送今日热榜**
```
/setup-trending daily 9:00
```

这将输出一个可直接使用的命令：
```bash
openclaw cron add --name "github-trending-daily" --cron "00 09 * * *" --message "Please fetch GitHub today's trending repositories using the github-trending tool with since='daily' parameter"
```

**常用示例：**
- `/setup-trending daily 9:00` — 每天早上 9 点（获取**今日**热榜）
- `/setup-trending weekly 10:30` — 每周一早上 10:30（获取**本周**热榜）
- `/setup-trending monthly 8:00` — 每月 1 号早上 8 点（获取**本月**热榜）

**工作原理：**
1. 命令根据频率自动生成 cron 表达式
2. 复制并执行输出的命令
3. 工具读取你配置的通道并推送
4. 配置了飞书 → 推送到飞书
5. 配置了邮箱 → 推送到邮箱
6. 都配置了 → 同时推送到两个通道

**管理定时任务：**
```bash
# 查看所有定时任务
openclaw cron list

# 查看运行历史
openclaw cron runs

# 手动触发任务
openclaw cron run <job-id>

# 删除任务
openclaw cron rm <job-id>
```

#### 方式 B：手动配置

在 `.openclaw/openclaw.json` 中定义自动化任务：

```json
{
  "tasks": [
    {
      "name": "每日趋势推送到飞书",
      "schedule": "0 9 * * *",
      "tool": "openclaw-github-trending",
      "params": {
        "since": "daily",
        "channels": ["feishu"]
      }
    },
    {
      "name": "每周趋势推送到邮件",
      "schedule": "0 10 * * 1",
      "tool": "openclaw-github-trending",
      "params": {
        "since": "weekly",
        "channels": ["email"],
        "email_to": "team@example.com"
      }
    }
  ]
}
```

## 配置说明

### AI 配置

插件支持兼容 OpenAI API 的供应商。如果插件中未配置，将使用 OpenClaw 的 AI 配置。

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|-------|------|----------|---------|-------------|
| `provider` | string | 否 | `"openai"` | AI 提供商（`"openai"` 或 `"anthropic"`） |
| `api_key` | string | 否* | - | AI 提供商的 API Key |
| `base_url` | string | 否 | `"https://api.openai.com/v1"` | API 基础 URL（用于兼容 OpenAI 的供应商） |
| `model` | string | 否 | `"gpt-4o-mini"` | 用于生成摘要的模型名称 |

**如果未提供，将使用 OpenClaw 的默认 AI 配置**

#### 支持的 AI 供应商

- **OpenAI**: `provider: "openai"`，使用默认 base URL
- **Anthropic**: `provider: "anthropic"`
- **自定义供应商**: 任何兼容 OpenAI API 的服务（如：灵积、月之暗面、DeepSeek 等）

**自定义供应商示例：**

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

### GitHub 配置

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|-------|------|----------|---------|-------------|
| `github_token` | string | 否 | - | GitHub 个人访问令牌（提高速率限制） |

**为什么要配置 GitHub Token？**
- 无 Token: 60 次/小时限制
- 有 Token: 5000 次/小时限制
- 获取 Token: https://github.com/settings/tokens

### 并发配置

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|-------|------|----------|---------|-------------|
| `max_workers` | number | 否 | `5` | AI 摘要并发数（建议：3-10） |

### 推送渠道配置

#### 飞书

| 字段 | 类型 | 必填 | 说明 |
|-------|------|----------|-------------|
| `webhook_url` | string | 是* | 飞书机器人 Webhook URL |

#### 邮件

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|-------|------|----------|---------|-------------|
| `smtp_host` | string | 否 | `"smtp.gmail.com"` | SMTP 服务器地址 |
| `smtp_port` | number | 否 | `587` | SMTP 服务器端口 |
| `use_tls` | boolean | 否 | `true` | 使用 TLS/STARTTLS |
| `sender` | string | 是* | - | 发件人邮箱地址 |
| `password` | string | 是* | - | 邮箱密码或应用专用密码 |
| `from_name` | string | 否 | `"GitHub Trending"` | 发件人显示名称 |
| `timeout` | number | 否 | `30` | SMTP 连接超时时间（秒） |

*使用该渠道时必填

### 历史记录配置

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|-------|------|----------|---------|-------------|
| `enabled` | boolean | 否 | `true` | 启用历史记录追踪和去重 |
| `star_threshold` | number | 否 | `100` | Star 增长达到此数值时重新推送 |

## 工具参数

`github-trending` 工具支持以下参数：

| 参数 | 类型 | 必填 | 说明 |
|-----------|------|----------|-------------|
| `since` | string | 是 | 时间周期：`"daily"`、`"weekly"` 或 `"monthly"` |
| `channels` | array | 否 | 推送渠道数组：`["feishu"]`、`["email"]` 或 `["feishu", "email"]`（推荐） |
| `channel` | string | 否 | 推送渠道：`"feishu"` 或 `"email"`（已废弃，建议使用 `channels`） |
| `email_to` | string | 否 | 邮件收件人（覆盖配置文件） |
| `feishu_webhook` | string | 否 | 飞书 Webhook URL（覆盖配置文件） |

**推送规则：**
- 如果调用时指定了 `channels` 参数，使用指定的通道
- 如果未指定，自动从插件配置中读取 `channels` 配置
- 配置了飞书 → 推送到飞书
- 配置了邮箱 → 推送到邮箱
- 都配置了 → 同时推送

## 智能去重

插件会追踪仓库历史记录，智能决定何时重新推送：

- **首次发现**：始终推送新发现的仓库
- **Star 增长**：当 Star 增长达到 `star_threshold`（默认 100）时重新推送
- **历史追踪**：记录仓库详情、AI 摘要和推送历史

## 使用示例

### 手动调用工具

```bash
# 通过 OpenClaw CLI
openclaw tools call openclaw-github-trending --params '{"since": "daily", "channels": ["feishu"]}'

# 通过 OpenClaw API
curl -X POST http://localhost:3000/api/tools/openclaw-github-trending \
  -H "Content-Type: application/json" \
  -d '{"since": "daily", "channels": ["email"], "email_to": "user@example.com"}'
```

### 多个定时任务

```json
{
  "tasks": [
    {
      "name": "早间每日趋势",
      "schedule": "0 9 * * *",
      "tool": "openclaw-github-trending",
      "params": {
        "since": "daily",
        "channels": ["feishu"]
      }
    },
    {
      "name": "每周报告",
      "schedule": "0 10 * * 1",
      "tool": "openclaw-github-trending",
      "params": {
        "since": "weekly",
        "channels": ["email"],
        "email_to": "team@company.com"
      }
    },
    {
      "name": "每月精选",
      "schedule": "0 10 1 * *",
      "tool": "openclaw-github-trending",
      "params": {
        "since": "monthly",
        "channels": ["email"],
        "email_to": "management@company.com"
      }
    }
  ]
}
```

## 安全最佳实践

### API Keys

- 将 API Keys 存储在 `.openclaw/openclaw.json` 中（而非环境变量）
- 使用应用专用密码（如 Gmail 应用密码）
- 限制 API Key 权限到最小必需范围

### 邮件配置

对于 Gmail：
1. 启用两步验证
2. 生成应用专用密码：https://myaccount.google.com/apppasswords
3. 在 `password` 字段中使用应用专用密码

### 飞书 Webhook

- 保持 Webhook URL 私密
- 定期轮换 Webhook URL
- 如果可用，使用 IP 白名单

## 故障排查

### "AI API key is required"

确保在 `.openclaw/openclaw.json` 中配置了 `ai.api_key`。

### "Feishu webhook URL is required"

在配置中提供 `channels.feishu.webhook_url` 或传递 `feishu_webhook` 参数。

### "Email recipient is required"

在配置中提供 `channels.email.sender` 或传递 `email_to` 参数。

### AI 摘要生成失败

- 检查 API Key 有效性
- 验证模型可用性
- 检查 API 速率限制

## 开发

### 构建

```bash
npm run build
```

### 测试

```bash
npm test
npm run test:coverage
```

### 本地开发

```bash
# 链接到本地 OpenClaw
npm link

# 在 OpenClaw 项目中
openclaw plugins install openclaw-github-trending
```

## 贡献

欢迎贡献！请阅读[贡献指南](CONTRIBUTING.md)了解详情。

## 许可证

MIT © [王允](https://github.com/yourusername)

## 支持

- 📧 邮箱：906971957@qq.com
- 🐛 问题反馈：[GitHub Issues](https://github.com/yourusername/openclaw-github-trending/issues)
- 💬 讨论：[GitHub Discussions](https://github.com/yourusername/openclaw-github-trending/discussions)

## 更新日志

查看 [CHANGELOG.md](CHANGELOG.md) 了解版本历史。