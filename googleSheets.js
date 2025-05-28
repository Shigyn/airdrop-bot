const { google } = require('googleapis');

class GoogleSheetsService {
  constructor() {
    this.sheets = null;
    this.authClient = null;
  }

  async init() {
  try {
    if (!process.env.GOOGLE_CREDS_B64) {
      throw new Error('GOOGLE_CREDS_B64 is required');
    }

    const credentials = JSON.parse(
      Buffer.from(process.env.GOOGLE_CREDS_B64, 'base64').toString('utf-8')
    );

    // Vérification des champs obligatoires
    if (!credentials.client_email || !credentials.private_key) {
      throw new Error('Google credentials are incomplete');
    }

    this.authClient = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    this.sheets = google.sheets({
      version: 'v4',
      auth: await this.authClient.getClient()
    });

    // Test de connexion avec timeout
    const testResponse = await Promise.race([
      this.sheets.spreadsheets.values.get({
        spreadsheetId: process.env.GOOGLE_SHEET_ID,
        range: 'Users!A1'
      }),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Google Sheets timeout')), 5000)
    )
    ]);

    if (!testResponse.data) {
      throw new Error('Empty response from Google Sheets');
    }

    return this;
  } catch (error) {
    console.error('Google Sheets init error:', {
      message: error.message,
      stack: error.stack
    });
    throw error;
  }
}

  async readTasks() {
    try {
      const res = await this.sheets.spreadsheets.values.get({
        spreadsheetId: process.env.GOOGLE_SHEET_ID,
        range: process.env.TASKS_RANGE || 'Tasks!A2:E'
      });

      return (res.data.values || []).map(row => ({
        id: row[0],
        description: row[1],
        image: row[2],
        reward: parseFloat(row[3]) || 0,
        status: row[4],
        completed: row[4] === 'COMPLETED'
      }));
    } catch (error) {
      console.error('Error reading tasks:', error);
      throw new Error('Failed to read tasks from sheet');
    }
  }

  async getUserData(userId) {
    try {
      const [usersRes, transactionsRes] = await Promise.all([
        this.sheets.spreadsheets.values.get({
          spreadsheetId: process.env.GOOGLE_SHEET_ID,
          range: process.env.USER_RANGE || 'Users!A2:G'
        }),
        this.sheets.spreadsheets.values.get({
          spreadsheetId: process.env.GOOGLE_SHEET_ID,
          range: process.env.TRANSACTION_RANGE || 'Transactions!A2:D'
        })
      ]);

      const userRow = (usersRes.data.values || []).find(row => row[2] === userId.toString());
      if (!userRow) return null;

      const transactions = (transactionsRes.data.values || [])
        .filter(row => row[0] === userId.toString());
      
      const balance = transactions.reduce((sum, row) => sum + (parseFloat(row[1]) || 0), 0);

      return {
        username: userRow[1] || `user_${userId}`,
        balance: parseFloat(balance.toFixed(2)),
        lastClaim: userRow[4] || 'Never',
        miningSpeed: parseFloat(userRow[6]) || 0,
        referralCode: userRow[5] || ''
      };
    } catch (error) {
      console.error('Error getting user data:', error);
      throw new Error('Failed to get user data from sheet');
    }
  }

  async getReferralInfo(code) {
    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: process.env.GOOGLE_SHEET_ID,
        range: "Referrals!A2:E"
      });
      
      const referrals = (response.data.values || []).filter(row => row[0] === code);
      
      return {
        referralCode: code,
        pointsEarned: referrals.reduce((sum, row) => sum + (parseFloat(row[1]) || 0), 0),
        referralsCount: referrals.length,
        referrals: referrals.map(row => ({
          id: row[2],
          username: row[3],
          date: row[4]
        }))
      };
    } catch (error) {
      console.error('Error getting referral info:', error);
      throw new Error('Failed to get referral info from sheet');
    }
  }
}

let sheetsInstance = null;

module.exports = {
  initGoogleSheets: async () => {
    if (!sheetsInstance) {
      sheetsInstance = await new GoogleSheetsService().init();
      console.log('Google Sheets service initialized successfully');
    }
    return sheetsInstance;
  },
  
  readTasks: async () => {
    if (!sheetsInstance) throw new Error('Google Sheets service not initialized');
    return sheetsInstance.readTasks();
  },
  
  getUserData: async (userId) => {
    if (!sheetsInstance) throw new Error('Google Sheets service not initialized');
    return sheetsInstance.getUserData(userId);
  },
  
  getReferralInfo: async (code) => {
    if (!sheetsInstance) throw new Error('Google Sheets service not initialized');
    return sheetsInstance.getReferralInfo(code);
  }
};