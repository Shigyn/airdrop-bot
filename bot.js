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
      domain: 'airdrop-bot-soy1.onrender.com',
      hookPath: webhookPath,
      // Désactiver le webhook initial pour éviter les erreurs 429
      enabled: false,
      // Configuration pour éviter les erreurs 429
      maxAttempts: 3,
      retryAfter: 5000 // 5 secondes entre les tentatives
    }
  }
});

// Fonction pour configurer le webhook avec retry
async function configureWebhook(retryCount = 0) {
  try {
    // D'abord vérifier l'état actuel du webhook
    const webhookInfo = await bot.telegram.getWebhookInfo();
    
    // Si le webhook existe déjà, le supprimer
    if (webhookInfo.url) {
      logger.info('Deleting existing webhook...');
      await bot.telegram.deleteWebhook();
      
      // Attendre un peu après la suppression
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    // Configurer le nouveau webhook
    logger.info('Setting up new webhook...');
    await bot.telegram.setWebhook(webhookUrl);
    logger.info('Webhook configured successfully');
  } catch (err) {
    logger.error('Webhook configuration failed:', err);
    
    // Si c'est une erreur 429
    if (err.response && err.response.error_code === 429) {
      const retryAfter = err.response.parameters?.retry_after || 1;
      logger.info(`Waiting ${retryAfter} seconds before retrying webhook configuration...`);
      
      // Limiter le nombre de tentatives
      if (retryCount < 3) {
        setTimeout(() => configureWebhook(retryCount + 1), retryAfter * 1000);
      } else {
        logger.error('Max retries reached. Giving up.');
        process.exit(1);
      }
    } else {
      // Pour d'autres erreurs, réessayer après 5 secondes
      logger.info('Retrying webhook configuration in 5 seconds...');
      
      // Limiter le nombre de tentatives
      if (retryCount < 3) {
        setTimeout(() => configureWebhook(retryCount + 1), 5000);
      } else {
        logger.error('Max retries reached. Giving up.');
        process.exit(1);
      }
    }
  }
}

// Démarrer la configuration du webhook après un délai initial plus long
setTimeout(() => configureWebhook(), 5000);

googleSheets.initGoogleSheets().catch(err => {
  logger.error('Sheets initialization failed:', err);
  process.exit(1);
});

// Attendre que le webhook soit configuré avant de continuer
let webhookConfigured = false;

// Fonction pour vérifier l'état du webhook
async function checkWebhookStatus() {
  try {
    const webhookInfo = await bot.telegram.getWebhookInfo();
    if (webhookInfo.url) {
      webhookConfigured = true;
      logger.info('Webhook is configured successfully');
      // Arrêter l'intervalle de vérification
      clearInterval(webhookCheckInterval);
    }
  } catch (err) {
    logger.error('Error checking webhook status:', err);
  }
}

// Démarrer la vérification du webhook
const webhookCheckInterval = setInterval(checkWebhookStatus, 5000);

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
