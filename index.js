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
    
    // Validation supplémentaire
    if (!userId || !deviceId) {
      return res.status(400).json({ 
        error: "INVALID_REQUEST",
        message: "Missing parameters" 
      });
    }

    // Votre logique existante de session...
    const MAX_MINUTES = 60;
    const existingSession = activeSessions.get(userId);
    const now = Date.now();

    if (existingSession) {
      // ... (gardez votre logique existante)
    }

    activeSessions.set(userId, {
      startTime: now,
      lastActive: now,
      deviceId,
      totalMinutes: 0
    });

    res.json({
      status: "SESSION_STARTED",
      startTime: now,
      remainingMinutes: MAX_MINUTES
    });

  } catch (error) {
    console.error('Start session error:', error);
    res.status(500).json({ 
      error: "SERVER_ERROR",
      message: "Internal server error" 
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
  if (!userId || !deviceId || isNaN(miningTime)) {
    return res.status(400).json({ error: "Invalid data" });
  }

  try {
    const session = activeSessions.get(userId);
    if (!session || session.deviceId !== deviceId) {
      return res.status(403).json({ error: "Invalid or expired session" });
    }

    const usersData = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: "Users!A2:G"
    });

    const userRow = usersData.data.values.findIndex(row => row[2] === userId);
    if (userRow === -1) return res.status(404).json({ error: "User not found" });

    const user = usersData.data.values[userRow];
    const miningSpeed = parseFloat(user[6]) || 1;

    const effectiveMinutes = Math.min(parseInt(miningTime), 60);
    const tokensToClaim = effectiveMinutes * miningSpeed;

    const currentBalance = parseInt(user[3]) || 0;
    const newBalance = currentBalance + tokensToClaim;

    await sheets.spreadsheets.values.update({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: `Users!D${userRow + 2}`,
      valueInputOption: "USER_ENTERED",
      resource: { values: [[newBalance]] }
    });

    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: "Transactions!A2:D",
      valueInputOption: "USER_ENTERED",
      resource: {
        values: [[ userId, tokensToClaim, "CLAIM", new Date().toLocaleString('fr-FR') ]]
      }
    });

    activeSessions.delete(userId);

    return res.json({
      status: "OK",
      claimed: tokensToClaim,
      balance: newBalance,
      message: `Vous avez revendiqué ${tokensToClaim} tokens`
    });
  } catch (err) {
    console.error('Claim error:', err);
    return res.status(500).json({ error: "Server error" });
  }
});

app.use(bot.webhookCallback('/bot'));
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

initializeApp();