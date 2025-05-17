// Variables globales
let tg, userId;
let miningSessionActive = false;
let miningInterval;
let balance = 0;

function initTelegramWebApp() {
  console.log('Initialisation de Telegram WebApp...');
  
  if (!window.Telegram?.WebApp) {
    throw new Error("Ouvrez via l'application Telegram");
  }

  tg = window.Telegram.WebApp;
  tg.expand();
  
  userId = tg.initDataUnsafe?.user?.id;
  if (!userId) {
    throw new Error("User ID non trouvé");
  }
  console.log(`Connecté en tant que userID: ${userId}`);
}

async function loadUserData() {
  try {
    const response = await fetch(`/user/${userId}`);
    const data = await response.json();
    
    if (!response.ok) throw new Error(data.error || 'Erreur serveur');
    
    // Mise à jour de l'UI
    document.getElementById('username').textContent = data.username || "Anonyme";
    document.getElementById('balance').textContent = data.balance ?? "0";
    document.getElementById('lastClaim').textContent = 
      data.lastClaim ? new Date(data.lastClaim).toLocaleString('fr-FR') : "Jamais";

    // Stocke le solde réel
    balance = parseFloat(data.balance) || 0;
    
    console.log('Données Sheets chargées:', {
      balance: data.balance,
      lastClaim: data.lastClaim
    });
    
    return data;
  } catch (error) {
    console.error("Erreur Sheets:", error);
    showNotification(`❌ Erreur: ${error.message}`, 'error');
    throw error;
  }
}

function showClaim() {
  const content = document.getElementById('content');
  content.innerHTML = `
    <div class="claim-container">
      <h2>Mining Session</h2>
      <div class="timer-display">
        <span id="minutes">0.00</span>/60 minutes (min. 10)
      </div>
      <button id="main-claim-btn" class="claim-button" disabled>
        <div class="progress-bar" id="progress-bar"></div>
        <span>MINING LOCKED (10min)</span>
      </button>
      <div id="main-claim-result"></div>
    </div>
  `;

  let minutes = 0;
  const maxMinutes = 60;
  const minClaimMinutes = 10;
  const btn = document.getElementById('main-claim-btn');
  const resultDisplay = document.getElementById('main-claim-result');
  let miningStartTime = null;

  function startMiningSession() {
    miningStartTime = Date.now();
    minutes = 0;
    btn.disabled = true;
    btn.innerHTML = '<span>MINING IN PROGRESS...</span>';
    showResult('Session démarrée - 10min minimum', 'info');

    miningInterval = setInterval(() => {
      const elapsedMs = Date.now() - miningStartTime;
      minutes = Math.min(maxMinutes, (elapsedMs / (1000 * 60)).toFixed(2));
      
      updateMiningUI();

      // Active le bouton après 10 min
      if (minutes >= minClaimMinutes && btn.disabled) {
        btn.disabled = false;
        btn.innerHTML = `<span>CLAIM ${minutes} POINTS</span>`;
      }

      // Bloque à 60 min max
      if (minutes >= maxMinutes) {
        clearInterval(miningInterval);
        minutes = maxMinutes;
        updateMiningUI();
        btn.innerHTML = `<span>CLAIM ${maxMinutes} POINTS (MAX)</span>`;
      }
    }, 1000);
  }

  function updateMiningUI() {
    document.getElementById('minutes').textContent = minutes;
    const percentage = Math.min(100, (minutes / maxMinutes) * 100);
    const progressBar = document.getElementById('progress-bar');
    progressBar.style.width = `${percentage}%`;
    progressBar.style.backgroundColor = `hsl(${percentage * 1.2}, 100%, 50%)`;
  }

  btn.addEventListener('click', async () => {
    if (minutes < minClaimMinutes) return;
    
    btn.disabled = true;
    const claimedPoints = minutes >= maxMinutes ? maxMinutes : minutes;
    showResult(`Envoi de ${claimedPoints} points...`, 'info');

    try {
      const response = await fetch('/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          userId,
          minutes: claimedPoints,
          username: tg.initDataUnsafe.user?.username || 'Anonyme'
        })
      });
      
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Erreur');
      
      showResult(`✅ ${claimedPoints} points claimés!`, 'success');
      await loadUserData(); // Met à jour la balance réelle
      
      // Relance automatique après 5s
      setTimeout(startMiningSession, 5000);
      
    } catch (error) {
      showResult(`❌ Échec: ${error.message}`, 'error');
      btn.disabled = false;
    }
  });

  // Démarrer automatiquement au chargement
  startMiningSession();
}

// Initialisation
document.addEventListener('DOMContentLoaded', async () => {
  try {
    initTelegramWebApp();
    showClaim();
    
    // Test de connexion Sheets au démarrage
    const userData = await loadUserData();
    console.log('Test Sheets OK:', {
      balance: userData.balance,
      lastClaim: userData.lastClaim
    });
    
  } catch (error) {
    document.body.innerHTML = `
      <div class="error-container">
        <h2>Erreur critique</h2>
        <p>${error.message}</p>
        <p>Veuillez recharger</p>
      </div>
    `;
  }
});