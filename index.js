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
let sheets;

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
const initializeApp = async () => {
  try {
    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(Buffer.from(process.env.GOOGLE_CREDS_B64, 'base64').toString()),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    sheets = google.sheets({ version: 'v4', auth }); // Initialisation globale
    
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

  if (!session) {
    return res.json({ status: 'NO_SESSION' });
  }

  if (session.deviceId !== deviceId) {
    return res.json({ 
      status: 'DEVICE_MISMATCH',
      sessionStart: session.startTime
    });
  }

  // Mettre à jour le timestamp
  session.lastActive = new Date();
  res.json({ 
    status: 'SYNCED',
    sessionStart: session.startTime,
    tokens: session.tokens
  });
});

app.post('/start-session', (req, res) => {
  const { userId, deviceId } = req.body;
  
  if (!deviceId) {
    return res.status(400).json({ error: "DEVICE_ID_REQUIRED" });
  }

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
});  // <-- Cette parenthèse fermante était manquante

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
  const { userId, deviceId, tokens, username } = req.body;

  // 1. Vérification session
  const session = activeSessions.get(userId);
  if (!session) {
    return res.status(403).json({
      error: "SESSION_NOT_FOUND",
      message: "Aucune session active. Veuillez démarrer le minage."
    });
  }

  // 2. Vérification device
  if (session.deviceId !== deviceId) {
    console.log('DeviceID mismatch:', {
      stored: session.deviceId,
      received: deviceId
    });
    return res.status(403).json({
      error: "DEVICE_MISMATCH",
      message: "Appareil non reconnu. Ouvrez depuis le même navigateur."
    });
  }

  try {
    // 3. Validation tokens
    const points = Math.floor(parseFloat(tokens));
    if (isNaN(points) || points <= 0) {
      return res.status(400).json({ 
        error: "INVALID_TOKENS",
        message: "Valeur des tokens invalide"
      });
    }

    // 4. Initialisation Google Sheets
    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(Buffer.from(process.env.GOOGLE_CREDS_B64, 'base64').toString()),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const sheets = google.sheets({ version: 'v4', auth });

    // 5. Écriture transaction
    const timestamp = new Date().toISOString();
    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: "Transactions!A2:E",
      valueInputOption: "USER_ENTERED",
      resource: {
        values: [[timestamp, userId, "AIRDROP", points, "COMPLETED"]]
      }
    });

    // 6. Mise à jour utilisateur
    const usersData = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: "Users!A2:F"
    });
    const users = usersData.data.values || [];
    const userIndex = users.findIndex(row => row[2]?.toString() === userId?.toString());
    let newBalance = points;

    if (userIndex >= 0) {
      newBalance = (parseInt(users[userIndex][3]) || 0) + points;
      await sheets.spreadsheets.values.update({
        spreadsheetId: process.env.GOOGLE_SHEET_ID,
        range: `Users!D${userIndex + 2}:E${userIndex + 2}`,
        valueInputOption: "USER_ENTERED",
        resource: { values: [[newBalance, timestamp]] }
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

    // 7. Reset session
    activeSessions.set(userId, {
      startTime: Date.now(),
      deviceId: session.deviceId,
      tokens: 0
    });

    // 8. Réponse
    res.json({ 
      success: true,
      balance: newBalance,
      claimed: points,
      timestamp
    });

  } catch (error) {
    console.error("Claim error:", error);
    res.status(500).json({ 
      error: "CLAIM_FAILED",
      message: "Erreur serveur",
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
    const params = new URLSearchParams(tgData);
    const user = params.get('user') ? JSON.parse(params.get('user')) : {};
    const userId = user.id?.toString();

    if (!userId) {
      return res.status(400).json({ error: "USER_ID_REQUIRED" });
    }

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

    const userData = (users.data.values || []).find(row => row[2]?.toString() === userId);
    if (!userData) {
      return res.json({
        referralCode: `REF-${Math.random().toString(36).substring(2, 8)}`,
        referralCount: 0,
        earnedTokens: 0,
        referrals: []
      });
    }

    const referralCode = userData[5] || '';
    const allReferrals = referrals.data.values || [];
    
    const userReferrals = allReferrals
      .filter(row => row[0] === referralCode)
      .map(row => ({
        username: row[3] || 'Anonyme',
        date: row[4] || new Date().toISOString(),
        reward: parseInt(row[1]) || 0
      }));

    res.json({
      referralCode,
      referralCount: userReferrals.length,
      earnedTokens: userReferrals.reduce((sum, ref) => sum + ref.reward, 0),
      referrals: userReferrals
    });

  } catch (error) {
    console.error("Referral error:", error);
    res.status(500).json({ 
      error: "SERVER_ERROR",
      message: error.message 
    });
  }
});

app.post('/register-referral', async (req, res) => {
  try {
    const { userId, referralCode, username } = req.body;
    
    // 1. Vérifier si l'utilisateur existe déjà
    const userSheet = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: "Users!A2:D"
    });

    const userExists = userSheet.data.values?.some(row => row[2] === userId);

    // 2. Si nouvel utilisateur, l'ajouter
    if (!userExists) {
      await sheets.spreadsheets.values.append({
        spreadsheetId: process.env.GOOGLE_SHEET_ID,
        range: "Users!A2:D",
        valueInputOption: "USER_ENTERED",
        resource: {
          values: [[
            new Date().toISOString(),
            username,
            userId,
            referralCode // Stocke le code de parrainage
          ]]
        }
      });
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Register error:", error);
    res.status(500).json({ error: "Erreur d'enregistrement" });
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