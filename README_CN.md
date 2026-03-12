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

由于本插件属于非官方捆绑插件，安装后请在 OpenClaw 的配置文件中显式允许加载，否则网关处会出现安全警告。

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

### ⚡ 最小配置

**最低仅需配置一个飞书 Webhook URL 即可运行**，插件会自动继承 OpenClaw 全局配置中的 AI 设置：

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

**最完整配置示例：**

```json
{
  "plugins": {
    "enabled": true,
    "allow": [
      // 配置允许加载本插件，否则网关处在查看状态或者重启的时候总是会报提醒。
      "openclaw-github-trending",
    ],
    "entries": {
      "openclaw-github-trending": {
        "enabled": true,
        "config": {
          // 可选：AI 提供商，不配置会自动调用 openclaw 的全局 AI 配置。
          "ai": {
            "provider": "openai",
            "api_key": "sk-sp-xxx",
            "base_url": "https://coding.dashscope.aliyuncs.com/v1",
            "model": "kimi-k2.5"
          },
          // 可选：最大并发数，默认 5。根据你的 AI 模型情况调整，可以加速对仓库的摘要生成。
          "max_workers": 5,
          //  可选：GitHub 个人访问令牌，频繁调用可能会限制访问，配置后基本上可以避免触发 GitHub 速率限制。不建议配置，因为本身这个插件的调用频率也不高。
          "github_token": "xxx",
          // 必须：配置一个通道（飞书或邮件），否则无法通知到你。
          "channels": {
            "feishu": {
              "webhook_url": "https://open.feishu.cn/open-apis/bot/v2/hook/xxx"
            },
            "email": {
              "smtp_host": "smtp.qq.com",
              "smtp_port": 587,
              "sender": "xxx@qq.com",
              "password": "xxx",
              "recipient": "yyy@qq.com"
            }
          },
          // 可选：开启历史记录功能，用于智能去重
          "history": {
            "enabled": true,
            "star_threshold": 100
          },
          // 可选：如果你的网络能直接访问到 GitHub，就不需要配置改代理了
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

**如何获取飞书 Webhook URL：**

1. **创建飞书机器人：**
   - 创建群组
   - 点击群组设置 → 机器人管理
   - 点击群机器人 → "添加机器人"
   - 选择自定义机器人

2. **配置机器人：**
   - 为机器人命名（例如："GitHub 热榜"）
   - 上传头像（可选）
   - 添加描述
   - 点击"添加"

3. **获取 Webhook URL：**
   - 创建完成后，你会看到一个 webhook URL，格式如下：
     ```
     https://open.feishu.cn/open-apis/bot/v2/hook/YOUR_WEBHOOK_ID
     ```
   - 复制此 URL 并粘贴到配置文件的 `webhook_url` 字段中
   - **⚠️ 安全提示：** 请妥善保管此 URL！任何拥有此 URL 的人都可以向你的机器人发送消息。

4. **测试机器人：**
   - 使用 curl 发送测试消息：
     ```bash
     curl -X POST https://open.feishu.cn/open-apis/bot/v2/hook/YOUR_WEBHOOK_ID \
       -H "Content-Type: application/json" \
       -d '{"msg_type":"text","content":{"text":"测试消息"}}'
     ```
   - 你应该会在飞书聊天中看到这条消息。


### 3. 设置定时任务（推荐）
参数说明：
* 参数一：daily、weekly、monthly代表是每日、每周、每月的热榜. 
* 参数二：后面的时间是执行时间，格式为HH:mm，例如9:00表示9:00 AM，10:30表示10:30 AM。
* 参数三：是通知的渠道，只有你配置了该渠道才可以推送到该渠道上。可以指定多个推送渠道，用逗号隔开。
使用注册的 `/setup-trending` CLI 命令快速设置定时任务。只需在 OpenClaw 聊天中输入命令即可：

```
/setup-trending daily 9:00 feishu
/setup-trending daily 9:00 email
/setup-trending daily 9:00 feishu,email
/setup-trending monthly 8:00 feishu,email
```

**时间格式说明**: 时间使用**北京时间 (CST/UTC+8)**, 所以 `9:00` 表示北京时间上午 9:00。

#### 快速测试（仅执行一次）

如果只想测试一次看看效果，不设置定时任务：

```bash
# 在 OpenClaw 聊天中执行直接粘贴以下指令。
/setup-trending daily now feishu,email

# 或者直接在命令行中执行以下指令，可以在某个时间点去发送。
openclaw cron add --name "测试插件执行" \
  --at "2026-03-12T11:42:00Z" \
  --system-event '{"tool":"openclaw-github-trending","params":{"since":"daily","channels":["feishu", "email"]}}' \
  --wake now \
  --delete-after-run
```

**注意**: `--at` 时间格式为 **UTC**。北京时间需要加 8 小时（例如：北京时间 9:00 AM = UTC 时间 01:00 AM）。

### 管理定时任务

设置定时任务后，可以使用 OpenClaw 的 cron 命令管理它们：

```bash
# 列出所有定时任务
openclaw cron list

# 查看运行历史
openclaw cron runs

# 手动触发任务
openclaw cron run <job-id>

# 删除任务
openclaw cron rm <job-id>
```

## AI 配置项详细说明

插件支持兼容 OpenAI API 的供应商。如果插件中未配置，将使用 OpenClaw 的 AI 配置。

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|-------|------|----------|---------|-------------|
| `provider` | string | 否 | `"openai"` | AI 提供商，支持自定义供应商 |
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
| `recipient` | string | 否 | 同 `sender` | 收件人邮箱地址（如未配置，默认使用发件人地址） |
| `from_name` | string | 否 | `"GitHub Trending"` | 发件人显示名称 |
| `timeout` | number | 否 | `30` | SMTP 连接超时时间（秒） |

*使用该渠道时必填

### 历史记录配置

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|-------|------|----------|---------|-------------|
| `enabled` | boolean | 否 | `true` | 启用历史记录追踪和去重 |
| `star_threshold` | number | 否 | `100` | Star 增长达到此数值时重新推送 |

### 代理配置

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|-------|------|----------|---------|-------------|
| `enabled` | boolean | 否 | `false` | 启用代理访问 GitHub |
| `url` | string | 否 | - | 代理 URL（支持 `http://user:pass@host:port` 或 `https://host:port` 格式） |

**示例：**
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

**带认证的代理：**
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

## 智能去重

插件会追踪仓库历史记录，智能决定何时重新推送：

- **首次发现**：始终推送新发现的仓库
- **Star 增长**：当 Star 增长达到 `star_threshold`（默认 100）时重新推送
- **历史追踪**：记录仓库详情、AI 摘要和推送历史

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

MIT © [王允](https://github.com/wy-ruby)

## 支持

- 📧 邮箱：906971957@qq.com
- 🐛 问题反馈：[GitHub Issues](https://github.com/wy-ruby/openclaw-github-trending/issues)
- 💬 讨论：[GitHub Discussions](https://github.com/wy-ruby/openclaw-github-trending/discussions)

## 更新日志

查看 [CHANGELOG.md](CHANGELOG.md) 了解版本历史。