const { Telegraf, Markup } = require('telegraf');
const googleSheets = require('./googleSheets');
const logger = require('./logger');

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// Initialize Sheets
googleSheets.init().catch(err => {
  logger.error('Sheets initialization failed:', err);
  process.exit(1);
});

// Helper function
function formatTask(task) {
  return `🆔 ${task.id}\n📝 ${task.description}\n💰 Reward: ${task.reward}\n`;
}

// Bot commands
bot.start(async (ctx) => {
  try {
    await ctx.reply(
      `👋 Welcome ${ctx.from.first_name}!`,
      Markup.inlineKeyboard([
        [Markup.button.callback('📋 View Tasks', 'list_tasks')],
        [Markup.button.callback('🎁 Claim Reward', 'claim_reward')],
        [Markup.button.callback('👥 Referral Program', 'referral_info')]
      ])
    );
  } catch (err) {
    logger.error('Start command error:', err);
  }
});

bot.action('list_tasks', async (ctx) => {
  try {
    const tasks = await googleSheets.readTasks();
    
    if (!tasks.length) {
      return ctx.reply('No available tasks at the moment');
    }

    let message = '📋 *Available Tasks*\n\n';
    tasks.forEach(task => {
      message += formatTask(task) + '\n';
    });

    await ctx.reply(message, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        Markup.button.callback('🔄 Refresh', 'list_tasks')
      ])
    });
  } catch (err) {
    logger.error('Tasks error:', err);
    ctx.reply('❌ Error loading tasks');
  }
});

bot.command('claim', async (ctx) => {
  const taskId = ctx.message.text.split(' ')[1];
  
  if (!taskId) {
    return ctx.replyWithMarkdown('Usage: `/claim <task_id>`\nExample: `/claim TASK_123`');
  }

  try {
    const result = await googleSheets.claimTask(ctx.from.id, taskId);
    await ctx.reply(result.message);
    
    // Notify admin if configured
    if (process.env.ADMIN_CHAT_ID) {
      await bot.telegram.sendMessage(
        process.env.ADMIN_CHAT_ID,
        `New claim:\n👤 User: ${ctx.from.id}\n📌 Task: ${taskId}`
      );
    }
  } catch (err) {
    logger.error('Claim error:', err);
    ctx.reply(`❌ Error: ${err.message}`);
  }
});

// Error handling
bot.catch((err, ctx) => {
  logger.error(`Bot error: ${err}`, ctx.update);
  ctx.reply('⚠️ An error occurred. Please try again.');
});

module.exports = {
  bot,
  webhookCallback: bot.webhookCallback(`/webhook/${process.env.TELEGRAM_BOT_TOKEN}`)
};