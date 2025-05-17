// Variables globales
let tg, userId;
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

function showNotification(message, type = 'info') {
  const notif = document.createElement('div');
  notif.className = `notification ${type}`;
  notif.textContent = message;
  document.body.appendChild(notif);
  
  setTimeout(() => {
    notif.remove();
  }, 5000);
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

    balance = parseFloat(data.balance) || 0;
    
    return data;
  } catch (error) {
    console.error("Erreur Sheets:", error);
    showNotification(`❌ Erreur: ${error.message}`);
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
  let miningInterval;

  function showResult(message, type) {
    resultDisplay.innerHTML = `<div class="result-${type}">${message}</div>`;
  }

  function startMiningSession() {
    const startTime = Date.now();
    btn.disabled = true;
    btn.innerHTML = '<span>MINING IN PROGRESS...</span>';
    showResult('Session démarrée - 10min minimum', 'info');

    miningInterval = setInterval(() => {
      const elapsedMs = Date.now() - startTime;
      minutes = Math.min(maxMinutes, (elapsedMs / (1000 * 60)).toFixed(2));
      
      updateMiningUI();

      if (minutes >= minClaimMinutes && btn.disabled) {
        btn.disabled = false;
        btn.innerHTML = `<span>CLAIM ${minutes} POINTS</span>`;
      }

      if (minutes >= maxMinutes) {
        clearInterval(miningInterval);
        minutes = maxMinutes;
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
      await loadUserData();
      setTimeout(startMiningSession, 5000);
    } catch (error) {
      showResult(`❌ Échec: ${error.message}`, 'error');
      btn.disabled = false;
    }
  });

  startMiningSession();
}

// Initialisation
document.addEventListener('DOMContentLoaded', async () => {
  try {
    initTelegramWebApp();
    showClaim();
    await loadUserData();
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