const ReferralPage = {
  showReferralPage: async function() {
    const content = document.getElementById('content');
    if (!content) {
      console.error("Element 'content' introuvable");
      return;
    }

    content.innerHTML = `
      <div class="referral-container">
        <h2>Programme de Parrainage</h2>
        <div id="ref-data">Chargement en cours...</div>
      </div>
    `;

    try {
      const tg = window.Telegram?.WebApp;
      const userId = tg?.initDataUnsafe?.user?.id;
      if (!userId) throw new Error("Non connecté via Telegram");

      console.log("Fetching referrals for user:", userId);

      const response = await fetch(`/api/referrals?user_id=${encodeURIComponent(userId)}`, {
        headers: {
          'Telegram-Data': tg.initData,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Erreur serveur: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      console.log("Referral data received:", data);

      const refDataDiv = document.getElementById('ref-data');
      refDataDiv.innerHTML = `<pre>${JSON.stringify(data, null, 2)}</pre>`;

      // Bouton rafraîchir ajouté proprement
      const refreshBtn = document.createElement('button');
      refreshBtn.textContent = "Rafraîchir";
      refreshBtn.addEventListener('click', () => ReferralPage.showReferralPage());
      refDataDiv.appendChild(refreshBtn);

    } catch (error) {
      console.error("Erreur ReferralPage:", error);
      content.innerHTML = `
        <div class="error">
          Erreur: ${error.message}
        </div>
      `;

      // Bouton réessayer
      const retryBtn = document.createElement('button');
      retryBtn.textContent = "Réessayer";
      retryBtn.addEventListener('click', () => ReferralPage.showReferralPage());
      content.querySelector('.error').appendChild(retryBtn);
    }
  }
};
