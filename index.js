require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const bodyParser = require('body-parser');

const bot = require('./bot');
const { initGoogleSheets, readTasks, claimTaskForUser, getReferralInfo } = require('./googleSheets');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Google Sheets init
initGoogleSheets();

// Webhook Telegram (une seule fois)
app.use(bot.webhookCallback('/webhook'));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// API example routes
app.get('/tasks', async (req, res) => {
  try {
    const tasks = await readTasks();
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/claim', async (req, res) => {
  try {
    const { userId, taskId } = req.body;
    const result = await claimTaskForUser(userId, taskId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/referral/:code', async (req, res) => {
  try {
    const { code } = req.params;
    const referralInfo = await getReferralInfo(code);
    res.json(referralInfo);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Set webhook URL (à faire une fois, pas à chaque redémarrage)
// bot.telegram.setWebhook('https://faucet-app.onrender.com/webhook');

app.listen(port, async () => {
  console.log(`Server started on port ${port}`);
  // Optionnel: Set webhook automatiquement au démarrage (déconseillé en production)
  if (process.env.NODE_ENV !== 'production') {
    try {
      await bot.telegram.setWebhook(`${process.env.PUBLIC_URL}/webhook`);
      console.log('Webhook set successfully');
    } catch (err) {
      console.error('Webhook error:', err);
    }
  }
});