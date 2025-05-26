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
let sheetsInitialized = false; // ajouté pour la santé du service

// Middlewares
app.use(cors({
  origin: [
    'https://airdrop-bot-soy1.onrender.com',
    'https://web.telegram.org',
    'https://t.me/CRYPTORATS_bot' // Assure-toi que c'est bien la bonne URL Telegram WebApp
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Telegram-Data', 'Authorization'],
  credentials: true,
  exposedHeaders: ['Content-Length', 'X-Request-Id']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Middleware de log (éviter de logger des données sensibles en prod)
app.use((req, res, next) => {
  const safeBody = { ...req.body };
  if (safeBody.tokens) safeBody.tokens = "***";
  if (safeBody.Authorization) safeBody.Authorization = "***";
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`, {
    headers: req.headers,
    body: safeBody
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

app.post('/check-session', (req, res) => {
  const { userId, deviceId } = req.body;
  
  if (!userId || !deviceId) {
    return res.status(400).json({ error: "Missing parameters" });
  }

  const session = activeSessions.get(userId);
  
  if (!session) {
    return res.json({ valid: false, message: "No active session" });
  }

  if (session.deviceId !== deviceId) {
    return res.json({ 
      valid: false, 
      message: "Device mismatch",
      sessionDevice: session.deviceId,
      requestDevice: deviceId
    });
  }

  // Vérifier si la session est toujours valide (moins de 60 minutes)
  const elapsedMinutes = (Date.now() - session.startTime) / (1000 * 60);
  const remaining = Math.max(0, 60 - elapsedMinutes);

  res.json({
    valid: remaining > 0,
    startTime: session.startTime,
    remainingMinutes: remaining,
    tokens: session.tokens || 0
  });
});

app.post('/start-session', (req, res) => {
  const { userId, deviceId } = req.body;
  const MAX_MINUTES = 60; // Durée max totale

  // 1. Vérifier si session existe déjà
  const existingSession = activeSessions.get(userId);
  const now = Date.now();

  if (existingSession) {
    // 2. Calculer le temps déjà consommé
    const minutesUsed = (now - existingSession.startTime) / (1000 * 60);
    const remaining = MAX_MINUTES - minutesUsed;

    // 3. Si temps restant
    if (remaining > 0) {
      return res.json({
        status: "SESSION_RESUMED",
        message: `Session reprise (${Math.floor(remaining)} minutes restantes)`,
        startTime: existingSession.startTime,
        remainingMinutes: Math.floor(remaining)
      });
    }

    // 4. Si limite atteinte
    activeSessions.delete(userId);
    return res.status(403).json({
      error: "LIMIT_REACHED",
      message: "Vous avez déjà utilisé vos 60 minutes de minage"
    });
  }

  // 5. Nouvelle session
  activeSessions.set(userId, {
    startTime: now,       // Timestamp de démarrage
    lastActive: now,      // Dernière activité
    deviceId,             // Verrouillage appareil
    totalMinutes: 0       // Compteur de temps effectif
  });

  res.json({
    status: "SESSION_STARTED",
    startTime: now,
    remainingMinutes: MAX_MINUTES
  });
});

app.post('/update-session', async (req, res) => {
  const { userId, tokens, deviceId } = req.body;
  
  try {
    // Vérifier que tous les champs sont présents
    if (!userId || !tokens || !deviceId) {
      return res.status(400).json({ error: "Missing parameters" });
    }

    const session = activeSessions.get(userId);
    
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    if (session.deviceId !== deviceId) {
      return res.status(403).json({ error: "Device mismatch" });
    }

    // Mettre à jour la session
    session.tokens = parseFloat(tokens);
    session.lastActive = new Date();
    
    // Sauvegarder dans Google Sheets
    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: "Sessions!A2:D",
      valueInputOption: "USER_ENTERED",
      resource: {
        values: [[
          userId,
          tokens,
          new Date().toISOString(),
          deviceId
        ]]
      }
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Update session error:', error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Ajoutez cette route avant le endpoint /claim
app.post('/api/referrals', async (req, res) => {
  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ error: "USER_ID_REQUIRED" });
  }

  try {
    // Récupération données utilisateur
    const user = await getUserData(userId);
    if (!user) {
      return res.status(404).json({ error: "USER_NOT_FOUND" });
    }

    // Récupération parrainages
    const referralsData = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: "Referrals!A2:D"
    });

    const referrals = referralsData.data.values?.filter(row => row[0] === user.referralCode) || [];

    res.json({
      referralUrl: `https://t.me/${process.env.BOT_USERNAME}?start=ref_${userId}`,
      totalReferrals: referrals.length,
      totalEarned: referrals.reduce((sum, r) => sum + (parseInt(r[1]) || 0), 0),
      referralCode: user.referralCode
    });

  } catch (err) {
    console.error('Referrals error:', err);
    res.status(500).json({ 
      error: "LOAD_FAILED",
      message: "Échec du chargement" 
    });
  }
});

app.get('/api/user-data', async (req, res) => {
  try {
    const userId = req.query.userId;
    if (!userId) return res.status(400).json({ error: "USER_ID_REQUIRED" });

    const usersData = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: "Users!A2:G" // Colonnes A à G
    });

    const user = usersData.data.values?.find(row => row[2]?.toString() === userId.toString());
    if (!user) return res.status(404).json({ error: "USER_NOT_FOUND" });

    res.json({
      username: user[1], // Colonne B (Username)
      balance: user[3],  // Colonne D (Balance)
      lastClaim: user[4], // Colonne E (Last_Claim_Time)
      mining_speed: parseFloat(user[6]) || 1 // Colonne G (Mining_Speed)
    });
  } catch (err) {
    console.error('User data error:', err);
    res.status(500).json({ error: "SERVER_ERROR" });
  }
});

