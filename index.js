require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { bot, webhookCallback } = require('./bot');
const { 
  initGoogleSheets, 
  readTasks, 
  getUserData,
  getReferralInfo,
  getSheetInstance
} = require('./googleSheets');
const { google } = require('googleapis');

const app = express();
const PORT = process.env.PORT || 10000;

// Stockage des sessions en mémoire (à remplacer par Redis en production)
const activeSessions = new Map();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logger amélioré
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - IP: ${req.ip}`);
  next();
});

const webhookSecretPath = `/webhook/${process.env.TELEGRAM_BOT_TOKEN}`;
const webhookUrl = process.env.PUBLIC_URL ?
  `${process.env.PUBLIC_URL}${webhookSecretPath}` :
  `http://localhost:${PORT}${webhookSecretPath}`;

let sheetsInitialized = false;

// Nouvelles fonctions de gestion de session
function cleanupSessions() {
  const now = new Date();
  for (const [userId, session] of activeSessions.entries()) {
    const sessionDuration = (now - new Date(session.startTime)) / 1000;
    if (sessionDuration > 3600) { // 1 heure max
      activeSessions.delete(userId);
    }
  }
}

// Planifie le nettoyage toutes les 5 minutes
setInterval(cleanupSessions, 5 * 60 * 1000);

async function initializeApp() {
  try {
    await initGoogleSheets();
    sheetsInitialized = true;
    console.log('Google Sheets initialized successfully');
    
    app.listen(PORT, () => {
      console.log(`Server started on port ${PORT}`);
      console.log(`Webhook URL: ${webhookUrl}`);

      if (!process.env.PUBLIC_URL) {
        console.log('Development mode, starting polling');
        bot.launch().catch(err => {
          console.error('Bot launch error:', err);
          process.exit(1);
        });
      }
    });
  } catch (err) {
    console.error('Initialization failed:', err);
    process.exit(1);
  }
}

// ===== NOUVELLES ROUTES POUR LES SESSIONS =====
app.post('/start-session', (req, res) => {
  const { userId, startTime } = req.body;
  
  if (activeSessions.has(userId)) {
    const existingSession = activeSessions.get(userId);
    return res.json({ 
      success: false,
      error: "Session déjà en cours",
      sessionStart: existingSession.startTime
    });
  }
  
  const session = {
    startTime: new Date(startTime),
    lastActive: new Date()
  };
  
  activeSessions.set(userId, session);
  res.json({ success: true, sessionStart: session.startTime });
});

app.get('/check-session/:userId', (req, res) => {
  const session = activeSessions.get(req.params.userId);
  res.json({
    activeSession: !!session,
    sessionStart: session?.startTime.toISOString()
  });
});

app.post('/end-session', (req, res) => {
  activeSessions.delete(req.body.userId);
  res.json({ success: true });
});

// ===== ROUTES EXISTANTES MODIFIÉES =====
app.post('/claim', async (req, res) => {
  try {
    if (!sheetsInitialized) throw new Error('Service not initialized');

    const { userId, tokens, username = "inconnu", startTime } = req.body;

    // Vérification de la session
    const session = activeSessions.get(userId);
    if (!session || new Date(startTime).getTime() !== new Date(session.startTime).getTime()) {
      return res.status(400).json({ 
        success: false, 
        message: "Session invalide ou expirée" 
      });
    }

    const timestamp = new Date().toISOString();
    const points = Math.floor(parseFloat(tokens));

    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(Buffer.from(process.env.GOOGLE_CREDS_B64, 'base64').toString()),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const sheets = google.sheets({ version: 'v4', auth });

    // Enregistrement de la transaction
    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: "Transactions!A2:E",
      valueInputOption: "USER_ENTERED",
      resource: {
        values: [[
          userId,
          points,
          "AIRDROP",
          timestamp,
          `${points} tokens`
        ]]
      }
    });

    // Mise à jour du solde utilisateur
    const usersResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: "Users!A2:F"
    });

    const users = usersResponse.data.values || [];
    const userIndex = users.findIndex(row => row[2] === userId);

    if (userIndex >= 0) {
      const rowNumber = userIndex + 2;
      const currentBalance = parseInt(users[userIndex][3]) || 0;

      await sheets.spreadsheets.values.update({
        spreadsheetId: process.env.GOOGLE_SHEET_ID,
        range: `Users!D${rowNumber}:E${rowNumber}`,
        valueInputOption: "USER_ENTERED",
        resource: {
          values: [[
            currentBalance + points,
            timestamp
          ]]
        }
      });
    } else {
      await sheets.spreadsheets.values.append({
        spreadsheetId: process.env.GOOGLE_SHEET_ID,
        range: "Users!A2:F",
        valueInputOption: "USER_ENTERED",
        resource: {
          values: [[
            timestamp,
            username,
            userId,
            points,
            timestamp,
            `REF-${Math.random().toString(36).substr(2, 8)}`
          ]]
        }
      });
    }

    // Fin de session après claim
    activeSessions.delete(userId);

    res.json({ 
      success: true,
      points,
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

// ===== ROUTES EXISTANTES (inchangées) =====
app.post(webhookSecretPath, webhookCallback);

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

app.get('/user/:userId', async (req, res) => {
  try {
    if (!sheetsInitialized) throw new Error('Service not initialized');
    
    const user = await getUserData(req.params.userId);
    
    if (!user) {
      console.log("User non trouvé. ID recherché:", req.params.userId);
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      username: user[1],
      balance: user[3],
      lastClaim: user[4]
    });

  } catch (error) {
    console.error('User data error:', error);
    res.status(500).json({ 
      error: error.message,
      details: "Vérifiez le format des données dans Google Sheets" 
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

app.get('/health', (req, res) => {
  const status = {
    status: sheetsInitialized ? 'OK' : 'INITIALIZING',
    timestamp: new Date().toISOString(),
    services: {
      googleSheets: sheetsInitialized,
      telegram: !!process.env.TELEGRAM_BOT_TOKEN,
      sessions: activeSessions.size
    }
  };
  res.status(sheetsInitialized ? 200 : 503).json(status);
});

app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

app.use((err, req, res, next) => {
  console.error('Global error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

initializeApp();

process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  process.exit(1);
});