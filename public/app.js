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
    console.error("Erreur:", error);
    throw error;
  }
}

function showClaim() {
  const content = document.getElementById('content');
  content.innerHTML = `
    <div class="claim-container">
      <div class="mining-display">
        <div class="token-counter">
          <span id="tokens">0.00</span>
          <span class="token-label">tokens</span>
        </div>
        <button id="main-claim-btn" class="claim-button" disabled>
          <span id="claim-text">MINING LOCKED (00:10:00)</span>
        </button>
      </div>
      <div id="main-claim-result"></div>
    </div>
  `;

  let tokens = 0;
  const maxTime = 3600; // 1h en secondes
  const minClaimTime = 600; // 10min en secondes
  let remainingTime = maxTime;
  const btn = document.getElementById('main-claim-btn');
  const tokensDisplay = document.getElementById('tokens');
  let miningInterval;

  function updateDisplay() {
    tokensDisplay.textContent = tokens.toFixed(2);
    
    // Formatage du temps restant HH:MM:SS
    const hours = Math.floor(remainingTime / 3600);
    const minutes = Math.floor((remainingTime % 3600) / 60);
    const seconds = remainingTime % 60;
    const timeStr = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    
    document.getElementById('claim-text').textContent = 
      remainingTime > (maxTime - minClaimTime) 
        ? `MINING LOCKED (${timeStr})` 
        : `CLAIM NOW (${timeStr})`;
  }

  function startMiningSession() {
    const startTime = Date.now();
    
    miningInterval = setInterval(() => {
      const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
      remainingTime = Math.max(0, maxTime - elapsedSeconds);
      
      // 1 token par seconde (à ajuster selon ton taux)
      tokens = Math.min(elapsedSeconds * 1, maxTime * 1); 
      
      // Active le bouton après 10 min
      if (elapsedSeconds >= minClaimTime) {
        btn.disabled = false;
      }

      updateDisplay();

      if (remainingTime <= 0) {
        clearInterval(miningInterval);
        btn.disabled = false;
        document.getElementById('claim-text').textContent = 'CLAIM MAX TOKENS';
      }
    }, 1000);
  }

  btn.addEventListener('click', async () => {
    if (remainingTime > (maxTime - minClaimTime)) return;
    
    btn.disabled = true;
    const claimAmount = tokens.toFixed(2);
    
    try {
      const response = await fetch('/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          userId,
          tokens: claimAmount,
          username: tg.initDataUnsafe.user?.username || 'Anonyme'
        })
      });
      
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Erreur');
      
      // Réinitialisation après claim
      tokens = 0;
      remainingTime = maxTime;
      startMiningSession();
      await loadUserData();
      
    } catch (error) {
      console.error('Claim error:', error);
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
        <h2>Erreur</h2>
        <p>${error.message}</p>
      </div>
    `;
  }
});