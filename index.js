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

// Ajoutez cette route avant le endpoint /claim
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
      balance: userData.balance,
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
      range: "Tasks!A2:E"
    });

    const tasks = (tasksData.data.values || []).map(row => ({
      id: row[0],       // ID
      title: row[1],    // Description
      image: row[2],    // Image
      reward: row[3],   // Reward
      status: row[4]    // Statut
    })).filter(task => task.status === 'ACTIVE'); // Modifiez ce filtre selon votre besoin

    res.json(tasks);
  } catch (err) {
    console.error('Tasks error:', err);
    res.status(500).json({ error: "SERVER_ERROR" });
  }
});

// [CLAIM] Enregistrement avec limite de 60 minutes
app.post('/claim', async (req, res) => {
  const { userId, deviceId, tokens, username } = req.body;
  const MAX_MINUTES = 60; // Durée maximale de session

  // 1. Validation des données entrantes (version courte)
  if (!userId || !deviceId || !tokens) {
    return res.status(400).json({
      error: "MISSING_DATA",
      message: "Champs manquants"
    });
  }

  // 2. Vérification de session (optimisée)
  const session = activeSessions.get(userId);
  if (!session) {
    return res.status(403).json({
      error: "NO_SESSION",
      message: "Session expirée"
    });
  }

  // 3. Vérification appareil (version courte)
  if (session.deviceId !== deviceId) {
    return res.status(403).json({
      error: "DEVICE_ERR",
      message: "Appareil invalide"
    });
  }

  // 4. Calcul du temps de session
  const now = Date.now();
  const elapsedMinutes = (now - session.lastActive) / (1000 * 60);
  const totalUsedMinutes = session.totalMinutes + elapsedMinutes;

  try {
    // 5. Validation tokens (version robuste)
    const points = Math.floor(parseFloat(tokens));
    if (isNaN(points) || points <= 0) {
      return res.status(400).json({
        error: "INVALID_TOKENS",
        message: "Tokens invalides"
      });
    }

    // 6. Utiliser l'instance globale sheets au lieu de réinitialiser
    const timestamp = new Date().toISOString();

    // 7. Enregistrement transaction (optimisé)
    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: "Transactions!A2:E",
      valueInputOption: "USER_ENTERED",
      resource: { values: [[
        timestamp,
        userId,
        "AIRDROP",
        points,
        "COMPLETED"
      ]] }
    });

    // 8. Mise à jour utilisateur (version sécurisée)
    const usersData = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: "Users!A2:G"
    });
    const users = usersData.data.values || [];

    const userIndex = users.findIndex(row => row[2]?.toString() === userId?.toString());
    let newBalance = points;

    if (userIndex >= 0) {
      // Utilisateur existant
      const currentBalance = parseInt(users[userIndex][3]) || 0;
      const miningSpeed = parseFloat(users[userIndex][6]) || 1;
      newBalance = currentBalance + (points * miningSpeed);

      // Mise à jour asynchrone en parallèle
      await Promise.all([
        sheets.spreadsheets.values.update({
          spreadsheetId: process.env.GOOGLE_SHEET_ID,
          range: `Users!D${userIndex + 2}`,
          valueInputOption: "USER_ENTERED",
          resource: { values: [[newBalance]] }
        }),
        sheets.spreadsheets.values.update({
          spreadsheetId: process.env.GOOGLE_SHEET_ID,
          range: `Users!E${userIndex + 2}`,
          valueInputOption: "USER_ENTERED",
          resource: { values: [[timestamp]] }
        })
      ]);

      // 9. Programme de parrainage (optimisé)
      const referralCode = users[userIndex][5];
      if (referralCode) {
        const referrerIndex = users.findIndex(row => row[5] === referralCode);
        if (referrerIndex >= 0) {
          const referralReward = Math.floor(points * 0.1);
          const currentReferrerBalance = parseInt(users[referrerIndex][3]) || 0;

          await sheets.spreadsheets.values.update({
            spreadsheetId: process.env.GOOGLE_SHEET_ID,
            range: `Users!D${referrerIndex + 2}`,
            valueInputOption: "USER_ENTERED",
            resource: { values: [[currentReferrerBalance + referralReward]] }
          });

          await sheets.spreadsheets.values.append({
            spreadsheetId: process.env.GOOGLE_SHEET_ID,
            range: "Referrals!A2:D",
            valueInputOption: "USER_ENTERED",
            resource: { values: [[
              referralCode,
              referralReward,
              timestamp,
              username || "Anonyme"
            ]] }
          });
        }
      }
    } else {
      // Nouvel utilisateur (version simplifiée)
      await sheets.spreadsheets.values.append({
        spreadsheetId: process.env.GOOGLE_SHEET_ID,
        range: "Users!A2:G",
        valueInputOption: "USER_ENTERED",
        resource: { values: [[
          timestamp,
          username || "Anonyme",
          userId,
          newBalance,
          timestamp,
          `REF-${Math.random().toString(36).slice(2, 8)}`,
          1
        ]] }
      });
    }

    // 10. Mise à jour session
    activeSessions.set(userId, {
      ...session,
      lastActive: now,
      totalMinutes: totalUsedMinutes,
      tokens: newBalance
    });

    // 11. Vérification limite durée
    if (totalUsedMinutes >= MAX_MINUTES) {
      activeSessions.delete(userId);
      return res.json({
        status: "LIMIT_REACHED",
        message: "Vous avez atteint la limite de minage de 60 minutes",
        tokens: newBalance
      });
    }

    // 12. Réponse OK
    res.json({
      status: "OK",
      message: "Récompense ajoutée",
      tokens: newBalance
    });
  } catch (err) {
    console.error('Claim error:', err);
    res.status(500).json({
      error: "SERVER_ERROR",
      message: "Erreur lors du traitement de la réclamation"
    });
  }
});

