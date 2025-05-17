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
    const { userId, minutes } = req.body;
    const username = req.body.username || "inconnu";

    // Validation
    if (!userId) throw new Error("User ID requis");
    if (minutes < 10 || minutes > 60) {
      throw new Error("Durée invalide (10-60 minutes)");
    }

    const timestamp = new Date().toISOString();
    const points = minutes;

    // 1. Enregistrement dans Transactions
    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.SHEET_ID,
      range: "Transactions!A2:E",
      valueInputOption: "USER_ENTERED",
      resource: {
        values: [[
          userId,
          points,
          "AIRDROP",
          timestamp,
          `${minutes} minutes`
        ]]
      }
    });

    // 2. Mise à jour dans Users
    const usersSheet = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SHEET_ID,
      range: "Users!A2:F"
    });

    const users = usersSheet.data.values || [];
    let userRow = users.find(row => row[2] === userId);

    if (userRow) {
      // Mise à jour de l'utilisateur existant
      const rowIndex = users.indexOf(userRow) + 2; // +2 car ligne 1 = header
      await sheets.spreadsheets.values.update({
        spreadsheetId: process.env.SHEET_ID,
        range: `Users!D${rowIndex}:E${rowIndex}`,
        valueInputOption: "USER_ENTERED",
        resource: {
          values: [[
            (parseInt(userRow[3]) + points, // Balance
            timestamp                      // Last_Claim_Time
          ]]
        }
      });
    } else {
      // Nouvel utilisateur
      await sheets.spreadsheets.values.append({
        spreadsheetId: process.env.SHEET_ID,
        range: "Users!A2:F",
        valueInputOption: "USER_ENTERED",
        resource: {
          values: [[
            timestamp,                      // Date_Inscription
            username,                       // Username
            userId,                         // user_id
            points,                         // Balance
            timestamp,                      // Last_Claim_Time
            `REF-${Math.random().toString(36).substr(2, 8)}` // Referral_Code
          ]]
        }
      });
    }

    res.json({ 
      success: true,
      points: points,
      message: `${points} points réclamés avec succès!`
    });

  } catch (error) {
    console.error("Claim error:", error);
    res.status(400).json({
      success: false,
      message: error.message
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