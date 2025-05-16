const { Telegraf, Markup } = require('telegraf');
const {
  readTasks,
  claimTaskForUser,
  getReferralInfo
} = require('./googleSheets');

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// Command /start
bot.start((ctx) => {
  ctx.reply('Bienvenue à l’airdrop! Choisis une option:', Markup.inlineKeyboard([
    Markup.button.callback('Tasks', 'tasks'),
    Markup.button.callback('Claim', 'claim'),
    Markup.button.callback('Referral', 'referral')
  ]));
});

// Actions for buttons
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
  ctx.reply('Ton code de parrainage est : ABC123'); // à modifier selon ta logique
});

// Lancer le bot
bot.launch();

module.exports = {
  getTasks: readTasks,
  claimTask: claimTaskForUser,
  getReferral: getReferralInfo,
};
