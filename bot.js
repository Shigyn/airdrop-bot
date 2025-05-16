const { Telegraf, Markup } = require('telegraf');
const { google } = require('googleapis');
const logger = require('./logger'); // Fichier logger.js à créer (voir plus bas)

// Initialisation Google Sheets
const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(Buffer.from(process.env.GOOGLE_CREDS_B64, 'base64').toString()),
  scopes: ['https://www.googleapis.com/auth/spreadsheets']
});
const sheets = google.sheets({ version: 'v4', auth });

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// ======================
// FONCTIONS GOOGLE SHEETS
// ======================

async function readTasks() {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: process.env.TASKS_RANGE || 'Tasks!A2:D'
  });
  return res.data.values.map(row => ({
    Id: row[0],
    Description: row[1],
    Reward: row[2],
    Status: row[3]
  }));
}

async function claimTaskForUser(userId, taskId) {
  // 1. Vérifie si la tâche existe
  const tasks = await readTasks();
  const task = tasks.find(t => t.Id === taskId);
  if (!task) throw new Error('Tâche introuvable');

  // 2. Enregistre dans la feuille "Claims"
  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: process.env.CLAIMS_RANGE || 'Claims!A2:C',
    valueInputOption: 'RAW',
    resource: {
      values: [[userId, taskId, new Date().toISOString()]]
    }
  });

  return { 
    success: true,
    message: `🎉 Tâche #${taskId} validée ! Récompense : ${task.Reward}`
  };
}

// ==================
// COMMANDES DU BOT
// ==================

bot.start((ctx) => {
  ctx.reply(
    `👋 Bienvenue ${ctx.from.first_name} à l'Airdrop !`,
    Markup.inlineKeyboard([
      [Markup.button.callback('📋 Voir les tâches', 'tasks')],
      [Markup.button.callback('🎁 Réclamer une récompense', 'claim')],
      [Markup.button.callback('👥 Parrainage', 'referral')]
    ])
  );
});

bot.action('tasks', async (ctx) => {
  try {
    const tasks = await readTasks();
    if (!tasks.length) {
      return ctx.reply('Aucune tâche disponible pour le moment');
    }

    let message = '📋 Tâches disponibles :\n\n';
    tasks.forEach(task => {
      message += `▶️ #${task.Id}\n${task.Description}\n💸 Récompense : ${task.Reward}\n\n`;
    });

    ctx.reply(message, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        Markup.button.callback('🔄 Actualiser', 'tasks')
      ])
    });
  } catch (err) {
    logger.error('Tasks Error:', err);
    ctx.reply('❌ Erreur lors du chargement des tâches');
  }
});

bot.command('claim', async (ctx) => {
  const taskId = ctx.message.text.split(' ')[1];
  
  if (!taskId) {
    return ctx.replyWithMarkdown('Utilisation : `/claim [id_tâche]`\nExemple : `/claim 1`');
  }

  try {
    const result = await claimTaskForUser(ctx.from.id, taskId);
    await ctx.reply(result.message);
    
    // Notification admin
    if (process.env.ADMIN_CHAT_ID) {
      await bot.telegram.sendMessage(
        process.env.ADMIN_CHAT_ID,
        `Nouvelle réclamation:\n👤 User: ${ctx.from.id}\n📌 Tâche: ${taskId}`
      );
    }
  } catch (err) {
    logger.error('Claim Error:', err);
    ctx.reply(`❌ Erreur : ${err.message}`);
  }
});

// ==================
// CONFIGURATION FINALE
// ==================

bot.catch((err, ctx) => {
  logger.error(`Bot Error: ${err}`, ctx.update);
  ctx.reply('⚠️ Une erreur est survenue. Veuillez réessayer.');
});

module.exports = {
  bot,
  webhookCallback: bot.webhookCallback('/webhook-secret'),
  sheets // Export pour utilisation dans d'autres fichiers
};