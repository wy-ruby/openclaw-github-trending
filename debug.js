/**
 * Debug script for local testing
 * Usage: node debug.js [since] [channel]
 * Example: node debug.js daily feishu
 */

const path = require('path');
const fs = require('fs');

// Load environment variables
try {
  require('dotenv').config();
} catch (e) {
  // dotenv not installed, continue
}

// Import compiled plugin
const pluginPath = path.join(__dirname, 'dist', 'index.js');
const pluginModule = require(pluginPath);
const plugin = pluginModule.default || pluginModule;

// Mock OpenClaw API
const mockApi = {
  tool: null,
  registerTool(tool) {
    this.tool = tool;
    console.log('✅ Tool registered:', tool.name);
  },
  getLogger() {
    return {
      info: (...args) => console.log('ℹ️ ', new Date().toISOString(), ...args),
      error: (...args) => console.error('❌', new Date().toISOString(), ...args),
      warn: (...args) => console.warn('⚠️ ', new Date().toISOString(), ...args)
    };
  }
};

// Real file-based storage for debugging
const historyFile = path.join(__dirname, '.debug-history.json');
const mockStorage = {
  data: {},
  async get(key) {
    try {
      if (fs.existsSync(historyFile)) {
        this.data = JSON.parse(fs.readFileSync(historyFile, 'utf-8'));
      }
      return this.data[key];
    } catch (error) {
      return undefined;
    }
  },
  async set(key, value) {
    this.data[key] = value;
    fs.writeFileSync(historyFile, JSON.stringify(this.data, null, 2));
    console.log(`💾 Saved to ${historyFile}`);
  }
};

// Register plugin
console.log('\n🔧 Loading plugin...\n');
plugin(mockApi);

// Build config from environment
const config = {
  ai: {
    provider: process.env.AI_PROVIDER || 'openai',
    api_key: process.env.API_KEY || process.env.OPENAI_API_KEY,
    base_url: process.env.BASE_URL,
    model: process.env.MODEL_NAME || 'gpt-4o-mini'
  },
  github_token: process.env.GITHUB_TOKEN,
  max_workers: parseInt(process.env.MAX_WORKERS || '5'),
  channels: {},
  history: {
    enabled: process.env.HISTORY_ENABLED !== 'false',
    star_threshold: parseInt(process.env.STAR_THRESHOLD || '100')
  }
};

// Add Feishu channel
if (process.env.FEISHU_WEBHOOK_URL) {
  config.channels.feishu = {
    webhook_url: process.env.FEISHU_WEBHOOK_URL
  };
}

// Add Email channel
if (process.env.EMAIL_SENDER && process.env.EMAIL_PASSWORD) {
  config.channels.email = {
    smtp_host: process.env.EMAIL_SMTP_HOST || 'smtp.gmail.com',
    smtp_port: parseInt(process.env.EMAIL_SMTP_PORT || '587'),
    use_tls: process.env.EMAIL_USE_TLS !== 'false',
    sender: process.env.EMAIL_SENDER,
    password: process.env.EMAIL_PASSWORD,
    from_name: process.env.EMAIL_FROM_NAME || 'GitHub Trending',
    timeout: parseInt(process.env.EMAIL_TIMEOUT || '30')
  };
}

console.log('📋 Configuration:');
console.log('  AI Provider:', config.ai.provider);
console.log('  AI Model:', config.ai.model);
console.log('  Base URL:', config.ai.base_url || 'default');
console.log('  GitHub Token:', config.github_token ? '✅' : '❌');
console.log('  Max Workers:', config.max_workers);
console.log('  Feishu:', config.channels.feishu ? '✅' : '❌');

if (config.channels.email) {
  console.log('  Email:');
  console.log('    SMTP Host:', config.channels.email.smtp_host);
  console.log('    SMTP Port:', config.channels.email.smtp_port);
  console.log('    Use TLS:', config.channels.email.use_tls);
  console.log('    Sender:', config.channels.email.sender);
  console.log('    Password:', config.channels.email.password ? '✅ (configured)' : '❌ (missing)');
  console.log('    From Name:', config.channels.email.from_name);
} else {
  console.log('  Email: ❌ (not configured)');
}

console.log();

// Parse command line args
const since = process.argv[2] || 'daily';
const channel = process.argv[3] || 'email';

// Validate channel
if (!config.channels.feishu && !config.channels.email) {
  console.error('❌ Error: No push channel configured!');
  console.log('\nPlease configure either FEISHU_WEBHOOK_URL or EMAIL_SENDER+EMAIL_PASSWORD in .env file');
  process.exit(1);
}

if (channel === 'email' && !config.channels.email) {
  console.error('❌ Error: Email channel selected but not configured!');
  console.log('\nPlease configure EMAIL_SENDER and EMAIL_PASSWORD in .env file');
  process.exit(1);
}

const params = {
  since,
  channel,
  email_to: process.env.EMAIL_TO || config.channels.email?.sender,
  feishu_webhook: process.env.FEISHU_WEBHOOK_URL
};

// Show detailed configuration
console.log('🚀 Execution Configuration:');
console.log('  Period:', since);
console.log('  Channel:', channel);

if (channel === 'email') {
  console.log('\n📧 Email Details:');
  console.log('  Sender (EMAIL_SENDER):', config.channels.email.sender);
  console.log('  Recipient (EMAIL_TO env):', process.env.EMAIL_TO || '(not set)');
  console.log('  Final Recipient:', params.email_to);
  console.log('  Subject:', `GitHub Trending ${since === 'daily' ? 'Daily' : since === 'weekly' ? 'Weekly' : 'Monthly'}`);

  if (!process.env.EMAIL_TO) {
    console.log('\n⚠️  WARNING: EMAIL_TO is not configured!');
    console.log('  Email will be sent to sender:', config.channels.email.sender);
    console.log('  To send to a different recipient, add to .env:');
    console.log('    EMAIL_TO=recipient@example.com');
  }
}

console.log();

// Execute
const context = {
  config,
  logger: mockApi.getLogger(),
  storage: mockStorage
};

mockApi.tool.execute(params, context)
  .then(result => {
    console.log('\n✅ Execution completed!\n');
    const data = JSON.parse(result.content[0].text);
    console.log(JSON.stringify(data, null, 2));

    if (result.isError) {
      console.log('\n⚠️  Completed with errors');
      process.exit(1);
    }

    console.log('\n🎉 Success!');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Execution failed:');
    console.error(error);
    process.exit(1);
  });