// Variables globales
let tg, userId;

function initTelegramWebApp() {
  // Debug
  console.log('Telegram WebApp Debug:', {
    SDKLoaded: !!window.Telegram,
    WebAppReady: !!window.Telegram?.WebApp,
    UserAgent: navigator.userAgent,
    InitData: window.Telegram?.WebApp?.initDataUnsafe
  });

  if (!window.Telegram) {
    throw new Error("SDK Telegram non détecté. Vérifiez le chargement du script.");
  }

  if (!window.Telegram.WebApp) {
    throw new Error("Ouvrez cette application via Telegram (bouton webapp)");
  }

  tg = window.Telegram.WebApp;
  tg.expand();
  tg.enableClosingConfirmation();
  
  userId = tg.initDataUnsafe?.user?.id;
  if (!userId) {
    throw new Error("Utilisateur non identifié via Telegram");
  }

  console.log("WebApp initialisée. UserID:", userId);
}

function initUI() {
  // DOM Elements
  const navClaim = document.getElementById('btn-claim');
  const navTasks = document.getElementById('btn-tasks');
  const navReferrals = document.getElementById('btn-referral');
  const content = document.getElementById('content');

  // Charger les données utilisateur
  loadUserData();

  // Navigation
  navTasks.addEventListener('click', showTasks);
  navClaim.addEventListener('click', showClaim);
  navReferrals.addEventListener('click', showReferrals);

  // Afficher la vue par défaut
  showClaim();
}

function loadUserData() {
  let currentUsername = tg?.initDataUnsafe?.user?.username || "inconnu";
  console.log("Username détecté via Telegram :", currentUsername);

  fetch(`https://script.google.com/macros/s/AKfycbyE6Oeh3BEGIiW9dbsnqg0eh4bcwHNoZZfF2QP_O4_VkQLOLt2wc98VqqDbuzZTqaF9PQ/exec?username=${encodeURIComponent(currentUsername)}`)
    .then(res => res.json())
    .then(data => {
      if (data.error) throw new Error(data.error);
      
      document.getElementById('username').textContent = data.username || "—";
      document.getElementById('balance').textContent = data.balance ?? "--";
      document.getElementById('lastClaim').textContent = data.lastClaim
        ? new Date(data.lastClaim).toLocaleString('fr-FR')
        : "--";
    })
    .catch(err => {
      console.error("Erreur Sheets:", err);
      document.getElementById('username').textContent = "Erreur";
    });
}

function showTasks() {
  const content = document.getElementById('content');
  content.innerHTML = '<h2>Chargement des tâches...</h2>';
  
  fetch('/tasks')
    .then(res => res.json())
    .then(tasks => {
      content.innerHTML = tasks.length 
        ? `<h2>Tâches disponibles</h2><ul>${
            tasks.map(task => `
              <li>
                <b>${task.id}</b>: ${task.description} - 
                Récompense: ${task.reward} - 
                Statut: ${task.completed ? '✅' : '❌'}
              </li>`
            ).join('')
          }</ul>`
        : '<p>Aucune tâche disponible</p>';
    })
    .catch(() => {
      content.innerHTML = '<p>Erreur de chargement</p>';
    });
}

function showClaim() {
  const content = document.getElementById('content');
  content.innerHTML = `
    <h2>Claim</h2>
    <form id="claimForm">
      <input type="text" name="taskId" placeholder="ID tâche (optionnel)" />
      <button type="submit">Réclamer</button>
    </form>
    <div id="claimResult"></div>
  `;

  document.getElementById('claimForm').onsubmit = async (e) => {
    e.preventDefault();
    const form = e.target;
    const button = form.querySelector('button');
    const resultDiv = document.getElementById('claimResult');
    
    button.disabled = true;
    button.classList.add('loading');

    try {
      const res = await fetch('/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          userId, 
          taskId: form.taskId.value || null 
        }),
      });
      
      const data = await res.json();
      resultDiv.textContent = data.message || "Succès!";
      resultDiv.style.color = data.success ? 'green' : 'red';
      
      if (data.success) {
        loadUserData(); // Rafraîchir les données
      }
    } catch (err) {
      resultDiv.textContent = "Erreur réseau";
      resultDiv.style.color = 'red';
    } finally {
      button.disabled = false;
      button.classList.remove('loading');
    }
  };
}

function showReferrals() {
  const content = document.getElementById('content');
  content.innerHTML = '<h2>Chargement...</h2>';
  
  fetch(`/referral/${userId}`)
    .then(res => res.json())
    .then(data => {
      content.innerHTML = `
        <h2>Parrainage</h2>
        <p>Votre code: <b>${data.referralCode || 'N/A'}</b></p>
        <p>Filleuls: <b>${data.referralsCount || 0}</b></p>
        <p>Points: <b>${data.pointsEarned || 0}</b></p>
        ${data.referrals?.length ? `
          <h3>Liste:</h3>
          <ul>${data.referrals.map(r => `
            <li>${r.userId} (${new Date(r.joinDate).toLocaleDateString()})</li>
          `).join('')}</ul>
        ` : ''}
      `;
    })
    .catch(() => {
      content.innerHTML = '<p>Erreur de chargement</p>';
    });
}

// Point d'entrée principal
document.addEventListener('DOMContentLoaded', () => {
  try {
    initTelegramWebApp();
    initUI();
  } catch (error) {
    console.error("Erreur d'initialisation:", error);
    document.body.innerHTML = `
      <div class="container">
        <h1>Erreur</h1>
        <p style="color: red">${error.message}</p>
        <p>Ouvrez cette application via Telegram</p>
      </div>
    `;
  }
});