const express = require('express');
const cors = require('cors');
const path = require('path');
const { googleSheets } = require('./googleSheets');
const logger = require('./logger');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.get('/api/user-data', async (req, res) => {
  try {
    const userId = req.query.userId;
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    // Simuler la récupération des données utilisateur
    const userData = await googleSheets.getUserData(userId);
    
    res.json({
      username: userData.username || 'Anonymous',
      balance: userData.balance || 0,
      lastClaim: userData.lastClaim || 'Never',
      userId: userId
    });
  } catch (error) {
    logger.error('Error fetching user data:', error);
    res.status(500).json({ error: 'Failed to fetch user data' });
  }
});

app.post('/api/claim', async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    // Simuler la mise à jour des données après un claim
    await googleSheets.updateUserData(userId, {
      lastClaim: new Date().toISOString(),
      balance: req.body.balance || 0
    });

    res.json({ success: true, message: 'Claim successful' });
  } catch (error) {
    logger.error('Error processing claim:', error);
    res.status(500).json({ error: 'Failed to process claim' });
  }
});

// Route pour le webhook Telegram
app.post('/webhook/:token', async (req, res) => {
  try {
    const { webhookCallback } = require('./bot');
    await webhookCallback(req, res);
  } catch (error) {
    logger.error('Webhook error:', error);
    res.status(500).send('Webhook error');
  }
});

// Route par défaut pour la page d'accueil
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Démarrage du serveur
app.listen(PORT, () => {
  logger.info(`Server is running on port ${PORT}`);
});
