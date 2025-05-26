require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const { google } = require('googleapis');

const app = express();
let PORT = 8080; // Forcer l'utilisation du port 8080 pour Render
const activeSessions = new Map();
let sheets;
let sheetsInitialized = false; // ajouté pour la santé du service

const { bot, webhookCallback } = require('./bot');
const { initGoogleSheets, readTasks, getUserData } = require('./googleSheets');

// Configuration du webhook pour l'application
app.post('/webhook/:token', (req, res) => {
  const { body } = req;
  const token = req.params.token;
  
  // Vérifiez que le token correspond au token du bot
  if (token !== process.env.TELEGRAM_BOT_TOKEN) {
    return res.status(403).send('Unauthorized');
  }

  // Gestion du webhook
  webhookCallback(req, res);
});

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

// Middleware de vérification de l'authentification Telegram
app.use('/api', async (req, res, next) => {
  try {
    // Vérifie si les données Telegram sont présentes
    const telegramData = req.headers['telegram-data'];
    if (!telegramData) {
      return res.status(401).json({
        error: "AUTH_REQUIRED",
        message: "Telegram authentication data is required"
      });
    }

    // Parse les données Telegram
    const initData = JSON.parse(telegramData);
    if (!initData.auth_date || !initData.user) {
      return res.status(401).json({
        error: "INVALID_AUTH_DATA",
        message: "Invalid Telegram authentication data"
      });
    }

    // Vérifie si l'auth_date est récent (moins de 10 minutes)
    const authDate = parseInt(initData.auth_date);
    const now = Math.floor(Date.now() / 1000);
    if (now - authDate > 600) {
      return res.status(401).json({
        error: "AUTH_EXPIRED",
        message: "Authentication expired"
      });
    }

    // Ajoute les données utilisateur à la requête
    req.telegramUser = initData.user;
    next();
  } catch (error) {
    console.error('Telegram auth error:', error);
    res.status(401).json({
      error: "AUTH_VALIDATION_FAILED",
      message: "Failed to validate Telegram authentication",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
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
    if (!process.env.TELEGRAM_BOT_TOKEN) {
      throw new Error('TELEGRAM_BOT_TOKEN is required');
    }

    // Configuration des timeouts et des limites
    app.set('trust proxy', true);
    app.set('keep-alive-timeout', 30000); // 30 secondes
    app.set('timeout', 30000); // 30 secondes

    // Configuration des limites de requêtes
    app.use(express.json({ 
      limit: '50mb',
      verify: (req, res, buf) => {
        // Log des requêtes trop grandes
        if (buf.length > 50 * 1024 * 1024) {
          console.warn(`Large request body: ${buf.length} bytes`);
        }
      }
    }));
    app.use(express.urlencoded({ 
      limit: '50mb',
      extended: true,
      verify: (req, res, buf) => {
        // Log des requêtes trop grandes
        if (buf.length > 50 * 1024 * 1024) {
          console.warn(`Large request body: ${buf.length} bytes`);
        }
      }
    }));

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
      // Le bot est déjà configuré avec le webhook dans bot.js
      console.log('Bot initialized successfully');
    } catch (error) {
      console.error('Error initializing bot:', error);
    }

    // Démarrez le serveur
    try {
      // Utiliser le port 8080 pour Render
    const server = app.listen(8080, () => {
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
          // Redémarrer l'application
          require('child_process').exec('node index.js', (err) => {
            if (err) {
              console.error('Failed to restart:', err);
              process.exit(1);
            }
          });
        });
      } else {
        console.error('Server error:', error);
        process.exit(1);
      }
    });

      // Gestion des erreurs de serveur
      server.on('error', (error) => {
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
            // Redémarrer l'application
            require('child_process').exec('node index.js', (err) => {
              if (err) {
                console.error('Failed to restart:', err);
                process.exit(1);
              }
            });
          });
        } else {
          console.error('Server error:', error);
          process.exit(1);
        }
      });
{{ ... }}
          console.error('Port already in use. Trying to stop previous instance...');
          // Essayez de tuer le processus précédent
          require('child_process').exec('pkill -f "node index.js"', (err) => {
            if (err) {
              console.error('Failed to kill previous instance:', err);
            }
            console.log('Previous instance stopped. Restarting...');
            process.exit(1);
          });
        } else {
          process.exit(1);
        }
      });

      // Export the server for testing
      module.exports = server;
      return server;
    } catch (error) {
      console.error('Error starting server:', error);
      process.exit(1);
    }
    module.exports = server;

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

app.use('/api', (req, res, next) => {
  if (!req.headers['telegram-data']) {
    return res.status(401).json({
      error: "TELEGRAM_AUTH_REQUIRED",
      message: "Telegram authentication data missing"
    });
  }
  next();
});

// Route pour récupérer les données utilisateur
app.get('/api/user-data', async (req, res) => {
  try {
    const userId = req.query.userId;
    if (!userId) {
      return res.status(400).json({
        error: "MISSING_USER_ID",
        message: "User ID is required"
      });
    }

    // Récupérez les données utilisateur depuis Google Sheets
    const user = await getUserData(userId);
    if (!user) {
      return res.status(404).json({
        error: "USER_NOT_FOUND",
        message: "User not found"
      });
    }

    // Ajoutez les données de session si elles existent
    const session = activeSessions.get(userId);
    const sessionData = session ? {
      startTime: session.startTime,
      totalTime: session.totalMinutes,
      tokensMined: session.tokensMined
    } : null;

    res.json({
      success: true,
      data: {
        username: user.username || `user_${userId}`,
        balance: parseFloat(user.balance) || 0,
        lastClaim: user.lastClaim || 'Never',
        miningSpeed: parseFloat(user.miningSpeed) || 1,
        miningTime: parseFloat(user.miningTime) || 0,
        session: sessionData
      }
    });
  } catch (error) {
    console.error('Error fetching user data:', error);
    res.status(500).json({
      error: "SERVER_ERROR",
      message: "Failed to fetch user data",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Route pour récupérer les tâches
app.get('/api/tasks', async (req, res) => {
  try {
    const tasks = await googleSheets.readTasks();
    res.json({
      success: true,
      data: tasks
    });
  } catch (error) {
    console.error('Error fetching tasks:', error);
    res.status(500).json({
      error: "SERVER_ERROR",
      message: "Failed to fetch tasks",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Route pour le dashboard
app.get('/api/dashboard', async (req, res) => {
  try {
    const userId = req.query.userId;
    if (!userId) {
      return res.status(400).json({
        error: "MISSING_USER_ID",
        message: "User ID is required"
      });
    }

    // Récupérez les données utilisateur
    const user = await getUserData(userId);
    if (!user) {
      return res.status(404).json({
        error: "USER_NOT_FOUND",
        message: "User not found"
      });
    }

    // Récupérez les tâches
    const tasks = await googleSheets.readTasks();

    // Récupérez les données de session
    const session = activeSessions.get(userId);

    res.json({
      success: true,
      data: {
        user: {
          username: user.username || `user_${userId}`,
          balance: parseFloat(user.balance) || 0,
          lastClaim: user.lastClaim || 'Never',
          miningSpeed: parseFloat(user.miningSpeed) || 1,
          miningTime: parseFloat(user.miningTime) || 0
        },
        tasks: tasks,
        session: session ? {
          startTime: session.startTime,
          totalTime: session.totalMinutes,
          tokensMined: session.tokensMined
        } : null
      }
    });
  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    res.status(500).json({
      error: "SERVER_ERROR",
      message: "Failed to fetch dashboard data",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
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