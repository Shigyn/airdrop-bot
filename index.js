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

app.post('/update-session', async (req, res) => {
  const { userId, tokens, deviceId } = req.body;
  
  try {
    // Vérifier que tous les champs sont présents
    if (!userId || !tokens || !deviceId) {
      return res.status(400).json({ error: "Missing parameters" });
    }

    const session = activeSessions.get(userId);
    
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    if (session.deviceId !== deviceId) {
      return res.status(403).json({ error: "Device mismatch" });
    }

    // Mettre à jour la session
    session.tokens = parseFloat(tokens);
    session.lastActive = new Date();
    
    // Sauvegarder dans Google Sheets
    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: "Sessions!A2:D",
      valueInputOption: "USER_ENTERED",
      resource: {
        values: [[
          userId,
          tokens,
          new Date().toISOString(),
          deviceId
        ]]
      }
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Update session error:', error);
    res.status(500).json({ error: "Internal server error" });
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
      range: "Tasks!A2:E" // ID, Description, Image, Reward, Statut
    });

    const tasks = (tasksData.data.values || []).map(row => ({
      id: row[0],
      title: row[1],
      image: row[2],
      reward: row[3],
      status: row[4]
    })).filter(task => task.status === 'ACTIVE'); // Filtrer seulement les tâches actives

    res.json(tasks);
  } catch (err) {
    console.error('Tasks error:', err);
    res.status(500).json({ error: "Failed to load tasks" });
  }
});

// [CLAIM] Enregistrement avec limite de 60 minutes
app.post('/claim', async (req, res) => {
  const { userId, deviceId, tokens: tokensToClaim, username, miningTime } = req.body;
  const MAX_MINUTES = 60;

  // 1. Validation des données
  if (!userId || !deviceId || !tokensToClaim || !miningTime) {
    return res.status(400).json({ error: "MISSING_DATA", message: "Données manquantes" });
  }

  try {
    // 2. Vérification de la session
    const session = activeSessions.get(userId);
    if (!session) {
      return res.status(403).json({ error: "NO_SESSION", message: "Session expirée" });
    }

    if (session.deviceId !== deviceId) {
      return res.status(403).json({ error: "DEVICE_MISMATCH", message: "Appareil non autorisé" });
    }

    // 3. Vérification anti-triche
    const claimedMinutes = parseFloat(miningTime);
    if (claimedMinutes > MAX_MINUTES || isNaN(claimedMinutes)) {
      return res.status(400).json({ error: "INVALID_CLAIM", message: "Temps de minage invalide" });
    }

    // 4. Formatage des données pour Sheets
    const timestamp = new Date().toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    // 5. Enregistrement dans Transactions (format: User_ID | Points | Type | Timestamp)
    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: "Transactions!A2:D",
      valueInputOption: "USER_ENTERED",
      resource: {
        values: [[
          userId.toString(),       // Colonne A: User_ID
          parseInt(tokensToClaim), // Colonne B: Points
          "CLAIM",                // Colonne C: Type
          timestamp               // Colonne D: Timestamp
        ]]
      }
    });

    // 6. Mise à jour du solde utilisateur
    const usersData = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: "Users!A2:G"
    });

    const users = usersData.data.values || [];
    const userIndex = users.findIndex(row => row[2]?.toString() === userId.toString());

    let newBalance = parseInt(tokensToClaim);
    let miningSpeed = 1;

    if (userIndex >= 0) {
      const currentBalance = parseInt(users[userIndex][3]) || 0;
      miningSpeed = parseFloat(users[userIndex][6]) || 1;
      newBalance = currentBalance + parseInt(tokensToClaim);

      await sheets.spreadsheets.values.update({
        spreadsheetId: process.env.GOOGLE_SHEET_ID,
        range: `Users!D${userIndex + 2}`, // Colonne Balance
        valueInputOption: "USER_ENTERED",
        resource: { values: [[newBalance]] }
      });

      // 7. Programme de parrainage
      const referralCode = users[userIndex][5];
      if (referralCode) {
        const referrer = users.find(row => row[5] === referralCode);
        if (referrer) {
          const referrerIndex = users.indexOf(referrer);
          const referralReward = Math.floor(tokensToClaim * 0.1);
          const referrerBalance = parseInt(referrer[3]) || 0;

          await sheets.spreadsheets.values.update({
            spreadsheetId: process.env.GOOGLE_SHEET_ID,
            range: `Users!D${referrerIndex + 2}`,
            valueInputOption: "USER_ENTERED",
            resource: { values: [[referrerBalance + referralReward]] }
          });

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
      // Nouvel utilisateur
      const referralCode = `REF-${Math.random().toString(36).slice(2, 8)}`;
      await sheets.spreadsheets.values.append({
        spreadsheetId: process.env.GOOGLE_SHEET_ID,
        range: "Users!A2:G",
        valueInputOption: "USER_ENTERED",
        resource: {
          values: [[
            timestamp,
            username || "Anonyme",
            userId,
            newBalance,
            timestamp,
            referralCode,
            1 // Mining_Speed par défaut
          ]]
        }
      });
    }

    // 8. Mise à jour de la session
    activeSessions.set(userId, {
      ...session,
      lastActive: Date.now(),
      tokens: 0
    });

    // 9. Réponse
    res.json({
      status: "OK",
      balance: newBalance,
      mining_speed: miningSpeed,
      message: `${tokensToClaim} tokens ajoutés`
    });

  } catch (err) {
    console.error('Claim error:', err);
    res.status(500).json({ 
      error: "SERVER_ERROR",
      message: "Erreur lors du traitement"
    });
  }
});

// Webhook bot
app.use(bot.webhookCallback('/bot'));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// Start server
initializeApp();
