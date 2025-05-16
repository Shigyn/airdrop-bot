const { Telegraf, Markup } = require('telegraf');
const googleSheets = require('./googleSheets');
const logger = require('./logger');

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// Initialize Sheets
googleSheets.initGoogleSheets().catch(err => {
  logger.error('Sheets initialization failed:', err);
  process.exit(1);
});

// Bot commands
bot.start(async (ctx) => {
  try {
    await ctx.reply(
      `👋 Bienvenue ${ctx.from.first_name} !\n\nVoici le menu de l'application :`,
      Markup.inlineKeyboard([
        [Markup.button.webApp('▶️ Start app', 'https://your-webapp-url.com')], // ← à modifier
        [Markup.button.url('📣 Canal de l’app', 'ton_url_groupe_tg')],
        [Markup.button.callback('🔗 Referral link', 'get_referral')]
      ])
    );
  } catch (err) {
    logger.error('Start command error:', err);
  }
});

bot.action('get_referral', async (ctx) => {
  try {
    const userId = ctx.from.id;
    const referralLink = `https://t.me/${ctx.me}?start=${userId}`;

    await ctx.reply(`🔗 *Voici ton lien de parrainage :*\n${referralLink}`, {
      parse_mode: 'Markdown'
    });
  } catch (err) {
    logger.error('Referral link error:', err);
    ctx.reply('❌ Erreur lors de la génération du lien de parrainage.');
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