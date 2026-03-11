# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an OpenClaw plugin for fetching GitHub trending repositories and pushing them to Feishu or Email with AI-powered summaries. It integrates with the OpenClaw framework as a tool that can be called via CLI, API, or scheduled tasks.

## Development Commands

```bash
# Build TypeScript to dist/
npm run build

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run a single test file
npx jest tests/core/fetcher.test.ts
```

## Architecture Overview

### Plugin Integration
- Entry point: `src/index.ts` - exports a function that receives the OpenClaw API and registers a tool
- Tool registration uses Zod schema for parameter validation
- Context includes: `config` (PluginConfig), `logger`, and `storage` (for persistence)
- Build output: `dist/` directory (CommonJS modules)

### Core Flow
1. **Fetch**: `GitHubFetcher` scrapes GitHub trending page and README files
2. **Deduplicate**: `HistoryManager` checks if repos were seen before and decides if they should be re-pushed (based on star growth threshold)
3. **Summarize**: `AISummarizer` generates Chinese summaries using OpenAI-compatible APIs (fetches README first, falls back to metadata)
4. **Push**: Send to channels (Feishu webhook or Email SMTP)

### Key Components

**Fetcher** (`src/core/fetcher.ts`):
- Uses axios + cheerio to parse GitHub trending HTML
- Handles multiple README file names and branches (main/master)
- Parses star counts with "k" suffix support (e.g., "1.2k" → 1200)

**Summarizer** (`src/core/summarizer.ts`):
- Uses OpenAI SDK (compatible with custom providers via `base_url`)
- Prefers README-based summaries over metadata-only summaries
- Generates 200-300 character Chinese summaries with temperature=0.7

**History Manager** (`src/core/history.ts`):
- Tracks: first_seen, last_seen, last_stars, push_count, ai_summary
- Deduplication logic: re-push if stars grew by `star_threshold` (default: 100)
- Persists via OpenClaw's `storage.get/set` with key 'github-trending-history'

**Channels**:
- Feishu: webhook-based push with formatted cards
- Email: SMTP-based with HTML templates
- Supports multi-channel push (can send to both simultaneously)

### Multi-Channel Architecture
The tool supports pushing to multiple channels in a single execution:
```typescript
channels: ['feishu', 'email']  // New recommended approach
channel: 'feishu'               // Deprecated single-channel
```

Each channel operates independently with its own success/failure status.

### Concurrency Control
AI summarization uses batch processing with configurable `max_workers` (default: 5):
- Processes repos in batches using `Promise.allSettled`
- Gracefully handles failures (continues with empty summary)
- Logs each README fetch and summary generation

### Configuration Hierarchy
1. Plugin config (from `.openclaw/openclaw.json`)
2. Tool parameters (runtime overrides)
3. Environment variables (`.env` file for local testing)

Configuration resolution: `ConfigManager.getAIConfig()` merges plugin config with global OpenClaw AI config.

## Testing

- Framework: Jest with ts-jest preset
- Test location: `tests/` directory (mirrors `src/` structure)
- Mocks: `__mocks__/marked.ts` for markdown processing
- Fixtures: `tests/fixtures/` contains HTML snapshots for parsing tests

When testing components that use:
- External APIs: Mock axios/OpenAI responses
- Storage: Provide mock `storage.get/set` functions
- Logger: Use mock logger with `info`, `error`, `warn` methods

## Important Patterns

### Error Handling
- Never throw in batch operations - use `Promise.allSettled` and continue on errors
- Log warnings for non-critical failures (e.g., summary generation failed)
- Return structured results with `success` boolean and error details

### Backward Compatibility
- Support deprecated `channel` parameter alongside new `channels` array
- Handle both old and new GitHub HTML formats (e.g., stargazers link vs aria-label)
- Fallback chain: README → metadata → empty string

### Repository Model
```typescript
interface RepositoryInfo {
  name: string;           // repo name only
  full_name: string;      // owner/repo
  url: string;
  stars: number;
  description: string;
  language?: string;
  forks?: number;
  ai_summary?: string;    // added after summarization
}
```

## OpenClaw Integration Notes

- Plugin ID: `github-trending` (defined in `openclaw.plugin.json`)
- Config schema: JSON Schema for validation in OpenClaw UI
- Storage key: `github-trending-history` for persistence
- Peer dependency: `openclaw >= 2026.1.15`

When modifying config schema:
1. Update `openclaw.plugin.json` configSchema
2. Update `src/models/config.ts` TypeScript interfaces
3. Update README.md configuration tables

## Common Modifications

### Adding a New Channel
1. Create channel file in `src/channels/` (e.g., `slack.ts`)
2. Implement `push()` or `send()` method returning `PushResult`
3. Add config interface to `src/models/config.ts`
4. Update `src/index.ts` to handle the new channel
5. Update `openclaw.plugin.json` configSchema
6. Add tests in `tests/channels/`

### Modifying AI Prompts
- Summary prompts are in `AISummarizer.buildPrompt()` and `summarizeReadme()`
- System prompt defines the persona: "专业的技术文档撰写者"
- Target output: 200-300 Chinese characters
- Temperature: 0.7 (balance between consistency and creativity)

### Changing Deduplication Logic
Modify `HistoryManager.shouldPushAgain()`:
- Current: re-push if `stars - last_stars >= star_threshold`
- Alternative strategies: time-based, language-based, etc.

## Debugging

For local testing with real APIs:
```bash
# Copy .env.example to .env and fill in credentials
cp .env.example .env

# Run debug scripts (if available)
node debug.js
node test-feishu.js
```

Note: `.env` file is for local development only. In production, configure via OpenClaw's `.openclaw/openclaw.json`.