const { Telegraf, Markup } = require('telegraf');
const {
  readTasks,
  claimTaskForUser,
  getReferralInfo
} = require('./googlesheets');

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// Middleware de log pour toutes les updates
bot.use(async (ctx, next) => {
  console.log('Update reçue :', ctx.updateType);
  await next();
});

// Command /start
bot.start((ctx) => {
  ctx.reply('Bienvenue à l’airdrop! Choisis une option:', Markup.inlineKeyboard([
    Markup.button.callback('Tasks', 'tasks'),
    Markup.button.callback('Claim', 'claim'),
    Markup.button.callback('Referral', 'referral')
  ]));
});

// Actions pour les boutons
bot.action('tasks', async (ctx) => {
  const tasks = await readTasks();
  let message = 'Liste des tasks:\n';
  tasks.forEach(t => {
    message += `• ${t.Description} (Reward: ${t.Reward})\n`;
  });
  ctx.reply(message);
});

bot.action('claim', (ctx) => {
  ctx.reply('Pour réclamer une récompense, envoie /claim suivi de l’ID de la tâche.');
});

bot.command('claim', async (ctx) => {
  const text = ctx.message.text;
  const parts = text.split(' ');
  if (parts.length !== 2) {
    return ctx.reply('Usage: /claim <TaskID>');
  }
  const taskId = parts[1];
  const userId = ctx.from.id;
  try {
    const res = await claimTaskForUser(userId, taskId);
    ctx.reply(res.message);
  } catch (err) {
    ctx.reply(`Erreur: ${err.message}`);
  }
});

bot.action('referral', async (ctx) => {
  const code = `REF-${ctx.from.id}`; // Logique temporaire
  ctx.reply(`Ton code de parrainage est : ${code}`);
});

// Gestion d'erreur globale
bot.catch((err, ctx) => {
  console.error('Erreur dans le bot', err);
  ctx.reply('Une erreur est survenue. Réessaie plus tard.');
});

module.exports = {
  bot,
  webhookCallback: bot.webhookCallback.bind(bot),
};
