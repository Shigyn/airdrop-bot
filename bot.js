const { Telegraf, Markup } = require('telegraf');
const googleSheets = require('./googleSheets');
const logger = require('./logger');

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

googleSheets.initGoogleSheets().catch(err => {
  logger.error('Sheets initialization failed:', err);
  process.exit(1);
});

bot.start(async (ctx) => {
  try {
    await ctx.reply(
      'Bienvenue ' + ctx.from.first_name + " !\n\nVoici le menu de l'application :",
      Markup.inlineKeyboard([
        [Markup.button.webApp('▶️ Start app', 'https://airdrop-bot-soy1.onrender.com')],
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
    const referralLink = `https://t.me/CRYPTORATS_bot?start=${userId}`;

    await ctx.reply(
      `🔗 <b>Voici ton lien de parrainage :</b>\n${referralLink}`,
      { parse_mode: 'HTML' }
    );
  } catch (err) {
    logger.error('Referral link error:', err);
  }
});

bot.on('message', async (ctx) => {
  // Ici tu peux gérer d'autres commandes si besoin
});

const webhookCallback = bot.webhookCallback(`/webhook/${process.env.TELEGRAM_BOT_TOKEN}`);

module.exports = {
  bot,
  webhookCallback,
};
