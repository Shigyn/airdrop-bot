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
            <input type="text" id="referral-link" readonly value="Création de votre lien...">
            <button id="copy-referral-btn" class="copy-button">
              <span class="copy-icon">⎘</span>
            </button>
          </div>
          <p class="small-text">Partagez ce lien pour gagner 10% de leurs gains</p>
        </div>

        <div class="stats-container">
          <div class="stat-card">
            <span class="stat-value" id="referral-count">0</span>
            <span class="stat-label">Filleuls actifs</span>
          </div>
          <div class="stat-card">
            <span class="stat-value" id="referral-earnings">0</span>
            <span class="stat-label">Vos récompenses</span>
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

      // 1. Récupération de l'ID utilisateur
      const userId = tg.initDataUnsafe.user?.id;
      if (!userId) throw new Error("ID utilisateur introuvable");

      // 2. Génération du lien avec l'ID utilisateur intégré
      const BOT_USERNAME = 'CRYPTORATS_bot'; // À remplacer par votre @username_bot
      const referralCode = `ref_${userId}`;
      const referralLink = `https://t.me/${BOT_USERNAME}?start=${referralCode}`;
      
      console.log("Lien de parrainage généré:", referralLink);

      // 3. Envoi des données au backend pour enregistrement
      const registerResponse = await fetch('/register-referral', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Telegram-Data': tg.initData
        },
        body: JSON.stringify({
          userId: userId,
          referralCode: referralCode,
          username: tg.initDataUnsafe.user?.username || 'Anonyme'
        })
      });

      if (!registerResponse.ok) {
        throw new Error("Échec de l'enregistrement");
      }

      // 4. Récupération des données de parrainage
      const statsResponse = await fetch('/get-referrals', {
        headers: {
          'Telegram-Data': tg.initData,
          'Content-Type': 'application/json'
        }
      });

      if (!statsResponse.ok) {
        throw new Error(`Erreur HTTP ${statsResponse.status}`);
      }

      const referralData = await statsResponse.json();
      console.log("Données de parrainage:", referralData);

      // 5. Mise à jour de l'interface
      const updateUI = () => {
        try {
          // a) Lien de parrainage
          const linkInput = document.getElementById('referral-link');
          if (linkInput) linkInput.value = referralLink;

          // b) Statistiques
          const countEl = document.getElementById('referral-count');
          const earningsEl = document.getElementById('referral-earnings');
          if (countEl) countEl.textContent = referralData.referralCount ?? 0;
          if (earningsEl) earningsEl.textContent = referralData.earnedTokens ?? 0;

          // c) Liste des filleuls
          const listContainer = document.getElementById('referral-list');
          if (listContainer) {
            if (referralData.referrals?.length > 0) {
              listContainer.innerHTML = referralData.referrals.map(ref => `
                <div class="referral-item">
                  <span>${ref.username || 'Nouveau membre'} - ${new Date(ref.date).toLocaleDateString('fr-FR')}</span>
                  <span class="reward-badge">+${Math.floor(ref.reward * 0.1)} tokens (10%)</span>
                </div>
              `).join('');
            } else {
              listContainer.innerHTML = '<p class="no-referrals">Aucun filleul actif pour le moment</p>';
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
      const linkInput = document.getElementById('referral-link');
      if (linkInput) {
        linkInput.value = 'https://t.me/CRYPTORATS_bot';
      }

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