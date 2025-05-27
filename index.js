require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const { google } = require('googleapis');
const fs = require('fs');

const app = express();
const activeSessions = new Map();
let sheets = null;
let sheetsInitialized = false;

const { bot } = require('./bot');
const { initGoogleSheets, readTasks, getUserData } = require('./googleSheets');

// Configuration du port
const port = process.env.PORT || 8080;

// Middlewares
app.use(cors({
  origin: function (origin, callback) {
    const allowedOrigins = [
      'https://web.telegram.org',
      'https://t.me',
      'https://airdrop-bot-soy1.onrender.com'
    ];
    
    if (!origin || allowedOrigins.some(allowed => origin.includes(allowed))) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Telegram-Data', 'Authorization', 'Accept'],
  credentials: true,
  exposedHeaders: ['Content-Length', 'X-Request-Id', 'Cache-Control']
}));

// Fichiers statiques
app.use(express.static('public', {
  setHeaders: (res, path) => {
    res.setHeader('Cache-Control', 'public, max-age=86400');
  },
  fallthrough: false
}));

// Middleware d'authentification Telegram
app.use('/api', async (req, res, next) => {
  try {
    const telegramData = req.headers['telegram-data'];
    if (!telegramData) {
      return res.status(401).json({
        error: "AUTH_REQUIRED",
        message: "Telegram authentication data is required"
      });
    }

    let initData;
    try {
      initData = JSON.parse(telegramData);
    } catch (e) {
      return res.status(401).json({
        error: "INVALID_AUTH_FORMAT",
        message: "Telegram data is not valid JSON"
      });
    }

    if (!initData?.user?.id) {
      return res.status(401).json({
        error: "INVALID_AUTH_DATA",
        message: "Invalid Telegram user data"
      });
    }

    req.telegramUser = initData.user;
    next();
  } catch (error) {
    console.error('Telegram auth error:', error);
    res.status(401).json({
      error: "AUTH_VALIDATION_FAILED",
      message: "Failed to validate Telegram authentication"
    });
  }
});

// Routes de base
app.get('/api/test', (req, res) => {
  res.json({
    status: 'ok',
    time: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'production'
  });
});

app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1d',
  setHeaders: (res, path) => {
    if (path.endsWith('.js')) {
      res.setHeader('Cache-Control', 'public, max-age=31536000');
    } else if (path.endsWith('.css')) {
      res.setHeader('Cache-Control', 'public, max-age=31536000');
    }
  },
  fallthrough: false
}));

// Routes principales
app.get(['/', '/dashboard', '/bot'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Parser JSON
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Route API user-data corrigée
app.post('/api/user-data', async (req, res) => {
  try {
    const telegramData = req.headers['telegram-data'];
    if (!telegramData) {
      return res.status(401).json({ 
        success: false,
        error: 'AUTH_REQUIRED',
        message: 'Telegram authentication data is required'
      });
    }

    let initData;
    try {
      initData = JSON.parse(telegramData);
    } catch (e) {
      return res.status(400).json({ 
        success: false,
        error: 'INVALID_DATA',
        message: 'Invalid Telegram data format'
      });
    }

    const userId = initData?.user?.id;
    if (!userId) {
      return res.status(401).json({ 
        success: false,
        error: 'INVALID_USER',
        message: 'Invalid user data'
      });
    }

    // Logique de récupération des données utilisateur...
    const userData = await getUserData(userId) || {
      username: initData.user?.username || `user_${userId}`,
      balance: 0,
      miningSpeed: 0
    };

    res.json({
      success: true,
      data: userData
    });

  } catch (error) {
    console.error('User data endpoint error:', error);
    res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Internal server error'
    });
  }
});

// Autres routes API
app.get('/api/tasks', async (req, res) => {
  try {
    const tasks = await readTasks();
    res.json({
      success: true,
      data: tasks
    });
  } catch (error) {
    console.error('Error getting tasks:', error);
    res.status(500).json({ 
      success: false,
      error: error.message
    });
  }
});

