import { google } from 'googleapis';

class GoogleSheetsService {
  constructor() {
    this.sheets = null;
    this.authClient = null;
  }

  async init() {
    if (!process.env.GOOGLE_CREDS_B64) {
      throw new Error('GOOGLE_CREDS_B64 environment variable is missing');
    }

    const credentials = JSON.parse(Buffer.from(process.env.GOOGLE_CREDS_B64, 'base64').toString());

    this.authClient = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    this.sheets = google.sheets({ version: 'v4', auth: this.authClient });
    console.log('Google Sheets initialized successfully');
  }

  async readTasks() {
    try {
      const res = await this.sheets.spreadsheets.values.get({
        spreadsheetId: process.env.GOOGLE_SHEET_ID,
        range: 'Tasks!A2:E', // ID, Description, Image, Reward, Statut
      });

      return (res.data.values || []).map(row => ({
        id: row[0],
        description: row[1],
        image: row[2],
        reward: row[3],
        status: row[4],
        completed: row[4] === 'COMPLETED' || false,
      }));
    } catch (error) {
      console.error('Error reading tasks:', error);
      throw new Error('Failed to fetch tasks');
    }
  }

  async getAllTasks() {
    return this.readTasks();
  }

  async getAvailableTasks() {
    const allTasks = await this.getAllTasks();
    return allTasks.filter(task => !task.completed);
  }

  async getUserData(userId) {
    try {
      const res = await this.sheets.spreadsheets.values.get({
        spreadsheetId: process.env.GOOGLE_SHEET_ID,
        range: 'Users!A2:G', // Date_Inscription, Username, user_id, Balance, Last_Claim_Time, Referral_Code, Mining_Speed
      });

      const rows = res.data.values || [];
      const userData = rows.find(row => row[2] === userId.toString()); // Cherche par user_id

      if (!userData) {
        return null;
      }

      return {
        username: userData[1], // Username
        balance: userData[3], // Balance
        lastClaim: userData[4], // Last_Claim_Time
        referralCode: userData[5], // Referral_Code
        miningSpeed: userData[6] // Mining_Speed
      };
    } catch (error) {
      console.error('Error getting user data:', error);
      throw new Error('Failed to fetch user data');
    }
  }

  async claimTask(userId, taskId) {
    try {
      const tasks = await this.readTasks();

      let task;
      if (taskId) {
        task = tasks.find(t => t.id === taskId);
        if (!task) throw new Error('Task not found');
      } else {
        task = tasks.find(t => !t.completed);
        if (!task) throw new Error('No available tasks to claim');
      }

      await this.sheets.spreadsheets.values.append({
        spreadsheetId: process.env.GOOGLE_SHEET_ID,
        range: process.env.TRANSACTIONS_RANGE || 'Transactions!A2:E',
        valueInputOption: 'USER_ENTERED',
        resource: {
          values: [[
            new Date().toISOString(),
            userId,
            task.id,
            task.reward,
            'PENDING'
          ]],
        },
      });

      return {
        success: true,
        message: `Tâche réclamée avec succès ! Récompense : ${task.reward}`,
        taskId: task.id,
        reward: task.reward
      };
    } catch (error) {
      console.error('Claim error:', error);
      return { success: false, message: error.message };
    }
  }

  async claimSpecificTask(userId, taskId) {
    return this.claimTask(userId, taskId);
  }

  async getUserData(userId) {
    try {
      // Récupérer les transactions de l'utilisateur
      const transactionsRes = await this.sheets.spreadsheets.values.get({
        spreadsheetId: process.env.GOOGLE_SHEET_ID,
        range: 'Transactions!A2:D', // User_ID, Points, Type, Timestamp
      });

      // Récupérer les informations utilisateur
      const usersRes = await this.sheets.spreadsheets.values.get({
        spreadsheetId: process.env.GOOGLE_SHEET_ID,
        range: 'Users!A2:G', // Date_Inscription, Username, user_id, Balance, Last_Claim_Time, Referral_Code, Mining_Speed
      });

      // Trouver les transactions de l'utilisateur
      const transactions = (transactionsRes.data.values || []).filter(row => row[0] === userId);
      // Calculer le solde total
      const balance = transactions.reduce((sum, row) => sum + (parseFloat(row[1]) || 0), 0);

      // Trouver les informations utilisateur
      const userRow = (usersRes.data.values || []).find(row => row[2] === userId);
      const username = userRow ? userRow[1] : 'Utilisateur';
      const lastClaim = userRow ? new Date(userRow[4]).toLocaleDateString() : 'Aucun';
      const miningSpeed = userRow ? parseFloat(userRow[6]) || 0 : 0;

      return {
        userId,
        username,
        balance: balance.toFixed(2),
        lastClaim,
        mining_speed: miningSpeed
      };

    } catch (error) {
      console.error('Error getting user data:', error);
      throw new Error(`Failed to get user data: ${error.message}`);
    }
  }

  async getReferralInfo(code) {
    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: process.env.GOOGLE_SHEET_ID,
        range: "Referals!A2:E"  // Referrer, Reward, Filleul_ID, Filleul_Username, Date
      });
      
      // Trouver les références de l'utilisateur
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
      console.error('Erreur getReferralInfo:', error);
      throw error;
    }
  }

  async claimRandomTask(userId) {
    const availableTasks = await this.getAvailableTasks();
    
    if (!availableTasks.length) {
      return { 
        success: false,
        error: "No available tasks",
        message: "Aucune tâche disponible actuellement"
      };
    }

    const task = availableTasks[Math.floor(Math.random() * availableTasks.length)];
    return this.claimTask(userId, task.id);
  }
}

const googleSheetsService = new GoogleSheetsService();

module.exports = {
  initGoogleSheets: () => googleSheetsService.init(),
  readTasks: () => googleSheetsService.readTasks(),
  claimTask: (userId, taskId) => googleSheetsService.claimTask(userId, taskId),
  claimRandomTask: (userId) => googleSheetsService.claimRandomTask(userId),
  getReferralInfo: (code) => googleSheetsService.getReferralInfo(code),
  getAvailableTasks: () => googleSheetsService.getAvailableTasks(),
  getUserData: (userId) => googleSheetsService.getUserData(userId),
  getSheetInstance: () => googleSheetsService.sheets
};