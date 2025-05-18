require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { bot, webhookCallback } = require('./bot');
const { 
  initGoogleSheets, 
  readTasks, 
  getUserData,
  getReferralInfo
} = require('./googleSheets');
const { google } = require('googleapis');

const app = express();
const PORT = process.env.PORT || 10000;

// ===== CONFIGURATION DES SESSIONS =====
const activeSessions = new Map();

// Nettoyage automatique des sessions expirées
setInterval(() => {
  const now = new Date();
  for (const [userId, session] of activeSessions.entries()) {
    const sessionDuration = (now - new Date(session.lastActive)) / 1000;
    if (sessionDuration > 7200) { // 2h d'inactivité max
      activeSessions.delete(userId);
      console.log(`Session expirée pour l'utilisateur ${userId}`);
    }
  }
}, 300000); // Toutes les 5 minutes

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logger amélioré
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

const webhookSecretPath = `/webhook/${process.env.TELEGRAM_BOT_TOKEN}`;
let sheetsInitialized = false;

// ===== ROUTES DE SESSION =====
app.post('/sync-session', (req, res) => {
  const { userId, deviceId } = req.body;
  const session = activeSessions.get(userId);
  
  if (!session) {
    return res.json({ status: 'no_session' });
  }

  // Vérification de l'appareil
  if (session.deviceId !== deviceId) {
    return res.json({
      status: 'other_device',
      sessionStart: session.startTime,
      tokens: session.tokens
    });
  }

  // Mise à jour de l'activité
  session.lastActive = new Date();
  res.json({
    status: 'synced',
    sessionStart: session.startTime,
    tokens: session.tokens
  });
});

app.post('/start-session', (req, res) => {
  const { userId, deviceId } = req.body;
  
  if (activeSessions.has(userId)) {
    const existingSession = activeSessions.get(userId);
    return res.status(400).json({ 
      error: "SESSION_ACTIVE",
      deviceId: existingSession.deviceId,
      sessionStart: existingSession.startTime
    });
  }
  
  const newSession = {
    startTime: new Date(),
    lastActive: new Date(),
    deviceId,
    tokens: 0
  };
  
  activeSessions.set(userId, newSession);
  res.json({ 
    success: true,
    sessionStart: newSession.startTime
  });
});

app.post('/update-session', (req, res) => {
  const { userId, tokens } = req.body;
  const session = activeSessions.get(userId);
  
  if (!session) {
    return res.status(404).json({ error: "Session non trouvée" });
  }
  
  session.tokens = parseFloat(tokens) || 0;
  session.lastActive = new Date();
  res.json({ success: true });
});

app.post('/end-session', (req, res) => {
  activeSessions.delete(req.body.userId);
  res.json({ success: true });
});

// ===== ROUTES EXISTANTES =====
app.post(webhookSecretPath, webhookCallback);

app.post('/claim', async (req, res) => {
  try {
    if (!sheetsInitialized) throw new Error('Service not initialized');

    const { userId, tokens, deviceId } = req.body;
    const session = activeSessions.get(userId);

    // Validation stricte
    if (!session || session.deviceId !== deviceId) {
      return res.status(403).json({ 
        success: false, 
        error: "INVALID_SESSION" 
      });
    }

    const timestamp = new Date().toISOString();
    const points = Math.floor(parseFloat(tokens));

    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(Buffer.from(process.env.GOOGLE_CREDS_B64, 'base64').toString()),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const sheets = google.sheets({ version: 'v4', auth });

    // Logique existante d'enregistrement...
    // ... (ton code existant pour l'enregistrement dans Google Sheets)

    // Fin de session
    activeSessions.delete(userId);

    res.json({ 
      success: true,
      points,
      message: `${points} tokens crédités`
    });

  } catch (error) {
    console.error("Claim error:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ===== ROUTES EXISTANTES (inchangées) =====
app.post(webhookSecretPath, webhookCallback);

app.get('/tasks', async (req, res) => {
  try {
    if (!sheetsInitialized) throw new Error('Service not initialized');
    const tasks = await readTasks();
    res.json(tasks);
  } catch (err) {
    console.error('Tasks error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/user/:userId', async (req, res) => {
  try {
    if (!sheetsInitialized) throw new Error('Service not initialized');
    
    const user = await getUserData(req.params.userId);
    
    if (!user) {
      console.log("User non trouvé. ID recherché:", req.params.userId);
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      username: user[1],
      balance: user[3],
      lastClaim: user[4]
    });

  } catch (error) {
    console.error('User data error:', error);
    res.status(500).json({ 
      error: error.message,
      details: "Vérifiez le format des données dans Google Sheets" 
    });
  }
});

app.get('/referral/:code', async (req, res) => {
  try {
    if (!sheetsInitialized) throw new Error('Service not initialized');
    const { code } = req.params;
    const referralInfo = await getReferralInfo(code);
    res.json(referralInfo);
  } catch (err) {
    console.error('Referral error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/health', (req, res) => {
  const status = {
    status: sheetsInitialized ? 'OK' : 'INITIALIZING',
    timestamp: new Date().toISOString(),
    services: {
      googleSheets: sheetsInitialized,
      telegram: !!process.env.TELEGRAM_BOT_TOKEN,
      sessions: activeSessions.size
    }
  };
  res.status(sheetsInitialized ? 200 : 503).json(status);
});

app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

app.use((err, req, res, next) => {
  console.error('Global error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ===== INITIALISATION =====
async function initializeApp() {
  try {
    await initGoogleSheets();
    sheetsInitialized = true;
    console.log('Google Sheets initialized');
    
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      
      if (!process.env.PUBLIC_URL) {
        bot.launch().catch(err => {
          console.error('Bot launch error:', err);
          process.exit(1);
        });
      }
    });
  } catch (err) {
    console.error('Initialization failed:', err);
    process.exit(1);
  }
}

initializeApp();