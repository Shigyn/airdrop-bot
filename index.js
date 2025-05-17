require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { bot, webhookCallback } = require('./bot');
const { 
  initGoogleSheets, 
  readTasks, 
  claimTaskForUser, 
  getReferralInfo,
  claimRandomTaskForUser 
} = require('./googleSheets');

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
let sheetsInitialized = false;
initGoogleSheets()
  .then(() => {
    sheetsInitialized = true;
    console.log('Google Sheets initialized successfully');
  })
  .catch(err => {
    console.error('Google Sheets init error:', err);
    process.exit(1); // Quit if sheets can't initialize
  });

const webhookSecretPath = `/webhook/${process.env.TELEGRAM_BOT_TOKEN}`;
const webhookUrl = process.env.PUBLIC_URL ?
  `${process.env.PUBLIC_URL}${webhookSecretPath}` :
  `http://localhost:${PORT}${webhookSecretPath}`;

// Telegram Webhook
app.post(webhookSecretPath, webhookCallback);

// API Routes
app.get('/tasks', async (req, res) => {
  try {
    if (!sheetsInitialized) throw new Error('Service not initialized');
    const tasks = await readTasks();
    res.json(tasks);
  } catch (err) {
    console.error('Tasks error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/claim', async (req, res) => {
  try {
    if (!sheetsInitialized) throw new Error('Service not initialized');
    
    const { userId, taskId } = req.body;
    
    if (!userId) {
      return res.status(400).json({ 
        success: false, 
        message: "User ID is required" 
      });
    }

    let result;
    if (taskId) {
      result = await claimTaskForUser(userId, taskId);
    } else {
      result = await claimRandomTaskForUser(userId);
    }

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error) {
    console.error("Claim error:", error);
    res.status(500).json({ 
      success: false, 
      message: error.message || "Server error" 
    });
  }
});

app.get('/referral/:code', async (req, res) => {
  try {
    if (!sheetsInitialized) throw new Error('Service not initialized');
    const { code } = req.params;
    const referralInfo = await getReferralInfo(code);
    res.json(referralInfo);
  } catch (err) {
    console.error('Referral error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Health check endpoint with service status
app.get('/health', (req, res) => {
  const status = {
    status: sheetsInitialized ? 'OK' : 'INITIALIZING',
    timestamp: new Date().toISOString(),
    services: {
      googleSheets: sheetsInitialized,
      telegram: !!process.env.TELEGRAM_BOT_TOKEN
    }
  };
  res.status(sheetsInitialized ? 200 : 503).json(status);
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
    bot.launch().catch(err => {
      console.error('Bot launch error:', err);
      process.exit(1);
    });
  }
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  process.exit(1);
});