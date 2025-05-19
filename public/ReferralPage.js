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

      // Génération du lien de parrainage
      const botUsername = tg.initDataUnsafe.user?.username || 'ton_bot';
      const referralCode = data.referralCode || `ref_${tg.initDataUnsafe.user?.id}`;
      const referralLink = `https://t.me/${CRYPTORATS_bot}?start=${referralCode}`;

      // Mise à jour de l'interface
      document.getElementById('referral-link').value = referralLink;
      document.getElementById('referral-count').textContent = data.referralCount ?? 0;
      document.getElementById('referral-earnings').textContent = data.earnedTokens ?? 0;

      // Affichage des filleuls
      const listContainer = document.getElementById('referral-list');
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

      // Gestion du bouton copie
      document.getElementById('copy-referral-btn').addEventListener('click', () => {
        const linkInput = document.getElementById('referral-link');
        linkInput.select();
        document.execCommand('copy');
        
        const btn = document.getElementById('copy-referral-btn');
        btn.innerHTML = '<span class="copy-icon">✓</span>';
        setTimeout(() => {
          btn.innerHTML = '<span class="copy-icon">⎘</span>';
        }, 2000);
      });

    } catch (error) {
      console.error("Erreur Referral:", error);
      const errorContainer = document.getElementById('referral-list') || content;
      errorContainer.innerHTML = `
        <div class="error-message">
          ${error.message || 'Erreur de chargement'}
          <button onclick="ReferralPage.showReferralPage()" class="retry-button">Réessayer</button>
        </div>
      `;
    }
  }
};

window.ReferralPage = ReferralPage;