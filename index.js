require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { bot, webhookCallback } = require('./bot');
const { initGoogleSheets, readTasks, claimTaskForUser, getReferralInfo } = require('./googleSheets');

const app = express();
const PORT = process.env.PORT || 10000; // port Render ou local

// Middlewares globaux (avant webhook)
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Middleware logging simple
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - IP: ${req.ip}`);
  next();
});

// Init Google Sheets
initGoogleSheets().catch(err => {
  console.error('Google Sheets init error:', err);
});

// Webhook Telegram
const webhookSecretPath = `/webhook/${process.env.TELEGRAM_BOT_TOKEN}`;
const webhookUrl = process.env.PUBLIC_URL ?
  `${process.env.PUBLIC_URL}${webhookSecretPath}` :
  `http://localhost:${PORT}${webhookSecretPath}`;

app.post(webhookSecretPath, webhookCallback);

// API routes
app.get('/tasks', async (req, res) => {
  try {
    const tasks = await readTasks();
    res.json(tasks);
  } catch (err) {
    console.error('Tasks error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/claim', async (req, res) => {
  try {
    const { userId, taskId } = req.body;
    const result = await claimTaskForUser(userId, taskId);
    res.json(result);
  } catch (err) {
    console.error('Claim error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/referral/:code', async (req, res) => {
  try {
    const { code } = req.params;
    const referralInfo = await getReferralInfo(code);
    res.json(referralInfo);
  } catch (err) {
    console.error('Referral error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Health check (ex: Render)
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString()
  });
});

// Fichiers statiques public/
app.use(express.static(path.join(__dirname, 'public')));

// Route racine
app.get('/', (req, res) => {
  res.send('Airdrop Bot is running!');
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Erreur globale
app.use((err, req, res, next) => {
  console.error('Global error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Démarrage serveur
app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
  console.log(`Webhook URL: ${webhookUrl}`);

  if (process.env.PUBLIC_URL) {
    console.log('Production mode with webhook');
  } else {
    console.log('Development mode, starting polling');
    bot.launch();
  }
});
