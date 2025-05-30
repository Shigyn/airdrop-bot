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
    // Config serveur, lockfile, etc...

    if (!sheetsInitialized) {
      sheets = await initGoogleSheets();

      // Test de connexion amélioré
      // Test de connexion amélioré
let testResponse;
try {
  testResponse = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: 'Users!A1:Z1'
  });

  // Vérification plus robuste de la réponse
  if (!testResponse || !testResponse.data) {
    console.error('Google Sheets test failed - No response data');
    throw new Error('Google Sheets returned no data - check your API credentials');
  }

  const values = testResponse.data.values;
  if (!values || !Array.isArray(values)) {
    console.error('Google Sheets test failed - Invalid values format');
    throw new Error('Google Sheets returned invalid data format');
  }

  console.log('Google Sheets initialized and tested successfully');
} catch (err) {
  console.error('Google Sheets test query failed:', {
    message: err.message,
    fullError: err,
    response: testResponse ? testResponse.data : null
  });
  throw err;
}

      try {
        await bot.telegram.setWebhook(`${process.env.PUBLIC_URL}/bot`);
        console.log('Webhook configured successfully');
      } catch (webhookError) {
        console.error('Webhook configuration failed:', webhookError);
        throw webhookError;
      }

      // Démarrage serveur
      const server = app.listen(port, () => {
        console.log(`Server running on port ${port}`);
        console.log(`Environment: ${process.env.NODE_ENV || 'production'}`);
      });

      process.on('SIGTERM', async () => {
        console.log('SIGTERM received. Closing server...');
        await new Promise(resolve => server.close(resolve));
        process.exit(0);
      });

      sheetsInitialized = true; // n’oublie pas ça

      return server;
    }

  } catch (error) {
    console.error('Error initializing app:', error);
    process.exit(1);
  }
}

// Démarrage de l'application
(async () => {
  try {
    await initializeApp();
    console.log('Application started successfully');
  } catch (startupError) {
    console.error('Failed to start application:', startupError);
    process.exit(1);
  }
})();

module.exports = app;