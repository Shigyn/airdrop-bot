require('dotenv').config();
const { Telegraf } = require('telegraf');

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

(async () => {
  try {
    const url = 'https://faucet-app.onrender.com/webhook'; // Remplace par ton URL publique Render
    await bot.telegram.setWebhook(url);
    console.log('Webhook configuré avec succès');
    process.exit(0);
  } catch (error) {
    console.error('Erreur lors du setWebhook:', error);
    process.exit(1);
  }
})();
