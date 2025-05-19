require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { bot, webhookCallback } = require('./bot');
const { initGoogleSheets, readTasks, getUserData } = require('./googleSheets');
const { google } = require('googleapis');

const app = express();
const PORT = process.env.PORT || 10000;
const activeSessions = new Map();

// Middlewares
app.use(cors({
  origin: [
    'https://airdrop-bot-soy1.onrender.com',
    'https://web.telegram.org'
  ],
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Telegram-Data'],
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`, {
    headers: req.headers,
    body: req.body
  });
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
    const { userId } = req.body;
    const deviceId = `${req.headers['user-agent']}-${userId}`; 

    const existingSession = activeSessions.get(userId);

    if (existingSession && existingSession.deviceId === deviceId) {
        const elapsed = (new Date() - new Date(existingSession.startTime)) / 1000;
        return res.json({ 
            exists: true,
            sessionStart: existingSession.startTime,
            elapsedTime: elapsed,
            tokens: existingSession.tokens
        });
    }

    if (existingSession) {
        return res.status(400).json({ 
            error: "OTHER_DEVICE_ACTIVE",
            sessionStart: existingSession.startTime
        });
    }

    activeSessions.set(userId, {
        startTime: new Date(),
        lastActive: new Date(),
        deviceId,
        tokens: 0
    });

    res.json({ success: true });
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
    const { userId, tokens, deviceId, username } = req.body;
    const session = activeSessions.get(userId);

    if (!session || session.deviceId !== deviceId) {
      console.log(`Session invalide pour ${userId}. Session:`, session);
      return res.status(403).json({ 
        error: "INVALID_SESSION",
        message: "Votre session a expiré. Veuillez redémarrer le minage."
      });
    }

    const points = Math.floor(parseFloat(tokens));
    if (isNaN(points) || points <= 0) {
      return res.status(400).json({ error: "TOKENS_INVALID" });
    }

    const timestamp = new Date().toISOString();
    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(Buffer.from(process.env.GOOGLE_CREDS_B64, 'base64').toString()),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const sheets = google.sheets({ version: 'v4', auth });

    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: "Transactions!A2:E",
      valueInputOption: "USER_ENTERED",
      resource: {
        values: [[ 
          timestamp,
          userId,
          "AIRDROP",
          points,
          "COMPLETED"
        ]]
      }
    });

    const users = (await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: "Users!A2:F"
    })).data.values || [];

    const userIndex = users.findIndex(row => row[2]?.toString() === userId?.toString());
    let newBalance = points;

    if (userIndex >= 0) {
      const row = userIndex + 2;
      const currentBalance = parseInt(users[userIndex][3]) || 0;
      newBalance = currentBalance + points;
      
      await sheets.spreadsheets.values.update({
        spreadsheetId: process.env.GOOGLE_SHEET_ID,
        range: `Users!D${row}:E${row}`,
        valueInputOption: "USER_ENTERED",
        resource: { 
          values: [[ 
            newBalance, 
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
            username || "Anonyme",
            userId,
            points,
            timestamp,
            `REF-${Math.random().toString(36).slice(2, 8)}`
          ]]
        }
      });
    }

    activeSessions.set(userId, {
      startTime: Date.now(),
      deviceId: session.deviceId,
      tokens: 0
    });

    res.json({ 
      success: true,
      balance: newBalance,
      claimed: points
    });

  } catch (error) {
    console.error("Claim error:", error);
    res.status(500).json({ 
      error: "CLAIM_FAILED",
      message: "Erreur serveur. Veuillez réessayer.",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// [TELEGRAM] Webhook
app.post(`/webhook/${process.env.TELEGRAM_BOT_TOKEN}`, webhookCallback);

app.get('/referrals', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

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
    console.log(`Requête pour userID: ${req.params.userId}`);
    
    if (!req.headers['telegram-data']) {
      console.warn("Accès non autorisé - header manquant");
      return res.status(403).json({ error: "Authentification requise" });
    }

    const userData = await getUserData(req.params.userId);
    
    if (!userData) {
      console.log("Nouvel utilisateur détecté");
      return res.json({
        username: "Nouveau",
        balance: 0,
        lastClaim: null
      });
    }

    res.json({
      username: String(userData.username || "Anonyme"),
      balance: Number(userData.balance) || 0,
      lastClaim: userData.lastClaim || null
    });
    
  } catch (error) {
    console.error("ERREUR:", error);
    res.status(500).json({ 
      error: "Erreur serveur",
      details: process.env.NODE_ENV === 'development' ? error.message : null
    });
  }
});

app.get('/health', (req, res) => {
  res.json({
    status: sheetsInitialized ? 'OK' : 'INITIALIZING',
    sessions: activeSessions.size
  });
});

// [REFERRAL] Récupération des infos de parrainage
const validateTelegramData = (req, res, next) => {
  if (!req.headers['telegram-data']) {
    return res.status(403).json({ error: "Accès non autorisé" });
  }
  next();
};

// Protégez les routes :
app.get('/get-referrals', validateTelegramData, async (req, res) => {
  try {
    if (!sheetsInitialized) throw new Error('Service not ready');
    
    const tgData = req.headers['telegram-data'];
    if (!tgData) {
      return res.status(403).json({ error: "Authentification requise" });
    }

    const params = new URLSearchParams(tgData);
    const user = params.get('user') ? JSON.parse(params.get('user')) : {};
    const userId = user.id || '';

    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(Buffer.from(process.env.GOOGLE_CREDS_B64, 'base64').toString()),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const sheets = google.sheets({ version: 'v4', auth });

    const [users, referrals] = await Promise.all([
      sheets.spreadsheets.values.get({
        spreadsheetId: process.env.GOOGLE_SHEET_ID,
        range: "Users!A2:F"
      }),
      sheets.spreadsheets.values.get({
        spreadsheetId: process.env.GOOGLE_SHEET_ID,
        range: "Referrals!A2:D"
      })
    ]);

    const userData = (users.data.values || []).find(row => row[2] === userId);
    if (!userData) {
      return res.json({
        referralCount: 0,
        earnedTokens: 0,
        referrals: []
      });
    }

    const referralCode = userData[5] || '';
    const allReferrals = referrals.data.values || [];
    const userReferrals = allReferrals.filter(row => row[0] === referralCode);
    
    const earnedTokens = userReferrals.reduce((sum, row) => {
      return sum + (parseInt(row[1]) || 0);
    }, 0);

    res.json({
      referralCode,
      referralCount: userReferrals.length,
      earnedTokens,
      referrals: userReferrals.map(row => ({
        userId: row[2],
        username: row[3] || 'Anonyme',
        date: row[4] || new Date().toISOString(),
        reward: parseInt(row[1]) || 0
      }))
    });

  } catch (error) {
    console.error("Referral error:", error);
    res.status(500).json({ 
      error: "SERVER_ERROR",
      message: error.message || "Erreur serveur"
    });
  }
});

// [MAINTENANCE]
setInterval(() => {
    const now = new Date();
    for (const [userId, session] of activeSessions.entries()) {
        if ((now - session.lastActive) > 300000) { 
            activeSessions.delete(userId);
            console.log(`Session expirée pour ${userId}`);
        }
    }
}, 300000);

setInterval(() => {
  console.log('[Keep-Alive] Instance active...');
}, 5 * 60 * 1000); // Ping toutes les 5 minutes

process.on('unhandledRejection', err => console.error('Rejection:', err));
process.on('uncaughtException', err => {
  console.error('Crash:', err);
  process.exit(1);
});

initializeApp();