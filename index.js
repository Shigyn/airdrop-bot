require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
// const bodyParser = require('body-parser'); // plus besoin
const { bot, webhookCallback } = require('./bot');
const { initGoogleSheets, readTasks, claimTaskForUser, getReferralInfo } = require('./googlesheets');
const app = express();
const port = process.env.PORT || 10000; // Render default port

// Middlewares globaux (doivent être avant la route webhook)
app.use(cors());
app.use(express.json());  // remplace bodyParser.json()
app.use(express.urlencoded({ extended: true }));
app.post(webhookSecretPath, webhookCallback);

// Middleware de logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - IP: ${req.ip}`);
  next();
});

// Initialisation Google Sheets
initGoogleSheets();

// Route webhook Telegram
const webhookSecretPath = `/webhook/${process.env.TELEGRAM_BOT_TOKEN}`;
const webhookUrl = process.env.PUBLIC_URL ? 
  `${process.env.PUBLIC_URL}${webhookSecretPath}` : 
  `http://localhost:${port}${webhookSecretPath}`;

// Routes API
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

// Health check (Render)
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString()
  });
});

// Fichiers statiques
app.use(express.static(path.join(__dirname, 'public')));

// Route racine simple
app.get('/', (req, res) => {
  res.send('Airdrop Bot is running!');
});

// Gestion des erreurs 404
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Gestion des erreurs globales
app.use((err, req, res, next) => {
  console.error('Global error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Démarrage du serveur
app.listen(port, () => {
  console.log(`Server started on port ${port}`);
  console.log(`Webhook URL: ${webhookUrl}`);

  // En production, on utilise le webhook via Express
  if (process.env.PUBLIC_URL) {
    console.log('Running in production mode with webhook');
  } else {
    console.log('Running in development mode, using polling');
    bot.launch(); // Seulement en dev
  }
});