// Endpoint Dashboard
app.get('/api/dashboard', async (req, res) => {
  try {
    const userId = req.query.userId;
    const userData = await getUserData(userId); // À implémenter
    res.json({
	username: userData.username,
	balance: userData.balance,
	last_claim: userData.lastClaim,
	miningSpeed: userData.mining_speed
});

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Endpoint Tasks
app.get('/api/tasks', async (req, res) => {
  try {
    const tasksData = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: "Tasks!A2:E" // ID, Description, Image, Reward, Statut
    });

    const tasks = (tasksData.data.values || []).map(row => ({
      id: row[0],
      title: row[1],
      image: row[2],
      reward: row[3],
      status: row[4]
    })).filter(task => task.status === 'ACTIVE'); // Filtrer seulement les tâches actives

    res.json(tasks);
  } catch (err) {
    console.error('Tasks error:', err);
    res.status(500).json({ error: "Failed to load tasks" });
  }
});

// [CLAIM] Enregistrement avec limite de 60 minutes
app.post('/claim', async (req, res) => {
  const { userId, deviceId, miningTime } = req.body;

  // Validation
  if (!userId || !deviceId || isNaN(miningTime)) {
    return res.status(400).json({ error: "Invalid data" });
  }

  try {
    const session = activeSessions.get(userId);
    if (!session || session.deviceId !== deviceId) {
      return res.status(403).json({ error: "Invalid or expired session" });
    }

    // Récupération des données utilisateur
    const usersData = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: "Users!A2:G"
    });

    const userRow = usersData.data.values.findIndex(row => row[2] === userId);
    if (userRow === -1) return res.status(404).json({ error: "User not found" });

    const user = usersData.data.values[userRow];
    const miningSpeed = parseFloat(user[6]) || 1;

    // Appliquer limite à 60 minutes
    const effectiveMinutes = Math.min(parseInt(miningTime), 60);
    const tokensToClaim = effectiveMinutes * miningSpeed;

    // Mettre à jour solde
    const currentBalance = parseInt(user[3]) || 0;
    const newBalance = currentBalance + tokensToClaim;

    await sheets.spreadsheets.values.update({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: `Users!D${userRow + 2}`, // Colonne D = solde
      valueInputOption: "USER_ENTERED",
      resource: { values: [[newBalance]] }
    });

    // Enregistrement transaction
    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: "Transactions!A2:D",
      valueInputOption: "USER_ENTERED",
      resource: {
        values: [[
          userId,
          tokensToClaim,
          "CLAIM",
          new Date().toLocaleString('fr-FR')
        ]]
      }
    });

    // Supprimer la session car déjà utilisée
    activeSessions.delete(userId);

    return res.json({
  status: "OK",
  claimed: tokensToClaim,
  balance: newBalance,  // Assurez-vous que cette variable contient le nouveau solde
  message: `Vous avez revendiqué ${tokensToClaim} tokens`
});

  } catch (err) {
    console.error('Claim error:', err);
    return res.status(500).json({ error: "Server error" });
  }
});



// Webhook bot
app.use(bot.webhookCallback('/bot'));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// Start server
initializeApp();
