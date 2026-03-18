# OpenClaw GitHub Trending 插件

[![npm version](https://badge.fury.io/js/openclaw-github-trending.svg)](https://badge.fury.io/js/openclaw-github-trending)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

[English](./README.md) | 简体中文

OpenClaw 插件，用于获取 GitHub 趋势仓库并通过 AI 生成的摘要推送到飞书或邮件。

## 功能特性

- 🔥 **GitHub 热榜** — 获取今日、本周或本月热榜项目
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


### 3. 设置定时任务或立即执行

使用注册的 `gen-cron` CLI 命令快速设置定时任务或立即执行。在你能使用 `openclaw` 命令的那个**命令行中**中直接执行以下命令：

```
# 立即执行：获取今日热榜并推送到飞书和邮箱
openclaw gen-cron now daily email,feishu

# 创建定时任务：每周三 10:00 获取本周热榜并推送到飞书
openclaw gen-cron "0 10 * * 3" weekly feishu

# 创建定时任务：每月 1 号 9:00 获取本月热榜并推送到邮箱和飞书
openclaw gen-cron "0 9 1 * *" monthly email,feishu

# 创建定时任务：每天早上 8:00 获取今日热榜并推送到邮箱
openclaw gen-cron "0 8 * * *" daily email
```

**命令参数说明：**

```
openclaw gen-cron <mode> <since> <channels>
```

| 参数 | 说明 | 示例 |
|------|------|------|
| `mode` | 执行模式：`now` 表示立即执行，或 Cron 表达式（格式：分 时 日 月 周） | `now` <br> `"0 10 * * 3"` |
| `since` | 热榜周期：`daily`（今日）、`weekly`（本周）、`monthly`（本月） | `daily` |
| `channels` | 推送渠道：`email`、`feishu` 或 `email,feishu`（多个渠道用逗号分隔） | `email,feishu` |

**Cron 表达式格式：**
- 格式：`分(0-59) 时(0-23) 日(1-31) 月(1-12) 周(0-7, 0和7都是周日)`
- 时区：**使用服务器本地时间**（通常为系统时间）

**常用 Cron 示例：**
- `"0 8 * * *"` - 每天 8:00
- `"0 10 * * 3"` - 每周三 10:00
- `"0 9 1 * *"` - 每月 1 号 9:00

> ⚠️ **注意**：`gen-cron` 命令**必须在命令行中执行**，不能在 OpenClaw 聊天界面中使用。
>
> - **命令行**：直接在终端执行 `openclaw gen-cron ...`
> - **OpenClaw 聊天**：如需在聊天中执行，需要使用完整的 `openclaw cron add` 命令（见下方）

#### 在 OpenClaw 聊天中设置任务

如果想在 OpenClaw 聊天界面中设置任务，使用完整的 `cron add` 命令：

```bash
# 在 OpenClaw 聊天中粘贴以下命令（需要先转义引号）

# 每周三 10:00 获取本周热榜并推送到飞书和邮箱
openclaw cron add --name "GitHub 热榜 每周 飞书+邮箱" \
  --cron "0 10 * * 3" \
  --system-event '{"tool":"openclaw-github-trending","params":{"since":"weekly","channels":["feishu","email"]}}'
```

#### 🗣️ 自然语言创建任务

**通过与 OpenClaw 自然对话快速创建定时任务**，无需记忆复杂的命令格式。插件支持智能解析自然语言指令，自动生成并执行定时任务。

**使用方法：**

直接在 OpenClaw 聊天界面中用自然语言描述需求：

```
使用openclaw-github-trending工具，帮我创建一个每天 18:45 推送 GitHub 月榜到邮箱的定时任务
```

**支持的自然语言示例：**

```text
// 每日推送
- "使用openclaw-github-trending工具，帮我创建每天早上 8:00 推送 GitHub 今日热榜到邮箱的任务"
- "我想使用openclaw-github-trending工具，在每天 18:45 收到 GitHub 今日热榜，并把内容发送到我的邮箱"
- "使用openclaw-github-trending工具创建定时任务：每天 9:00 获取今日热榜并推送到飞书"

// 每周推送
- "使用openclaw-github-trending工具，帮我创建每周一 10:00 推送 GitHub 本周热榜到飞书的任务"
- "我想使用openclaw-github-trending工具，每周五 18:00 收到本周热榜，发到飞书和邮箱"
- "使用openclaw-github-trending工具，每周三早上 9:00 获取本周热榜并推送到飞书"

// 每月推送
- "使用openclaw-github-trending工具，帮我创建每月 1 号 9:00 推送 GitHub 月榜到邮箱的任务"
- "我想使用openclaw-github-trending工具，每月 15 号 18:45 收到 GitHub 月榜，发到我的邮箱"
- "使用openclaw-github-trending工具，帮我创建一个每天 18:45，推送每月 GitHub 热榜的定时任务，需要将 GitHub 热榜内容发送到我的邮箱中"

// 多渠道推送
- "使用openclaw-github-trending工具，帮我创建每天 8:00 推送今日热榜到飞书和邮箱的任务"
- "我想使用openclaw-github-trending工具，每天 10:00 收到热榜，同时发到飞书和我的邮箱" 
```

**智能解析能力：**

✅ **时间识别**：自动解析"每天 8:00"、"每周一 10:00"、"每月 1 号 9:00"等时间表达
✅ **周期识别**：自动识别"今日/每天"→`daily`、"本周/每周"→`weekly`、"月榜/每月"→`monthly`
✅ **渠道识别**：自动识别"邮箱"→`email`、"飞书"→`feishu`、"飞书和邮箱"→`["feishu","email"]`
✅ **任务创建**：自动生成合适的 Cron 表达式并创建定时任务

**执行流程：**

1. 用户在 OpenClaw 聊天中输入自然语言指令，需要携带 `openclaw-github-trending` 工具名称
2. OpenClaw 解析指令并识别工具（`openclaw-github-trending`）
3. 自动提取时间、周期、推送渠道等参数
4. 生成对应的 `cron add` 命令并创建任务
5. 返回任务创建成功信息，包括任务 ID 和执行时间

**优势：**

✨ **简单易用**：无需记忆命令格式，像聊天一样创建任务
✨ **灵活表达**：支持多种自然语言表达方式
✨ **智能识别**：自动解析时间、周期和推送渠道
✨ **快速配置**：一句话完成复杂的定时任务配置

### 查看命令帮助

运行命令时如果不带参数或参数错误，会自动显示详细的帮助信息：

```bash
openclaw gen-cron -h
```

输出将包含：
- 命令用法
- 参数说明
- 使用示例
- Cron 表达式格式说明

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