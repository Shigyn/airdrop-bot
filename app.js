// public/app.js

// Assure-toi que Telegram WebApp API est chargé
const tg = window.Telegram.WebApp;
tg.expand();

// Récupération userId côté client
const userId = tg.initDataUnsafe?.user?.id || null;

if (!userId) {
  alert('Erreur : utilisateur non identifié via Telegram.');
}

// DOM Elements
const navClaim = document.getElementById('nav-claim');
const navTasks = document.getElementById('nav-tasks');
const navReferrals = document.getElementById('nav-referrals');

const sectionClaim = document.getElementById('section-claim');
const sectionTasks = document.getElementById('section-tasks');
const sectionReferrals = document.getElementById('section-referrals');

const claimButton = document.getElementById('claim-button');
const claimProgress = document.getElementById('claim-progress');
const claimTimer = document.getElementById('claim-timer');

const tasksList = document.getElementById('tasks-list');

const referralsInfo = document.getElementById('referrals-info');
const referralsList = document.getElementById('referrals-list');

// Variables claim
let lastClaimTime = null; // timestamp ISO string
let claimInterval = null;
const CLAIM_INTERVAL_MS = 60 * 60 * 1000; // 1 heure
const CLAIM_HALF_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

// Navigation
function showSection(section) {
  [sectionClaim, sectionTasks, sectionReferrals].forEach(sec => {
    sec.style.display = (sec === section) ? 'block' : 'none';
  });
}

// Event listeners nav
navClaim.addEventListener('click', () => {
  showSection(sectionClaim);
});
navTasks.addEventListener('click', () => {
  showSection(sectionTasks);
  loadTasks();
});
navReferrals.addEventListener('click', () => {
  showSection(sectionReferrals);
  loadReferrals();
});

// Load tasks from API
async function loadTasks() {
  tasksList.innerHTML = 'Chargement...';
  try {
    const res = await fetch('/tasks');
    if (!res.ok) throw new Error('Erreur chargement tâches');
    const tasks = await res.json();

    if (!tasks.length) {
      tasksList.innerHTML = '<p>Aucune tâche disponible pour le moment.</p>';
      return;
    }

    // Build tasks list
    tasksList.innerHTML = '';
    tasks.forEach(task => {
      const div = document.createElement('div');
      div.className = 'task-item';
      div.innerHTML = `
        <h4>${task.name}</h4>
        <p>${task.description}</p>
        <p>Récompense: ${task.reward} points</p>
        <p>Status: ${task.completed ? '✅ Complétée' : '❌ Non complétée'}</p>
      `;
      tasksList.appendChild(div);
    });
  } catch (err) {
    tasksList.innerHTML = `<p>Erreur: ${err.message}</p>`;
  }
}

// Update claim button state and timer
function updateClaimState() {
  if (!lastClaimTime) {
    claimButton.disabled = false;
    claimProgress.value = 0;
    claimTimer.textContent = 'Prêt à réclamer !';
    return;
  }

  const now = Date.now();
  const last = new Date(lastClaimTime).getTime();
  const elapsed = now - last;

  if (elapsed >= CLAIM_INTERVAL_MS) {
    claimButton.disabled = false;
    claimProgress.value = 100;
    claimTimer.textContent = 'Prêt à réclamer !';
  } else {
    claimButton.disabled = false;
    let allowedClaim = false;
    let points = 100; // valeur normale

    if (elapsed >= CLAIM_HALF_INTERVAL_MS) {
      // claim à 30mn possible mais valeur réduite
      allowedClaim = true;
      points = 30;
    } else {
      allowedClaim = false;
      points = 0;
    }

    claimButton.disabled = !allowedClaim;
    claimProgress.value = (elapsed / CLAIM_INTERVAL_MS) * 100;
    const remainingMs = CLAIM_INTERVAL_MS - elapsed;
    const minutes = Math.floor(remainingMs / 60000);
    const seconds = Math.floor((remainingMs % 60000) / 1000);
    claimTimer.textContent = allowedClaim
      ? `Claim partiel possible: ${points} points`
      : `Prochain claim dans ${minutes}m ${seconds}s`;
  }
}

// Animate claim button (pulse effect)
function animateClaimSuccess() {
  claimButton.classList.add('pulse');
  setTimeout(() => claimButton.classList.remove('pulse'), 1000);
}

// Claim function
async function doClaim() {
  claimButton.disabled = true;
  claimButton.textContent = 'Réclamation en cours...';

  try {
    const res = await fetch('/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId })
    });
    const data = await res.json();

    if (data.success) {
      lastClaimTime = new Date().toISOString();
      animateClaimSuccess();
      alert(data.message);
    } else {
      alert(`Erreur: ${data.message}`);
    }
  } catch (err) {
    alert(`Erreur réseau: ${err.message}`);
  } finally {
    claimButton.textContent = 'Claim';
    updateClaimState();
  }
}

// Referrals load
async function loadReferrals() {
  referralsInfo.textContent = 'Chargement...';
  referralsList.innerHTML = '';

  try {
    const res = await fetch(`/referral/${userId}`);
    if (!res.ok) throw new Error('Erreur chargement parrainage');
    const data = await res.json();

    referralsInfo.innerHTML = `
      <p>Code de parrainage : <b>${data.referralCode}</b></p>
      <p>Nombre de filleuls : <b>${data.referralsCount}</b></p>
      <p>Points gagnés : <b>${data.pointsEarned}</b></p>
    `;

    if (data.referrals.length > 0) {
      referralsList.innerHTML = '<h4>Filleuls :</h4>';
      data.referrals.forEach(r => {
        const li = document.createElement('li');
        li.textContent = `UserID: ${r.userId} - Rejoint le ${new Date(r.joinDate).toLocaleDateString()}`;
        referralsList.appendChild(li);
      });
    } else {
      referralsList.innerHTML = '<p>Aucun filleul pour le moment.</p>';
    }
  } catch (err) {
    referralsInfo.textContent = `Erreur: ${err.message}`;
  }
}

// Initialisation
function init() {
  showSection(sectionClaim);
  updateClaimState();

  // Timer de rafraîchissement claim toutes les secondes
  setInterval(updateClaimState, 1000);

  claimButton.addEventListener('click', doClaim);
}

// Démarrage app
document.addEventListener('DOMContentLoaded', init);
