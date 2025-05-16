require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const bodyParser = require('body-parser');

const bot = require('./bot');
const { initGoogleSheets } = require('./googleSheets');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Google Sheets init
initGoogleSheets();

// Middleware JSON spécifique pour /webhook
app.use('/webhook', express.json());

// Test webhook (tu peux enlever après test)
app.post('/webhook', (req, res, next) => {
  console.log('Webhook POST reçu');
  next();
});

// **Webhook Telegram - une seule fois ici**
app.use(bot.webhookCallback('/webhook'));

// Static files après routes
app.use(express.static(path.join(__dirname, 'public')));

// API example routes
app.get('/tasks', async (req, res) => {
  try {
    const tasks = await bot.getTasks();
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/claim', async (req, res) => {
  try {
    const { userId, taskId } = req.body;
    const result = await bot.claimTask(userId, taskId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/referral/:code', async (req, res) => {
  try {
    const { code } = req.params;
    const referralInfo = await bot.getReferral(code);
    res.json(referralInfo);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Start server
app.use(bot.webhookCallback('/webhook')); 

// Set webhook
const webhookUrl = `https://faucet-app.onrender.com/webhook`;
bot.telegram.setWebhook(webhookUrl);

app.listen(port, () => {
  console.log(`Server started on port ${port}`);
});
