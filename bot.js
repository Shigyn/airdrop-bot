const { Telegraf } = require('telegraf');
const googleSheets = require('./googleSheets');
const logger = require('./logger');

// Configuration du webhook
const webhookPath = `/webhook/${process.env.TELEGRAM_BOT_TOKEN}`;
const webhookUrl = `https://airdrop-bot-soy1.onrender.com${webhookPath}`;

// Créer le bot en mode webhook
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN, {
  telegram: {
    webhook: {
      port: process.env.PORT || 10000,
      domain: 'airdrop-bot-soy1.onrender.com',
      hookPath: webhookPath
    }
  }
});

googleSheets.initGoogleSheets().catch(err => {
  logger.error('Sheets initialization failed:', err);
  process.exit(1);
});

// Gestion des commandes
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

// Configuration du webhook
bot.telegram.setWebhook(webhookUrl)
  .then(() => {
    logger.info('Webhook configured successfully');
  })
  .catch(err => {
    logger.error('Webhook configuration failed:', err);
    process.exit(1);
  });

// Démarrage du bot
bot.startWebhook(webhookPath, null, process.env.PORT || 10000);

module.exports = {
  bot,
  webhookCallback: bot.webhookCallback(webhookPath)
};
