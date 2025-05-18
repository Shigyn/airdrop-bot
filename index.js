require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { bot, webhookCallback } = require('./bot');
const { initGoogleSheets, readTasks, getUserData, getReferralInfo } = require('./googleSheets');
const { google } = require('googleapis');

const app = express();
const PORT = process.env.PORT || 10000;
const activeSessions = new Map();

// Middlewares
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Initialisation
let sheetsInitialized = false;
const initializeApp = async () => {
  try {
    await initGoogleSheets();
    sheetsInitialized = true;
    console.log('Server ready');
    app.listen(PORT, () => console.log(`Running on port ${PORT}`));
  } catch (err) {
    console.error('Init failed:', err);
    process.exit(1);
  }
};

// ===== [ROUTES] =====

// [SESSION] Synchronisation
app.post('/sync-session', (req, res) => {
  const { userId, deviceId } = req.body;
  const session = activeSessions.get(userId);
  
  if (!session) return res.json({ status: 'no_session' });
  if (session.deviceId !== deviceId) return res.json({
    status: 'other_device',
    sessionStart: session.startTime
  });

  session.lastActive = new Date();
  res.json({
    status: 'synced',
    sessionStart: session.startTime,
    tokens: session.tokens
  });
});

// [SESSION] Nouvelle session
app.post('/start-session', (req, res) => {
  const { userId, deviceId } = req.body;
  
  if (activeSessions.has(userId)) {
    const existing = activeSessions.get(userId);
    if (existing.deviceId !== deviceId) {
      return res.status(400).json({ 
        error: "OTHER_DEVICE_ACTIVE",
        sessionStart: existing.startTime
      });
    }
    return res.json({ 
      exists: true,
      sessionStart: existing.startTime,
      tokens: existing.tokens
    });
  }
  
  const newSession = {
    startTime: new Date(),
    lastActive: new Date(),
    deviceId,
    tokens: 0
  };
  
  activeSessions.set(userId, newSession);
  res.json({ 
    success: true,
    sessionStart: newSession.startTime
  });
});

app.post('/update-session', (req, res) => {
  const { userId, tokens, deviceId } = req.body;
  const session = activeSessions.get(userId);
  
  if (session && session.deviceId === deviceId) {
    session.tokens = parseFloat(tokens);
    session.lastActive = new Date();
    res.json({ success: true });
  } else {
    res.status(400).json({ error: "Invalid session" });
  }
});

// [CLAIM] Enregistrement
app.post('/claim', async (req, res) => {
  try {
    if (!sheetsInitialized) throw new Error('Service not ready');
    const { userId, tokens, deviceId } = req.body;
    const session = activeSessions.get(userId);

    if (!session || session.deviceId !== deviceId) {
      return res.status(403).json({ error: "INVALID_SESSION" });
    }

    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(Buffer.from(process.env.GOOGLE_CREDS_B64, 'base64').toString()),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const sheets = google.sheets({ version: 'v4', auth });

    // Enregistrement
    const timestamp = new Date().toISOString();
    const points = Math.floor(parseFloat(tokens));
    
    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: "Transactions!A2:E",
      valueInputOption: "USER_ENTERED",
      resource: {
        values: [[ userId, points, "AIRDROP", timestamp, `${points} tokens` ]]
      }
    });

    // Mise à jour solde
    const users = (await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: "Users!A2:F"
    })).data.values || [];

    const userIndex = users.findIndex(row => row[2] === userId);
    if (userIndex >= 0) {
      const row = userIndex + 2;
      const balance = parseInt(users[userIndex][3]) || 0;
      await sheets.spreadsheets.values.update({
        spreadsheetId: process.env.GOOGLE_SHEET_ID,
        range: `Users!D${row}:E${row}`,
        valueInputOption: "USER_ENTERED",
        resource: { values: [[ balance + points, timestamp ]] }
      });
    } else {
      await sheets.spreadsheets.values.append({
        spreadsheetId: process.env.GOOGLE_SHEET_ID,
        range: "Users!A2:F",
        valueInputOption: "USER_ENTERED",
        resource: {
          values: [[
            timestamp,
            req.body.username || "Anonyme",
            userId,
            points,
            timestamp,
            `REF-${Math.random().toString(36).slice(2, 8)}`
          ]]
        }
      });
    }

    activeSessions.delete(userId);
    res.json({ success: true, points });
  } catch (error) {
    console.error("Claim error:", error);
    res.status(500).json({ error: error.message });
  }
});

// [TELEGRAM] Webhook
app.post(`/webhook/${process.env.TELEGRAM_BOT_TOKEN}`, webhookCallback);

// [STATIC] Routes
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// [API] Routes
app.get('/tasks', async (req, res) => {
  try {
    if (!sheetsInitialized) throw new Error('Service not ready');
    res.json(await readTasks());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/user/:userId', async (req, res) => {
  try {
    console.log("Requête user reçue pour:", req.params.userId); // Debug
    const user = await getUserData(req.params.userId);
    
    if (!user) {
      console.log("Aucune donnée trouvée pour:", req.params.userId);
      return res.status(404).json({ error: 'User not found' });
    }

    // Formatage explicite des données
    const responseData = {
      username: user[1] || "Anonyme",
      balance: user[3] !== undefined ? user[3] : 0,
      lastClaim: user[4] || null
    };

    console.log("Données envoyées:", responseData); // Debug
    res.json(responseData);
    
  } catch (error) {
    console.error("Erreur complète:", error);
    res.status(500).json({ 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

app.get('/health', (req, res) => {
  res.json({
    status: sheetsInitialized ? 'OK' : 'INITIALIZING',
    sessions: activeSessions.size
  });
});

// [MAINTENANCE]
setInterval(() => { // Nettoyage sessions
  const now = new Date();
  for (const [userId, session] of activeSessions.entries()) {
    if ((now - new Date(session.lastActive)) > 3600000) {
      activeSessions.delete(userId);
    }
  }
}, 300000);

process.on('unhandledRejection', err => console.error('Rejection:', err));
process.on('uncaughtException', err => {
  console.error('Crash:', err);
  process.exit(1);
});

initializeApp();