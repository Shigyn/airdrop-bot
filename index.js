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
    'https://t.me/CRYPTORATS_bot'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Telegram-Data', 'Authorization'],
  credentials: true,
  exposedHeaders: ['Content-Length', 'X-Request-Id']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

const initializeApp = async () => {
  try {
    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(Buffer.from(process.env.GOOGLE_CREDS_B64, 'base64').toString()),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    sheets = google.sheets({ version: 'v4', auth });

    await initGoogleSheets();
    sheetsInitialized = true;
    console.log('Server ready');
    app.listen(PORT, () => console.log(`Running on port ${PORT}`));
  } catch (err) {
    console.error('Init failed:', err);
    process.exit(1);
  }
};

app.post('/sync-session', (req, res) => {
  const { userId, deviceId } = req.body;
  const session = activeSessions.get(userId);

  if (!session) return res.json({ status: 'NO_SESSION' });
  if (session.deviceId !== deviceId) {
    return res.json({
      status: 'DEVICE_MISMATCH',
      sessionStart: session.startTime
    });
  }

  session.lastActive = new Date();
  res.json({
    status: 'SYNCED',
    sessionStart: session.startTime,
    tokens: session.tokens
  });
});

app.post('/check-session', (req, res) => {
  const { userId, deviceId } = req.body;

  if (!userId || !deviceId) return res.status(400).json({ error: "Missing parameters" });

  const session = activeSessions.get(userId);
  if (!session) return res.json({ valid: false, message: "No active session" });

  if (session.deviceId !== deviceId) {
    return res.json({
      valid: false,
      message: "Device mismatch",
      sessionDevice: session.deviceId,
      requestDevice: deviceId
    });
  }

  const elapsedMinutes = (Date.now() - session.startTime) / (1000 * 60);
  const remaining = Math.max(0, 60 - elapsedMinutes);

  res.json({
    valid: remaining > 0,
    startTime: session.startTime,
    remainingMinutes: remaining,
    tokens: session.tokens || 0
  });
});

// Ajoutez ce middleware pour vérifier l'authentification
app.use('/start-session', (req, res, next) => {
  const telegramData = req.headers['telegram-data'];
  if (!telegramData) {
    return res.status(401).json({ 
      error: "AUTH_REQUIRED",
      message: "Telegram authentication data missing"
    });
  }
  next();
});

