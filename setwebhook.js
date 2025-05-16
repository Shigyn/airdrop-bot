const { Telegraf } = require('telegraf');

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

(async () => {
  try {
    if (!process.env.PUBLIC_URL) {
      throw new Error('La variable PUBLIC_URL n\'est pas définie');
    }
    const url = process.env.PUBLIC_URL + '/webhook';
    await bot.telegram.setWebhook(url);
    console.log('Webhook configuré avec succès:', url);
    process.exit(0);
  } catch (error) {
    console.error('Erreur lors du setWebhook:', error);
    process.exit(1);
  }
})();
