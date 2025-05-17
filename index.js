require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { bot, webhookCallback } = require('./bot');
const { initGoogleSheets, readTasks, claimTaskForUser, getReferralInfo } = require('./googleSheets');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logger simple
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - IP: ${req.ip}`);
  next();
});

// Init Google Sheets
initGoogleSheets().catch(err => {
  console.error('Google Sheets init error:', err);
});

const webhookSecretPath = `/webhook/${process.env.TELEGRAM_BOT_TOKEN}`;
const webhookUrl = process.env.PUBLIC_URL ?
  `${process.env.PUBLIC_URL}${webhookSecretPath}` :
  `http://localhost:${PORT}${webhookSecretPath}`;

app.post(webhookSecretPath, webhookCallback);

// API Routes
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
    
    // Option 1: Si taskId est fourni, tenter de claim cette tâche spécifique
    if (taskId) {
      const result = await sheetsService.claimSpecificTask(userId, taskId);
      return res.json(result);
    }
    
    // Option 2: Sinon, claim une tâche aléatoire disponible
    const result = await sheetsService.claimRandomTask(userId);
    
    if (result.error === "No available tasks") {
      return res.status(400).json({
        success: false,
        message: "Aucune tâche disponible actuellement. Revenez plus tard!"
      });
    }
    
    res.json(result);
  } catch (error) {
    console.error("Claim error:", error);
    res.status(500).json({ 
      success: false, 
      message: error.message || "Erreur serveur" 
    });
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

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Serve index.html for root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Global error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
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