app.post('/start-session', async (req, res) => {
  try {
    const { userId, deviceId } = req.body;
    
    // Validation
    if (!userId || !deviceId) {
      return res.status(400).json({ 
        error: "INVALID_REQUEST",
        message: "User ID and device ID are required" 
      });
    }

    const MAX_MINUTES = 60;
    const existingSession = activeSessions.get(userId);
    const now = Date.now();

    // Si session existante
    if (existingSession) {
      // Vérifier si c'est le même appareil
      if (existingSession.deviceId !== deviceId) {
        return res.status(403).json({
          error: "DEVICE_MISMATCH",
          message: "Session already started on another device"
        });
      }

      // Calculer le temps écoulé (en minutes)
      const elapsedMinutes = (now - existingSession.startTime) / (1000 * 60);
      
      // Si la session a dépassé 60 minutes, la réinitialiser
      if (elapsedMinutes >= MAX_MINUTES) {
        existingSession.startTime = now; // Reset le timer
        existingSession.totalMinutes = 0;
        
        return res.json({
          status: "SESSION_RESET",
          message: "New session started (previous session expired)",
          startTime: now,
          remainingMinutes: MAX_MINUTES
        });
      }

      // Si la session est toujours active
      return res.json({
        status: "SESSION_RESUMED",
        message: `Existing session (${Math.floor(MAX_MINUTES - elapsedMinutes)} minutes remaining)`,
        startTime: existingSession.startTime,
        remainingMinutes: MAX_MINUTES - elapsedMinutes
      });
    }

    // Nouvelle session
    activeSessions.set(userId, {
      startTime: now,
      lastActive: now,
      deviceId,
      totalMinutes: 0,
      tokensMined: 0
    });

    res.json({
      status: "SESSION_STARTED",
      message: "New mining session started",
      startTime: now,
      remainingMinutes: MAX_MINUTES
    });

  } catch (error) {
    console.error('Start session error:', error);
    res.status(500).json({ 
      error: "SERVER_ERROR",
      message: "Internal server error",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

app.post('/update-session', async (req, res) => {
  const { userId, tokens, deviceId } = req.body;

  try {
    if (!userId || !tokens || !deviceId) {
      return res.status(400).json({ error: "Missing parameters" });
    }

    const session = activeSessions.get(userId);
    if (!session) return res.status(404).json({ error: "Session not found" });
    if (session.deviceId !== deviceId) return res.status(403).json({ error: "Device mismatch" });

    session.tokens = parseFloat(tokens);
    session.lastActive = new Date();

    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: "Sessions!A2:D",
      valueInputOption: "USER_ENTERED",
      resource: {
        values: [[ userId, tokens, new Date().toISOString(), deviceId ]]
      }
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Update session error:', error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Ajoutez ce middleware avant vos routes
app.use('/api', (req, res, next) => {
  if (!req.headers['telegram-data']) {
    return res.status(401).json({
      error: "TELEGRAM_AUTH_REQUIRED",
      message: "Telegram authentication data missing"
    });
  }
  next();
});

app.post('/api/validate-auth', (req, res) => {
  const { initData } = req.body;
  
  if (!initData) {
    return res.status(400).json({ error: "Telegram auth data missing" });
  }

  // Ici vous devriez valider les données d'authentification
  // Pour le moment, nous allons juste extraire l'user ID
  try {
    const params = new URLSearchParams(initData);
    const user = JSON.parse(params.get('user'));
    
    if (!user?.id) {
      return res.status(401).json({ error: "Invalid Telegram auth data" });
    }
    
    res.json({ 
      userId: user.id,
      username: user.username || `user_${user.id}`,
      authDate: new Date(params.get('auth_date') * 1000)
    });
  } catch (error) {
    console.error('Auth validation error:', error);
    res.status(500).json({ error: "Failed to validate auth" });
  }
});

app.post('/api/referrals', async (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: "USER_ID_REQUIRED" });

  try {
    const user = await getUserData(userId);
    if (!user) return res.status(404).json({ error: "USER_NOT_FOUND" });

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
    res.status(500).json({ error: "LOAD_FAILED", message: "Échec du chargement" });
  }
});

app.get('/api/user-data', async (req, res) => {
  try {
    // Vérifiez les en-têtes d'authentification
    const telegramData = req.headers['telegram-data'];
    const userId = req.query.userId;
    
    console.log(`User data request for: ${userId}`); // Debug
    console.log('Telegram auth data:', telegramData); // Debug

    if (!userId) {
      return res.status(400).json({ 
        error: "USER_ID_REQUIRED",
        message: "User ID is required"
      });
    }

    // Validation basique des données Telegram (à améliorer)
    if (!telegramData) {
      return res.status(401).json({
        error: "UNAUTHORIZED",
        message: "Telegram auth data missing"
      });
    }

    // Chargez les données depuis Google Sheets
    const usersData = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: "Users!A2:G"
    });

    const user = usersData.data.values?.find(row => 
      row[2]?.toString() === userId.toString()
    );

    if (!user) {
      return res.status(404).json({ 
        error: "USER_NOT_FOUND",
        message: "User not found in database"
      });
    }

    // Réponse réussie
    res.json({
      username: user[1] || `user_${userId}`,
      balance: parseInt(user[3]) || 0,
      lastClaim: user[4] || null,
      mining_speed: parseFloat(user[6]) || 1
    });

  } catch (err) {
    console.error('Server error in /api/user-data:', err);
    res.status(500).json({ 
      error: "SERVER_ERROR",
      message: "Internal server error",
      details: process.env.NODE_ENV === 'development' ? err.message : null
    });
  }
});

app.get('/api/dashboard', async (req, res) => {
  try {
    const userId = req.query.userId;
    if (!userId) return res.status(400).json({ error: "USER_ID_REQUIRED" });

    const userData = await getUserData(userId);
    if (!userData) return res.status(404).json({ error: "USER_NOT_FOUND" });

    res.json({
      username: userData.username,
      balance: parseInt(userData.balance) || 0,
      last_claim: userData.lastClaim,
      miningSpeed: userData.mining_speed
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/tasks', async (req, res) => {
  try {
    const tasksData = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: "Tasks!A2:E"
    });

    const tasks = (tasksData.data.values || []).map(row => ({
      id: row[0],
      title: row[1],
      image: row[2],
      reward: row[3],
      status: row[4]
    })).filter(task => task.status === 'ACTIVE');

    res.json(tasks);
  } catch (err) {
    console.error('Tasks error:', err);
    res.status(500).json({ error: "Failed to load tasks" });
  }
});

app.post('/claim', async (req, res) => {
  const { userId, deviceId, miningTime } = req.body;
  
  try {
    // Vérifier la session existante
    const session = activeSessions.get(userId);
    if (!session) {
      return res.status(403).json({
        error: "NO_ACTIVE_SESSION",
        message: "No active mining session"
      });
    }

    // Vérifier l'appareil
    if (session.deviceId !== deviceId) {
      return res.status(403).json({
        error: "DEVICE_MISMATCH",
        message: "Different device"
      });
    }

    // Calculer les tokens basés sur le temps de minage
    const tokens = Math.floor(miningTime * 1); // 1 token par minute
    session.tokensMined += tokens;
    session.totalMinutes += miningTime;

    // Mettre à jour les données utilisateur
    const userData = await getUserData(userId);
    if (!userData) {
      return res.status(404).json({
        error: "USER_NOT_FOUND",
        message: "User data not found"
      });
    }

    // Mettre à jour le solde
    userData.balance = (userData.balance || 0) + tokens;
    userData.lastClaim = new Date().toISOString();

    // Sauvegarder les données
    await sheets.spreadsheets.values.update({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: "Users!A2:Z",
      valueInputOption: "RAW",
      resource: {
        values: [[
          userId,
          userData.username,
          userData.balance,
          userData.lastClaim,
          userData.referralCount,
          userData.totalTokens
        ]]
      }
    });

    // Enregistrer la transaction
    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: "Transactions!A2:D",
      valueInputOption: "USER_ENTERED",
      resource: {
        values: [[
          userId,
          tokens,
          "CLAIM",
          new Date().toISOString()
        ]]
      }
    });

    // Réinitialiser le timer de la session
    session.startTime = Date.now();

    res.json({
      success: true,
      claimed: tokens,
      balance: userData.balance,
      message: `${tokens} tokens claimés`
    });

  } catch (error) {
    console.error('Claim error:', error);
    res.status(500).json({ 
      error: "SERVER_ERROR",
      message: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

app.use(bot.webhookCallback('/bot'));

// Configuration des fichiers statiques
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, path) => {
    if (path.endsWith('.png') || path.endsWith('.ico')) {
      res.set('Cache-Control', 'public, max-age=86400');
    }
  }
}));

// Route par défaut
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Middleware pour les routes non trouvées
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

// Gestion des erreurs
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal Server Error' });
});

// Initialisation de l'application
initializeApp().catch(console.error);