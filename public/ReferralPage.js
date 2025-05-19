const ReferralPage = {
  showReferralPage: async function() {
    // Vérifications initiales
    const content = document.getElementById('content');
    if (!content) {
      console.error("Element 'content' introuvable");
      return;
    }

    if (!window.Telegram?.WebApp) {
      content.innerHTML = `<div class="error-message">Ouvrez via Telegram</div>`;
      return;
    }

    // Template avec améliorations
    content.innerHTML = `
      <div class="referral-container">
        <h2>👥 Programme de Parrainage</h2>
        
        <div class="referral-card">
          <h3>Votre lien unique</h3>
          <div class="referral-link-container">
            <input type="text" id="referral-link" readonly value="Génération...">
            <button id="copy-referral-btn" class="copy-button">
              <span class="copy-icon">⎘</span>
              <span class="copy-text">Copier</span>
            </button>
          </div>
          <p class="small-text">Partagez pour gagner 10% de leurs gains</p>
        </div>

        <div class="stats-container">
          <div class="stat-card">
            <span class="stat-value" id="referral-count">0</span>
            <span class="stat-label">Filleuls</span>
          </div>
          <div class="stat-card">
            <span class="stat-value" id="referral-earnings">0</span>
            <span class="stat-label">Vos gains</span>
          </div>
        </div>

        <div id="referral-list" class="referral-list">
          <div class="loading-spinner"></div>
        </div>
      </div>
    `;

    try {
      const tg = window.Telegram.WebApp;
      const user = tg.initDataUnsafe?.user;
      
      if (!user?.id) throw new Error("ID utilisateur introuvable");

      // 1. Génération garantie du lien
      const BOT_USERNAME = 'CRYPTORATS_bot'; // À confirmer
      const referralLink = `https://t.me/${BOT_USERNAME}?start=ref_${user.id}`;
      
      // 2. Mise à jour immédiate du champ
      const linkInput = document.getElementById('referral-link');
      if (!linkInput) throw new Error("Champ lien introuvable");
      linkInput.value = referralLink;

      // 3. Bouton copie fonctionnel (version améliorée)
      const copyBtn = document.getElementById('copy-referral-btn');
      if (copyBtn) {
        copyBtn.addEventListener('click', () => {
          linkInput.select();
          document.execCommand('copy');
          
          // Feedback visuel complet
          const icon = copyBtn.querySelector('.copy-icon');
          const text = copyBtn.querySelector('.copy-text');
          if (icon) icon.textContent = '✓';
          if (text) text.textContent = 'Copié!';
          
          setTimeout(() => {
            if (icon) icon.textContent = '⎘';
            if (text) text.textContent = 'Copier';
          }, 2000);
        });
      }

      // 4. Enregistrement (conservé de l'ancienne version)
      const registerResponse = await fetch('/register-referral', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Telegram-Data': tg.initData
        },
        body: JSON.stringify({
          userId: user.id,
          referralCode: `ref_${user.id}`,
          username: user.username || 'Anonyme'
        })
      });
      if (!registerResponse.ok) throw new Error("Échec enregistrement");

      // 5. Récupération des données (version optimisée)
      const statsResponse = await fetch('/get-referrals', {
        headers: {
          'Telegram-Data': tg.initData,
          'Content-Type': 'application/json'
        }
      });
      const referralData = await statsResponse.json();

      // 6. Mise à jour de l'UI (avec vérifications)
      const updateElement = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
      };

      updateElement('referral-count', referralData.referralCount ?? 0);
      updateElement('referral-earnings', referralData.earnedTokens ?? 0);

      const listContainer = document.getElementById('referral-list');
      if (listContainer) {
        listContainer.innerHTML = referralData.referrals?.length > 0 
          ? referralData.referrals.map(ref => `
              <div class="referral-item">
                <span>${ref.username || 'Anonyme'}</span>
                <span>${new Date(ref.date).toLocaleDateString('fr-FR')}</span>
                <span class="reward-badge">+${Math.floor(ref.reward * 0.1)} tokens</span>
              </div>
            `).join('')
          : '<p class="no-referrals">Aucun filleul actif</p>';
      }

    } catch (error) {
      console.error('Erreur:', error);
      
      // Fallback amélioré
      const linkInput = document.getElementById('referral-link');
      if (linkInput) linkInput.value = 'https://t.me/CRYPTORATS_bot';

      const errorContainer = document.getElementById('referral-list') || content;
      if (errorContainer) {
        errorContainer.innerHTML = `
          <div class="error-message">
            ${error.message || 'Erreur système'}
            <button onclick="ReferralPage.showReferralPage()">Réessayer</button>
          </div>
        `;
      }
    }
  }
};

window.ReferralPage = ReferralPage;