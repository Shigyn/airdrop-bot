require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const { google } = require('googleapis');

const app = express();
const activeSessions = new Map();
let sheets = null;
let sheetsInitialized = false

const { bot } = require('./bot');
const { initGoogleSheets, readTasks, getUserData } = require('./googleSheets');

// Configuration du port
const port = process.env.PORT || 8080;

// Middlewares
// Configuration CORS plus restrictive mais correcte
app.use(cors({
  origin: function (origin, callback) {
    // Autorise les requêtes depuis le bot Telegram et l'interface web
    const allowedOrigins = [
      'https://web.telegram.org',
      'https://t.me',
      'https://airdrop-bot-soy1.onrender.com'
    ];
    
    // Vérifie si l'origine est autorisée
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

// Servir les fichiers statiques depuis le dossier public
app.use(express.static('public', {
  setHeaders: (res, path) => {
    // Cache pendant 1 jour
    res.setHeader('Cache-Control', 'public, max-age=86400');
  },
  fallthrough: false // Ne passe pas à la prochaine route si le fichier n'est pas trouvé
}));

// Middleware de vérification de l'authentification Telegram
app.use('/api', async (req, res, next) => {
  try {
    const telegramData = req.headers['telegram-data'];
    if (!telegramData) {
      return res.status(401).json({
        error: "AUTH_REQUIRED",
        message: "Telegram authentication data is required"
      });
    }

    // Essayez de parser les données
    let initData;
    try {
      initData = JSON.parse(telegramData);
    } catch (e) {
      return res.status(401).json({
        error: "INVALID_AUTH_FORMAT",
        message: "Telegram data is not valid JSON"
      });
    }

    if (!initData || !initData.user || !initData.user.id) {
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

// Route de test pour vérifier la configuration
app.get('/api/test', (req, res) => {
  res.json({
    status: 'ok',
    time: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'production'
  });
});

// Configuration des fichiers statiques
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1d', // Cache pendant 1 jour
  setHeaders: (res, path) => {
    if (path.endsWith('.js')) {
      res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache JS pendant 1 an
    } else if (path.endsWith('.css')) {
      res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache CSS pendant 1 an
    }
  },
  fallthrough: false // Ne passe pas à la prochaine route si le fichier n'est pas trouvé
}));

// Route pour la page d'accueil
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Route pour le dashboard
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Route pour le bot
app.get('/bot', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Parser JSON avec taille maximale augmentée
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Routes API
app.post('/api/user-data', async (req, res) => {
  try {
    console.log('Headers received:', req.headers);
    console.log('Body received:', req.body);

    const userId = req.body.userId;
    if (!userId) {
      console.error('userId is required');
      return res.status(400).json({ 
        success: false,
        error: 'userId is required' 
      });
    }

    // Simuler des données si Google Sheets n'est pas configuré
    let userData;
    if (!sheets || !sheetsInitialized) {
  console.warn('Using mock data - Google Sheets not initialized');
  userData = {
    username: `user_${userId}`,
    balance: Math.floor(Math.random() * 100),
    lastClaim: new Date().toISOString()
  };
}
    } else {
      try {
        userData = await getUserData(userId);
      } catch (error) {
        console.error('Error fetching from Google Sheets:', error);
        return res.status(500).json({
          success: false,
          error: 'Failed to fetch user data'
        });
      }
    }

    if (!userData) {
      console.error('User not found:', userId);
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    console.log('Returning user data:', userData);
    res.json({
      success: true,
      data: userData
    });
  } catch (error) {
    console.error('Error in /api/user-data:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Route pour obtenir les tâches disponibles
app.get('/api/tasks', async (req, res) => {
  try {
    const tasks = await googleSheets.getAvailableTasks();
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

// Route pour obtenir une tâche spécifique
app.get('/api/tasks/:taskId', async (req, res) => {
  try {
    const tasks = await googleSheets.readTasks();
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

// Routes API
app.get('/api/referral', async (req, res) => {
  try {
    const userId = req.query.userId;
    if (!userId) {
      return res.status(400).json({ 
        success: false,
        error: 'userId is required'
      });
    }

    const referralInfo = await googleSheets.getReferralInfo(userId);
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

app.post('/api/claim', async (req, res) => {
  try {
    const userId = req.telegramUser?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const result = await googleSheets.claimRandomTask(userId);
    res.json(result);
  } catch (error) {
    console.error('Error claiming:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/claim-task', async (req, res) => {
  try {
    const { userId, taskId } = req.body;
    if (!userId || !taskId) {
      return res.status(400).json({ error: 'userId and taskId are required' });
    }

    const result = await googleSheets.claimSpecificTask(userId, taskId);
    res.json(result);
  } catch (error) {
    console.error('Error claiming task:', error);
    res.status(500).json({ error: error.message });
  }
});

// Middleware de logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});
const initializeApp = async () => {
  let server;
  try {
    // Vérifiez que toutes les variables d'environnement nécessaires sont présentes
    if (!process.env.GOOGLE_CREDS_B64) {
      throw new Error('GOOGLE_CREDS_B64 is required');
    }
    if (!process.env.TELEGRAM_BOT_TOKEN) {
      throw new Error('TELEGRAM_BOT_TOKEN is required');
    }

    // Configuration des timeouts et des limites
    app.set('trust proxy', true);
    app.set('keep-alive-timeout', 30000); // 30 secondes
    app.set('timeout', 30000); // 30 secondes

    // Initialisation de Google Sheets
    if (!sheetsInitialized) {
      try {
        sheets = await initGoogleSheets();
        sheetsInitialized = true;
        console.log('Google Sheets initialized successfully');
      } catch (error) {
        console.error('Error initializing Google Sheets:', error);
        process.exit(1);
      }
    }

    // Initialisation du bot
    try {
      // Le bot est déjà configuré avec le webhook dans bot.js
      console.log('Bot initialized successfully');
    } catch (error) {
      console.error('Error initializing bot:', error);
    }

    // Gestion du verrou de démarrage
    const fs = require('fs');
    const lockFilePath = '.lock';
    
    try {
      // Créer le dossier temporaire si nécessaire
      if (!fs.existsSync('.temp')) {
        fs.mkdirSync('.temp');
      }
      
      // Vérifier et créer le fichier de verrou
      const lockFile = path.join('.temp', lockFilePath);
      if (fs.existsSync(lockFile)) {
        // Lire le contenu du fichier de verrou
        const lockContent = fs.readFileSync(lockFile, 'utf8');
        const [pid, timestamp] = lockContent.split('|');
        
        // Vérifier si le processus existe encore
        try {
          process.kill(parseInt(pid), 0);
          console.error('Another instance is already running. Exiting...');
          process.exit(1);
        } catch (e) {
          // Le processus n'existe plus, on peut supprimer le verrou et continuer
          fs.unlinkSync(lockFile);
        }
      }
      
      // Créer le nouveau verrou
      const currentPid = process.pid;
      const currentTimestamp = Date.now();
      fs.writeFileSync(lockFile, `${currentPid}|${currentTimestamp}`);
      
      // Nettoyer le verrou au shutdown
      process.on('exit', () => {
        if (fs.existsSync(lockFile)) {
          fs.unlinkSync(lockFile);
        }
      });
      process.on('SIGINT', () => process.exit(0));
      process.on('SIGTERM', () => process.exit(0));
    } catch (err) {
      console.error('Error managing lock file:', err);
      process.exit(1);
    }

    // Démarrez le serveur
    try {
      // Utiliser le port 8080 pour Render
      server = app.listen(8080, () => {
        console.log(`Server running on port 8080`);
        console.log(`Environment: ${process.env.NODE_ENV || 'production'}`);
        console.log(`Google Sheets initialized: ${sheetsInitialized}`);
      }).on('error', (error) => {
        console.error('Server error:', error);
        if (error.code === 'EADDRINUSE') {
          console.error(`Port 8080 is already in use. Stopping previous instance...`);
          // Essayez de tuer le processus précédent
          require('child_process').exec('pkill -f "node index.js"', (err) => {
            if (err) {
              console.error('Failed to kill previous instance:', err);
              process.exit(1);
            }
            console.log('Previous instance stopped. Restarting...');
            process.exit(0); // Sortir proprement au lieu de redémarrer
          });
        } else {
          console.error('Server error:', error);
          process.exit(1);
        }
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
            session.startTime = Date.now(); // Réinitialiser les timers
          }
          
          // Fermez le serveur
          await new Promise((resolve) => server.close(resolve));
          
          console.log('Server closed successfully');
        } catch (error) {
          console.error('Error closing server:', error);
        }
        
        process.exit(0);
      });
    } catch (error) {
      console.error('Error starting server:', error);
      process.exit(1);
    }
    return server;
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

// Ajouter un délai avant la configuration du webhook
await new Promise(resolve => setTimeout(resolve, 5000));

// Appeler la fonction initiale
await initializeApp();

// Exporter l'application
module.exports = app;