app.get('/api/tasks/:taskId', async (req, res) => {
  try {
    const tasks = await readTasks();
    const task = tasks.find(t => t.id === req.params.taskId);
    
    if (!task) {
      return res.status(404).json({
        success: false,
        error: 'Task not found'
      });
    }

    res.json({
      success: true,
      data: task
    });
  } catch (error) {
    console.error('Error getting task:', error);
    res.status(500).json({ 
      success: false,
      error: error.message
    });
  }
});

app.get('/api/referral', async (req, res) => {
  try {
    const userId = req.query.userId;
    if (!userId) {
      return res.status(400).json({ 
        success: false,
        error: 'userId is required'
      });
    }

    const referralInfo = await sheets.getReferralInfo(userId);
    res.json({
      success: true,
      data: referralInfo
    });
  } catch (error) {
    console.error('Error getting referral info:', error);
    res.status(500).json({ 
      success: false,
      error: error.message
    });
  }
});

// Routes de session
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

// Initialisation de l'application
const initializeApp = async () => {
  try {
    // Configuration du serveur
    app.set('trust proxy', true);
    app.set('keep-alive-timeout', 30000);
    app.set('timeout', 30000);

    // Gestion du verrou d'instance
    const lockFile = path.join('.temp', '.lock');
    try {
      if (!fs.existsSync('.temp')) fs.mkdirSync('.temp');
      
      if (fs.existsSync(lockFile)) {
        const [pid] = fs.readFileSync(lockFile, 'utf8').split('|');
        try {
          process.kill(parseInt(pid), 0);
          console.error('Another instance is already running. Exiting...');
          process.exit(1);
        } catch (e) {
          fs.unlinkSync(lockFile);
        }
      }
      
      fs.writeFileSync(lockFile, `${process.pid}|${Date.now()}`);
      
      process.on('exit', () => {
        if (fs.existsSync(lockFile)) fs.unlinkSync(lockFile);
      });
    } catch (err) {
      console.error('Error managing lock file:', err);
      process.exit(1);
    }

    // Initialisation de Google Sheets (version optimisée)
    try {
      sheets = await initGoogleSheets();
      sheetsInitialized = true;
      
      // Test de connexion
      await sheets.spreadsheets.values.get({
        spreadsheetId: process.env.GOOGLE_SHEET_ID,
        range: 'Users!A1'
      });
      
      console.log('Google Sheets initialized and connection verified');
    } catch (sheetsError) {
      console.error('Google Sheets initialization failed:', sheetsError);
      sheetsInitialized = false;
      // Vous pouvez choisir de continuer en mode dégradé ou arrêter l'application
      // throw sheetsError; // Décommentez pour arrêter si Sheets est essentiel
    }

    // Configuration du webhook
    await bot.telegram.setWebhook(`${process.env.PUBLIC_URL}/bot`);

    // Démarrage du serveur
    const server = app.listen(port, () => {
      console.log(`Server running on port ${port}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'production'}`);
      console.log(`Sheets initialized: ${sheetsInitialized}`);
    });

    // Gestion des signaux
    process.on('SIGTERM', async () => {
      console.log('SIGTERM received. Closing server...');
      await new Promise(resolve => server.close(resolve));
      process.exit(0);
    });

    return server;
  } catch (error) {
    console.error('Error initializing app:', error);
    process.exit(1);
  }
};

    // Configuration du webhook
	await bot.telegram.setWebhook(`${process.env.PUBLIC_URL}/bot`);

    // Démarrage du serveur
    const server = app.listen(port, () => {
      console.log(`Server running on port ${port}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'production'}`);
    });

    // Gestion des signaux
    process.on('SIGTERM', async () => {
      console.log('SIGTERM received. Closing server...');
      await new Promise(resolve => server.close(resolve));
      process.exit(0);
    });

    return server;
  } catch (error) {
    console.error('Error initializing app:', error);
    process.exit(1);
  }
};

// Middleware final
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

app.use(bot.webhookCallback('/bot'));

app.use((req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal Server Error' });
});

// Démarrer l'application
(async () => {
  await new Promise(resolve => setTimeout(resolve, 5000));
  await initializeApp();
})();

module.exports = app;