// Vérification session (simplifiée)
app.post('/api/check-session', (req, res) => {
  const { userId, deviceId } = req.body;
  const session = activeSessions.get(userId);

  if (!session) {
    return res.json({ status: "NO_SESSION" });
  }

  if (session.deviceId !== deviceId) {
    return res.json({
      status: "DEVICE_ERR",
      startTime: session.startTime
    });
  }

  res.json({
    status: "SESSION_ACTIVE",
    startTime: session.startTime,
    tokens: session.tokens || 0
  });
});

// Vérification session (alternative)
app.post('/api/verify-session', (req, res) => {
  const { userId, deviceId } = req.body;
  const session = activeSessions.get(userId);

  if (!session) {
    return res.json({ status: "NO_SESSION" });
  }

  if (session.deviceId !== deviceId) {
    return res.json({
      status: "DEVICE_MISMATCH",
      startTime: session.startTime
    });
  }

  res.json({
    status: "SESSION_VALID",
    startTime: session.startTime,
    tokens: session.tokens || 0
  });
});

// Endpoint referrals
app.post('/api/referrals', async (req, res) => {
  const { userId } = req.body;

  try {
    // 1. Récupérer les données utilisateur
    const usersResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: "Users!A2:G"
    });
    
    const users = usersResponse.data.values || [];
    const user = users.find(row => row[2]?.toString() === userId.toString());
    
    if (!user) return res.status(404).json({ error: "USER_NOT_FOUND" });

    // 2. Utiliser directement l'user_id comme référence
    const referralCode = user[2]; // user_id comme code de parrainage
    const referralUrl = `https://t.me/CRYPTORATS_bot?start=${referralCode}`;

    // 3. Récupérer les parrainages existants (filtrés par user_id)
    const referralsResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: "Referrals!A2:D"
    });
    
    const referrals = referralsResponse.data.values || [];
    const userReferrals = referrals.filter(r => r[0] === referralCode);

    res.json({
      success: true,
      referralCode: referralCode,
      referralUrl: referralUrl,
      referredCount: userReferrals.length,
      earned: userReferrals.reduce((sum, r) => sum + (parseInt(r[1]) || 0, 0)
    });
  } catch (err) {
    console.error('Referrals error:', err);
    res.status(500).json({ error: "SERVER_ERROR" });
  }
});

// Webhook bot
app.use(bot.webhookCallback('/bot'));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// Start server
initializeApp();
