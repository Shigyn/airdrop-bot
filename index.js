require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const { bot, webhookCallback } = require('./bot');
const { initGoogleSheets, readTasks, getUserData } = require('./googleSheets');
const { google } = require('googleapis');

const app = express();
const PORT = process.env.PORT || 8080; // Port par défaut pour Render
const activeSessions = new Map();
let sheets;
let sheetsInitialized = false; // ajouté pour la santé du service

// Middlewares
// Configuration CORS plus permissive pour le développement
app.use(cors({
  origin: true, // Accepte toutes les origines
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Telegram-Data', 'Authorization'],
  credentials: true,
  exposedHeaders: ['Content-Length', 'X-Request-Id']
}));

// Configuration des fichiers statiques
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1d', // Cache pendant 1 jour
  setHeaders: (res, path) => {
    if (path.endsWith('.js')) {
      res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache JS pendant 1 an
    } else if (path.endsWith('.css')) {
      res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache CSS pendant 1 an
    }
  }
}));

// Parser JSON avec taille maximale augmentée
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Middleware de logging amélioré
app.use((req, res, next) => {
  const startTime = Date.now();
  const safeBody = { ...req.body };
  if (safeBody.tokens) safeBody.tokens = '***';
  if (safeBody.Authorization) safeBody.Authorization = '***';
  
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`, {
    headers: req.headers,
    body: safeBody,
    query: req.query
  });
  
  res.on('finish', () => {
    const responseTime = Date.now() - startTime;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} completed in ${responseTime}ms`);
  });
  
  next();
});

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
    // Vérifiez que toutes les variables d'environnement nécessaires sont présentes
    if (!process.env.GOOGLE_CREDS_B64) {
      throw new Error('GOOGLE_CREDS_B64 is required');
    }
    if (!process.env.BOT_TOKEN) {
      throw new Error('BOT_TOKEN is required');
    }

    // Configuration des timeouts
    app.setTimeout(30000); // 30 secondes
    app.set('socket timeout', 30000); // 30 secondes

    // Configuration des limites de requêtes
    app.use(express.json({ limit: '50mb' }));
    app.use(express.urlencoded({ limit: '50mb', extended: true }));

    // Initialisation de Google Sheets
    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(Buffer.from(process.env.GOOGLE_CREDS_B64, 'base64').toString()),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    try {
      sheets = google.sheets({ version: 'v4', auth });
      await initGoogleSheets();
      sheetsInitialized = true;
      console.log('Google Sheets initialized successfully');
    } catch (error) {
      console.error('Error initializing Google Sheets:', error);
      throw error;
    }

    // Initialisation du bot
    try {
      bot.launch();
      console.log('Bot started successfully');
    } catch (error) {
      console.error('Error starting bot:', error);
      throw error;
    }

    // Démarrez le serveur
    const server = app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'production'}`);
      console.log(`Google Sheets initialized: ${sheetsInitialized}`);
    });

    // Gestion des erreurs de serveur
    server.on('error', (error) => {
      console.error('Server error:', error);
      process.exit(1);
    });

    // Gestion de la fermeture propre
    process.on('SIGTERM', async () => {
      console.log('SIGTERM received. Closing server...');
      
      try {
        // Fermez le bot
        await bot.stop('SIGTERM');
        
        // Fermez toutes les connexions actives
        for (const [userId, session] of activeSessions) {
          if (session?.socket) {
            session.socket.end();
          }
        }
        
        // Fermez le serveur
        await new Promise((resolve) => {
          server.close(() => {
            console.log('Server closed');
            resolve();
          });
        });

        // Attendez un peu pour que toutes les opérations se terminent
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        process.exit(0);
      } catch (error) {
        console.error('Error during graceful shutdown:', error);
        process.exit(1);
      }
    });

    // Gestion des erreurs
    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled Rejection at:', promise, 'reason:', reason);
      process.exit(1);
    });

    process.on('uncaughtException', (error) => {
      console.error('Uncaught Exception:', error);
      process.exit(1);
    });

    return { server, auth, sheets };
  } catch (error) {
    console.error('Error initializing app:', error);
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

// Endpoint de test pour vérifier la configuration de Telegram
app.get('/api/test-telegram', (req, res) => {
  const telegramData = {
    isTelegram: !!window.Telegram,
    isWebApp: !!window.Telegram?.WebApp,
    initData: window.Telegram?.WebApp?.initData,
    initDataUnsafe: window.Telegram?.WebApp?.initDataUnsafe
  };
  
  res.json({
    status: 'success',
    data: telegramData
  });
});

app.post('/api/validate-auth', (req, res) => {
  try {
    const { initData } = req.body;
    
    if (!initData) {
      return res.status(400).json({ 
        error: "AUTH_DATA_MISSING",
        message: "Telegram auth data missing"
      });
    }

    // Vérifier que les données sont valides
    const params = new URLSearchParams(initData);
    const user = JSON.parse(params.get('user'));
    const authDate = params.get('auth_date');
    const hash = params.get('hash');
    
    if (!user?.id || !authDate || !hash) {
      return res.status(401).json({ 
        error: "INVALID_AUTH_DATA",
        message: "Invalid Telegram auth data"
      });
    }

    // Vérifier que l'auth_date est récent (moins de 10 minutes)
    const now = Math.floor(Date.now() / 1000);
    if (now - authDate > 600) {
      return res.status(401).json({ 
        error: "AUTH_EXPIRED",
        message: "Authentication expired"
      });
    }

    // Vérifier l'intégrité des données avec le hash
    const checkString = Object.entries(params)
      .filter(([key]) => key !== 'hash')
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');

    const secretKey = Buffer.from(process.env.BOT_TOKEN || '', 'utf8');
    const hmac = crypto.createHmac('sha256', secretKey);
    hmac.update(checkString);
    const calculatedHash = hmac.digest('hex');

    if (calculatedHash !== hash) {
      return res.status(401).json({ 
        error: "INVALID_HASH",
        message: "Invalid authentication hash"
      });
    }

    // Authentification réussie
    res.json({ 
      userId: user.id,
      username: user.username || `user_${user.id}`,
      authDate: new Date(authDate * 1000),
      success: true
    });

  } catch (error) {
    console.error('Auth validation error:', error);
    res.status(500).json({ 
      error: "AUTH_VALIDATION_FAILED",
      message: "Failed to validate authentication"
    });
  }
});

// Endpoint pour récupérer les données utilisateur
app.get('/api/user-data', async (req, res) => {
  try {
    const { userId } = req.query;
    
    if (!userId) {
      return res.status(400).json({ error: "USER_ID_REQUIRED" });
    }

    // Récupérer les données utilisateur depuis Google Sheets
    const [userRow] = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: `Users!A2:D`,
      majorDimension: 'ROWS'
    });

    const userData = userRow.values?.find(row => row[0] === userId);
    
    if (!userData) {
      return res.status(404).json({
        error: "USER_NOT_FOUND",
        message: "User data not found"
      });
    }

    // Récupérer les données de session
    const session = activeSessions.get(userId);
    const miningSpeed = session ? 1 : 0; // Vitesse de minage par défaut

    // Formatage des données
    const user = {
      userId: userData[0],
      username: userData[1] || `user_${userId}`,
      balance: parseFloat(userData[2]) || 0,
      lastClaim: userData[3] || 'Never',
      miningSpeed: miningSpeed,
      miningTime: session ? session.totalMinutes : 0
    };

    res.json(user);
  } catch (error) {
    console.error('Error getting user data:', error);
    res.status(500).json({
      error: "SERVER_ERROR",
      message: "Failed to fetch user data"
    });
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