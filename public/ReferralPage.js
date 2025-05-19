const ReferralPage = {
  showReferralPage: async function() {
    // Vérification que l'élément content existe
    const content = document.getElementById('content');
    if (!content) {
      console.error("Element 'content' introuvable");
      return;
    }

    // Vérification que Telegram WebApp est initialisé
    if (!window.Telegram?.WebApp) {
      content.innerHTML = `
        <div class="error-message">
          Veuillez ouvrir cette page via l'application Telegram
        </div>
      `;
      return;
    }

    content.innerHTML = `
      <div class="referral-container">
        <h2>👥 Programme de Parrainage</h2>
        
        <div class="referral-card">
          <h3>Votre lien unique</h3>
          <div class="referral-link-container">
            <input type="text" id="referral-link" readonly value="Génération du lien...">
            <button id="copy-referral-btn" class="copy-button">
              <span class="copy-icon">⎘</span>
            </button>
          </div>
          <p class="small-text">Partagez ce lien pour gagner des bonus</p>
        </div>

        <div class="stats-container">
          <div class="stat-card">
            <span class="stat-value" id="referral-count">0</span>
            <span class="stat-label">Filleuls</span>
          </div>
          <div class="stat-card">
            <span class="stat-value" id="referral-earnings">0</span>
            <span class="stat-label">Tokens gagnés</span>
          </div>
        </div>

        <div id="referral-list" class="referral-list">
          <div class="loading-spinner"></div>
        </div>
      </div>
    `;

    try {
      const tg = window.Telegram.WebApp;
      if (!tg.initData) throw new Error("Données Telegram non disponibles");

      // 1. Récupération des données du backend
      const response = await fetch('/get-referrals', {
        headers: {
          'Telegram-Data': tg.initData,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Erreur HTTP ${response.status}`);
      }

      const data = await response.json();
      console.log("Données reçues:", data);

      // 2. Génération ABSOLUMENT GARANTIE du lien
      const generateReferralLink = () => {
        // a) Nom du bot (à confirmer)
        const BOT_USERNAME = 'CRYPTORATS_bot'; // Remplacer par @username réel
        
        // b) Code de parrainage (5 sources possibles par ordre de priorité)
        const referralSources = [
          data.referralCode,                          // 1. Depuis le backend
          tg.initDataUnsafe.start_param,              // 2. Paramètre de démarrage
          `ref_${tg.initDataUnsafe.user?.id}`,        // 3. ID utilisateur
          `usr_${tg.initDataUnsafe.user?.username}`,  // 4. Nom d'utilisateur
          `tmp_${Math.random().toString(36).substr(2, 8)}` // 5. Code temporaire
        ];
        
        const validCode = referralSources.find(code => code && code.trim().length > 0);
        return `https://t.me/${BOT_USERNAME}?start=${encodeURIComponent(validCode)}`;
      };

      const referralLink = generateReferralLink();
      console.log("Lien GÉNÉRÉ:", referralLink); // DEBUG OBLIGATOIRE

      // 3. Mise à jour de l'interface avec vérifications strictes
      const updateUI = () => {
        try {
          // a) Lien de parrainage
          const linkInput = document.getElementById('referral-link');
          if (linkInput) linkInput.value = referralLink;

          // b) Statistiques
          const countEl = document.getElementById('referral-count');
          const earningsEl = document.getElementById('referral-earnings');
          if (countEl) countEl.textContent = data.referralCount ?? 0;
          if (earningsEl) earningsEl.textContent = data.earnedTokens ?? 0;

          // c) Liste des filleuls
          const listContainer = document.getElementById('referral-list');
          if (listContainer) {
            if (data.referrals?.length > 0) {
              listContainer.innerHTML = data.referrals.map(ref => `
                <div class="referral-item">
                  <span>${ref.username || 'Utilisateur'} - ${new Date(ref.date).toLocaleDateString('fr-FR')}</span>
                  <span class="reward-badge">+${ref.reward || 0} tokens</span>
                </div>
              `).join('');
            } else {
              listContainer.innerHTML = '<p class="no-referrals">Aucun filleul pour le moment</p>';
            }
          }

          // d) Bouton copie
          const copyBtn = document.getElementById('copy-referral-btn');
          if (copyBtn && linkInput) {
            copyBtn.addEventListener('click', () => {
              linkInput.select();
              document.execCommand('copy');
              copyBtn.innerHTML = '<span class="copy-icon">✓</span>';
              setTimeout(() => {
                copyBtn.innerHTML = '<span class="copy-icon">⎘</span>';
              }, 2000);
            });
          }
        } catch (uiError) {
          console.error("Erreur UI:", uiError);
        }
      };

      updateUI();

    } catch (error) {
      console.error("Erreur Referral:", error);
      
      // Fallback ULTIME
      const fallbackLink = 'https://t.me/CRYPTORATS_bot'; // Lien de secours
      const linkInput = document.getElementById('referral-link');
      if (linkInput) linkInput.value = fallbackLink;

      const errorContainer = document.getElementById('referral-list') || content;
      if (errorContainer) {
        errorContainer.innerHTML = `
          <div class="error-message">
            ${error.message || 'Erreur de chargement'}
            <button onclick="ReferralPage.showReferralPage()" class="retry-button">Réessayer</button>
          </div>
        `;
      }
    }
  }
};

window.ReferralPage = ReferralPage;