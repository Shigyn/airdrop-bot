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

    // Stocke localement le solde pour incrémentation visuelle
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
        <span id="minutes">0.00</span> minutes (min. 10)
      </div>
      <button id="main-claim-btn" class="claim-button">
        <div class="progress-bar" id="progress-bar"></div>
        <span>START MINING</span>
      </button>
      <div id="main-claim-result"></div>
    </div>
  `;

  let minutes = 0;
  const maxMinutes = 60;
  const btn = document.getElementById('main-claim-btn');
  const resultDisplay = document.getElementById('main-claim-result');

  btn.addEventListener('click', async () => {
    if (miningSessionActive) {
      // Arrêt et claim
      stopMiningSession();
      
      if (minutes < 10) {
        showResult('❌ Minimum 10 minutes requis', 'error');
        resetMiningUI();
        return;
      }

      await processClaim(minutes);
      resetMiningUI();
      
      // Relance automatique après 3 secondes
      setTimeout(startMiningSession, 3000);
      
    } else {
      // Démarrage
      startMiningSession();
    }
  });

  function startMiningSession() {
    miningSessionActive = true;
    minutes = 0;
    btn.classList.add('active');
    btn.innerHTML = '<span>MINING IN PROGRESS...</span>';
    showResult('Session démarrée', 'info');

    miningInterval = setInterval(() => {
      minutes += 1 / 60; // équivalent à 0.0167 minutes = 1 seconde
      updateMiningUI();
      
      if (minutes >= 10) {
        btn.querySelector('span').textContent = `CLAIM ${minutes.toFixed(2)} POINTS`;
      }

      if (minutes >= maxMinutes) {
        stopMiningSession();
        processClaim(minutes).then(() => {
          setTimeout(startMiningSession, 3000);
        });
      }
    }, 1000); // chaque seconde

    console.log('Mining démarré');
    updateMiningUI();
  }

  function stopMiningSession() {
    clearInterval(miningInterval);
    miningSessionActive = false;
    console.log(`Mining arrêté après ${minutes.toFixed(2)} minutes`);
  }

  function updateMiningUI() {
    document.getElementById('minutes').textContent = minutes.toFixed(2);
    const percentage = Math.min(100, (minutes / maxMinutes) * 100);
    const progressBar = document.getElementById('progress-bar');
    progressBar.style.width = `${percentage}%`;
    progressBar.style.backgroundColor = `hsl(${percentage * 1.2}, 100%, 50%)`;

    // Met à jour le solde visuellement
    const simulatedBalance = balance + minutes;
    document.getElementById('balance').textContent = simulatedBalance.toFixed(2);
  }

  function resetMiningUI() {
    minutes = 0;
    updateMiningUI();
    btn.classList.remove('active');
    btn.innerHTML = '<span>START MINING</span>';
  }

  async function processClaim(minutes) {
    btn.disabled = true;
    showResult('Envoi vers Sheets...', 'info');
    
    try {
      const response = await fetch('/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          userId,
          minutes,
          username: tg.initDataUnsafe.user?.username || 'Anonyme'
        })
      });
      
      const data = await response.json();
      
      if (!response.ok) throw new Error(data.message || 'Erreur Sheets');
      
      showResult(`✅ ${data.message || `${minutes.toFixed(2)} points claimés!`}`, 'success');
      console.log('Claim réussi:', data);
      
      // Actualise les données
      await loadUserData();
      
      return true;
    } catch (error) {
      console.error('Erreur claim:', error);
      showResult(`❌ Échec: ${error.message}`, 'error');
      return false;
    } finally {
      btn.disabled = false;
    }
  }

  function showResult(message, type) {
    resultDisplay.innerHTML = `<div class="result-${type}">${message}</div>`;
  }
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
