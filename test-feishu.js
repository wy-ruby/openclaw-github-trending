/**
 * 测试飞书机器人推送
 * Usage: node test-feishu.js
 */

const axios = require('axios');

// 从 .env 文件读取 Webhook URL
require('dotenv').config();

const webhookUrl = process.env.FEISHU_WEBHOOK_URL;

if (!webhookUrl) {
  console.error('❌ 错误：请在 .env 文件中配置 FEISHU_WEBHOOK_URL');
  process.exit(1);
}

console.log('📡 Webhook URL:', webhookUrl);
console.log();

// 测试 1: 简单文本消息
async function testTextMessage() {
  console.log('📝 测试 1: 发送简单文本消息...');

  const message = {
    msg_type: 'text',
    content: {
      text: '你好！这是来自 GitHub Trending 插件的测试消息 🎉'
    }
  };

  try {
    const response = await axios.post(webhookUrl, message);
    console.log('✅ 文本消息发送成功！');
    console.log('   返回:', response.data);
    return true;
  } catch (error) {
    console.error('❌ 文本消息发送失败:', error.message);
    if (error.response) {
      console.error('   响应:', error.response.data);
    }
    return false;
  }
}

// 测试 2: 简单卡片消息
async function testSimpleCard() {
  console.log('\n📊 测试 2: 发送简单卡片消息...');

  const message = {
    msg_type: 'interactive',
    card: {
      config: {
        wide_screen_mode: true
      },
      header: {
        title: {
          tag: 'plain_text',
          content: 'GitHub Trending 测试'
        },
        template: 'blue'
      },
      elements: [
        {
          tag: 'div',
          text: {
            content: '这是一条测试卡片消息，用于验证飞书机器人配置是否正确 ✅',
            tag: 'lark_md'
          }
        }
      ]
    }
  };

  try {
    const response = await axios.post(webhookUrl, message);
    console.log('✅ 卡片消息发送成功！');
    console.log('   返回:', response.data);
    return true;
  } catch (error) {
    console.error('❌ 卡片消息发送失败:', error.message);
    if (error.response) {
      console.error('   响应:', error.response.data);
    }
    return false;
  }
}

// 测试 3: 飞书卡片消息（模拟真实 GitHub Trending）
async function testRichCard() {
  console.log('\n🎨 测试 3: 发送卡片消息（模拟 GitHub Trending）...');

  const message = {
    msg_type: 'interactive',
    card: {
      config: {
        wide_screen_mode: true
      },
      header: {
        title: {
          tag: 'plain_text',
          content: 'GitHub 本周热榜推送'
        },
        template: 'blue'
      },
      elements: [
        {
          tag: 'div',
          text: {
            content: '**🔥 新上榜项目**',
            tag: 'lark_md'
          }
        },
        {
          tag: 'hr'
        },
        {
          tag: 'div',
          text: {
            content: '**1. [facebook/react](https://github.com/facebook/react)**\n★220.5k ⚡45.2k 💻 JavaScript\n\n**🤖 项目介绍：**\nReact 是 Facebook 开发的用于构建用户界面的 JavaScript 库。它采用声明式编程范式，让开发者可以轻松创建交互式 UI。',
            tag: 'lark_md'
          }
        },
        {
          tag: 'hr'
        },
        {
          tag: 'div',
          text: {
            content: '**2. [vercel/next.js](https://github.com/vercel/next.js)**\n★118.3k ⚡25.4k 💻 TypeScript\n\n**🤖 项目介绍：**\nNext.js 是 React 的全栈框架，提供服务端渲染、静态站点生成等功能。',
            tag: 'lark_md'
          }
        },
        {
          tag: 'div',
          text: {
            content: ' ',
            tag: 'lark_md'
          }
        },
        {
          tag: 'div',
          text: {
            content: '**⭐ 持续霸榜项目**',
            tag: 'lark_md'
          }
        },
        {
          tag: 'hr'
        },
        {
          tag: 'div',
          text: {
            content: '**1. [vuejs/vue](https://github.com/vuejs/vue)**\n★206.8k ⚡33.9k 💻 TypeScript\n\n用于构建用户界面的渐进式 JavaScript 框架，核心库只关注视图层。',
            tag: 'lark_md'
          }
        }
      ]
    }
  };

  try {
    const response = await axios.post(webhookUrl, message);
    console.log('✅ 卡片消息发送成功！');
    console.log('   返回:', response.data);
    return true;
  } catch (error) {
    console.error('❌ 卡片消息发送失败:', error.message);
    if (error.response) {
      console.error('   响应:', error.response.data);
    }
    return false;
  }
}

// 运行所有测试
async function runTests() {
  console.log('🚀 开始测试飞书机器人推送...\n');

  const results = [];

  // 测试 1: 文本消息
  results.push(await testTextMessage());

  // 等待 1 秒，避免频率限制
  await new Promise(resolve => setTimeout(resolve, 1000));

  // 测试 2: 简单卡片
  results.push(await testSimpleCard());

  // 等待 1 秒
  await new Promise(resolve => setTimeout(resolve, 1000));

  // 测试 3: 卡片消息
  results.push(await testRichCard());

  // 总结
  console.log('\n' + '='.repeat(50));
  console.log('📊 测试结果：');
  console.log(`   ✅ 成功: ${results.filter(r => r).length}/${results.length}`);
  console.log(`   ❌ 失败: ${results.filter(r => !r).length}/${results.length}`);

  if (results.every(r => r)) {
    console.log('\n🎉 所有测试通过！飞书机器人配置正确！');
  } else {
    console.log('\n⚠️  部分测试失败，请检查：');
    console.log('   1. Webhook URL 是否正确');
    console.log('   2. 机器人是否在群聊中');
    console.log('   3. 网络是否能访问 open.feishu.cn');
    if (results[0] && !results[1]) {
      console.log('   4. 可能是卡片消息格式问题');
    }
  }
}

runTests().catch(console.error);