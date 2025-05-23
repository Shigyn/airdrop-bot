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
    'https://web.telegram.org'
  ],
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Telegram-Data'],
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`, {
    headers: req.headers,
    body: req.body
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
      error: "SESSION_LIMIT_REACHED",
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

// [CLAIM] Enregistrement avec limite de 60 minutes
app.post('/claim', async (req, res) => {
  const { userId, deviceId, tokens, username } = req.body;
  const MAX_MINUTES = 60; // limite affichée mais non bloquante

  // 1. Vérifier session active
  const session = activeSessions.get(userId);
  if (!session) {
    return res.status(403).json({
      error: "NO_ACTIVE_SESSION",
      message: "Aucune session active. Démarrez d'abord le minage."
    });
  }

  // 2. Vérifier appareil
  if (session.deviceId !== deviceId) {
    return res.status(403).json({
      error: "DEVICE_MISMATCH",
      message: "Appareil non autorisé. Utilisez le même navigateur."
    });
  }

  // 3. Calcul du temps écoulé
  const now = Date.now();
  const elapsedMinutes = (now - session.lastActive) / (1000 * 60);
  const totalUsedMinutes = session.totalMinutes + elapsedMinutes;

  // **PLUS DE BLOQUAGE SUR 60 MINUTES**

  try {
    // 4. Validation tokens
    const points = Math.floor(parseFloat(tokens));
    if (isNaN(points) || points <= 0) {
      return res.status(400).json({
        error: "INVALID_TOKENS",
        message: "Valeur de tokens invalide"
      });
    }

    // 5. Setup Google Sheets API
    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(Buffer.from(process.env.GOOGLE_CREDS_B64, 'base64').toString()),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const sheets = google.sheets({ version: 'v4', auth });

    const timestamp = new Date().toISOString();

    // a) Enregistrer la transaction
    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: "Transactions!A2:E",
      valueInputOption: "USER_ENTERED",
      resource: {
        values: [[timestamp, userId, "AIRDROP", points, "COMPLETED"]]
      }
    });

    // b) Lire users pour mise à jour (avec Mining_Speed en G)
    const usersData = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: "Users!A2:G"
    });
    const users = usersData.data.values || [];
    const userIndex = users.findIndex(row => row[2]?.toString() === userId?.toString());
    let newBalance = points;

    if (userIndex >= 0) {
      // Utilisateur existant : mise à jour solde + mining speed
      const currentBalance = parseInt(users[userIndex][3]) || 0;
      const miningSpeed = parseFloat(users[userIndex][6]) || 1; // Col G = Mining_Speed
      newBalance = currentBalance + points * miningSpeed;

      await sheets.spreadsheets.values.update({
        spreadsheetId: process.env.GOOGLE_SHEET_ID,
        range: `Users!D${userIndex + 2}`,
        valueInputOption: "USER_ENTERED",
        resource: { values: [[newBalance]] }
      });

      // Mise à jour Last_Claim_Time (col E)
      await sheets.spreadsheets.values.update({
        spreadsheetId: process.env.GOOGLE_SHEET_ID,
        range: `Users!E${userIndex + 2}`,
        valueInputOption: "USER_ENTERED",
        resource: { values: [[timestamp]] }
      });

      // Gestion parrainage 10%
      const referralCode = users[userIndex][5]; // code parrainage (col F)
      if (referralCode) {
        // Trouver le parrain avec ce code
        const referrerIndex = users.findIndex(row => row[5] === referralCode);
        if (referrerIndex >= 0) {
          const currentReferrerBalance = parseInt(users[referrerIndex][3]) || 0;
          const referralReward = Math.floor(points * 0.1);

          const newReferrerBalance = currentReferrerBalance + referralReward;
          await sheets.spreadsheets.values.update({
            spreadsheetId: process.env.GOOGLE_SHEET_ID,
            range: `Users!D${referrerIndex + 2}`,
            valueInputOption: "USER_ENTERED",
            resource: { values: [[newReferrerBalance]] }
          });

          // Enregistrer la récompense dans Referrals
          await sheets.spreadsheets.values.append({
            spreadsheetId: process.env.GOOGLE_SHEET_ID,
            range: "Referrals!A2:D",
            valueInputOption: "USER_ENTERED",
            resource: {
              values: [[
                referralCode,
                referralReward,
                timestamp,
                username || "Anonyme"
              ]]
            }
          });
        }
      }
    } else {
      // Nouvel utilisateur : ajout dans Users avec Mining_Speed = 1 par défaut
      await sheets.spreadsheets.values.append({
        spreadsheetId: process.env.GOOGLE_SHEET_ID,
        range: "Users!A2:G",
        valueInputOption: "USER_ENTERED",
        resource: {
          values: [[
            timestamp,             // Date_Inscription (A)
            username || "Anonyme", // Username (B)
            userId,                // user_id (C)
            newBalance,            // Balance (D)
            timestamp,             // Last_Claim_Time (E)
            `REF-${Math.random().toString(36).slice(2, 8)}`, // Referral_Code (F)
            1                      // Mining_Speed (G)
          ]]
        }
      });
    }

    // 6. Mise à jour session active
    activeSessions.set(userId, {
      ...session,
      lastActive: now,
      totalMinutes: totalUsedMinutes,
      tokens: points
    });

    // 7. Réponse OK
    return res.json({
      success: true,
      balance: newBalance,
      claimedPoints: points,
      sessionDuration: totalUsedMinutes.toFixed(2),
      remainingMinutes: Math.max(0, MAX_MINUTES - totalUsedMinutes).toFixed(2) // indicatif seulement
    });

  } catch (error) {
    console.error("Claim error:", error);
    return res.status(500).json({
      error: "CLAIM_FAILED",
      message: "Erreur serveur",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// [USER] Récupération des données utilisateur
app.get('/api/user/:userId', async (req, res) => {
  try {
    if (!sheetsInitialized) {
      return res.status(503).json({ error: "Service unavailable" });
    }

    const userId = req.params.userId;
    const usersData = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: "Users!A2:G" // A:Date, B:Username, C:UserID, D:Balance, E:LastClaim, F:Referral, G:MiningSpeed
    });

    const users = usersData.data.values || [];
    const user = users.find(row => row[2]?.toString() === userId?.toString());

    if (!user) {
      return res.status(404).json({ 
        error: "USER_NOT_FOUND",
        message: "Utilisateur non enregistré" 
      });
    }

    res.json({
      username: user[1],
      balance: user[3],
      lastClaim: user[4],
      mining_speed: user[6] || 1
    });
  } catch (error) {
    console.error("User data error:", error);
    res.status(500).json({ 
      error: "SERVER_ERROR",
      message: "Erreur serveur" 
    });
  }
});

// Routes pour Tasks et Referral
app.get('/api/tasks', async (req, res) => {
  try {
    // Exemple de données - remplacez par votre logique
    res.json([
      { id: 1, name: "Join Telegram", icon: "telegram.png", reward: 10 },
      { id: 2, name: "Follow Twitter", icon: "twitter.png", reward: 5 }
    ]);
  } catch (error) {
    res.status(500).json({ error: "Failed to load tasks" });
  }
});

app.post('/api/complete-task', async (req, res) => {
  try {
    // Logique de validation ici
    res.json({ success: true, reward: req.body.reward });
  } catch (error) {
    res.status(400).json({ error: "Task completion failed" });
  }
});

app.get('/api/referral-info', async (req, res) => {
  try {
    const userId = req.query.userId;
    // Exemple de réponse - adaptez à votre système
    res.json({
      code: `REF${userId.slice(0, 5)}`,
      invitedCount: 3,
      earnedTokens: 15
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to load referral info" });
  }
});

// [BOT] webhook Telegram
app.use('/bot', webhookCallback);

// [STATIC] Fichiers publics
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Lancer tout
initializeApp();
