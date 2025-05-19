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
            <input type="text" id="referral-link" readonly value="Chargement...">
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

      const response = await fetch('/get-referrals', {
        headers: {
          'Telegram-Data': tg.initData,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Erreur ${response.status}`);
      }

      const data = await response.json();
      console.log("Données reçues:", data);

      // PARTIE CRITIQUE - Génération du lien de parrainage
      const botUsername = 'CRYPTORATS_bot'; // Remplacez par le vrai username de votre bot
      let referralCode = data.referralCode;
      
      if (!referralCode) {
        // Fallback 1: Utiliser l'ID utilisateur Telegram
        const userId = tg.initDataUnsafe.user?.id;
        if (userId) {
          referralCode = `ref_${userId}`;
        } else {
          // Fallback 2: Générer un code temporaire
          referralCode = `temp_${Math.random().toString(36).substring(2, 8)}`;
        }
      }

      const referralLink = `https://t.me/${botUsername}?start=${encodeURIComponent(referralCode)}`;
      console.log("Lien de parrainage généré:", referralLink); // Important pour le debug

      // Mise à jour de l'interface
      const linkInput = document.getElementById('referral-link');
      if (linkInput) {
        linkInput.value = referralLink;
      } else {
        console.error("Champ referral-link introuvable");
      }

      // Mise à jour des statistiques
      if (document.getElementById('referral-count')) {
        document.getElementById('referral-count').textContent = data.referralCount ?? 0;
      }
      if (document.getElementById('referral-earnings')) {
        document.getElementById('referral-earnings').textContent = data.earnedTokens ?? 0;
      }

      // Affichage des filleuls
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

      // Gestion du bouton copie
      const copyBtn = document.getElementById('copy-referral-btn');
      if (copyBtn) {
        copyBtn.addEventListener('click', () => {
          if (linkInput) {
            linkInput.select();
            document.execCommand('copy');
            
            // Feedback visuel
            copyBtn.innerHTML = '<span class="copy-icon">✓</span>';
            setTimeout(() => {
              copyBtn.innerHTML = '<span class="copy-icon">⎘</span>';
            }, 2000);
          }
        });
      }

    } catch (error) {
      console.error("Erreur Referral:", error);
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