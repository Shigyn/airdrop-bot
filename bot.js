const { Telegraf } = require('telegraf');
const googleSheets = require('./googleSheets');
const logger = require('./logger');

// Configuration du webhook
const webhookPath = `/webhook/${process.env.TELEGRAM_BOT_TOKEN}`;
const webhookUrl = `https://airdrop-bot-soy1.onrender.com${webhookPath}`;

// Créer le bot en mode webhook
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN, {
  webhook: {
    domain: 'https://airdrop-bot-soy1.onrender.com',
    port: 8080
  }
});

// Initialiser les services
async function initializeServices() {
  try {
    await googleSheets.initGoogleSheets();
    logger.info('Google Sheets initialized successfully');
    
    // Configuration du webhook avec gestion des erreurs
    let webhookConfigured = false;
    const maxRetries = 3;
    let retryCount = 0;
    
    while (!webhookConfigured && retryCount < maxRetries) {
      try {
        await bot.telegram.setWebhook(webhookUrl);
        webhookConfigured = true;
        logger.info(`Webhook configured successfully at ${webhookUrl}`);
      } catch (error) {
        if (error.response?.error_code === 429) {
          const retryAfter = error.response.parameters?.retry_after || 1;
          logger.info(`Rate limited. Retrying in ${retryAfter} seconds...`);
          await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
          retryCount++;
        } else if (error.response?.error_code === 409) {
          logger.info('Conflict detected. Removing existing webhook...');
          await bot.telegram.deleteWebhook();
          await new Promise(resolve => setTimeout(resolve, 1000));
        } else {
          throw error;
        }
      }
    }

    if (!webhookConfigured) {
      throw new Error('Failed to configure webhook after multiple retries');
    }

    // Démarrer le bot en mode webhook
    await new Promise(resolve => setTimeout(resolve, 1000)); // Délai pour éviter les conflits
    bot.startWebhook(webhookPath);
    logger.info('Bot started successfully in webhook mode');
    
  } catch (err) {
    logger.error('Failed to initialize services:', err);
    process.exit(1);
  }
}

// Démarrer une seule fois
initializeServices();

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

// Exporter le callback du webhook pour l'application
module.exports = {
  bot,
  webhookCallback: bot.webhookCallback(webhookPath)
};

module.exports = {
  bot,
  webhookCallback: bot.webhookCallback(webhookPath)
};
