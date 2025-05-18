const { google } = require('googleapis');

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
        range: process.env.TASKS_RANGE || 'Tasks!A2:D',
      });

      return (res.data.values || []).map(row => ({
        id: row[0],
        description: row[1],
        reward: row[2],
        status: row[3],
        completed: row[3] === 'COMPLETED' || false,
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

  async claimRandomTask(userId) {
    const availableTasks = await this.getAvailableTasks();
    
    if (!availableTasks.length) {
      return { 
        success: false,
        error: "No available tasks",
        message: "Aucune tâche disponible actuellement"
      };
    }
    
    const randomTask = availableTasks[Math.floor(Math.random() * availableTasks.length)];
    return this.claimTask(userId, randomTask.id);
  }

  async getUserData(userId) {
    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: process.env.GOOGLE_SHEET_ID,
        range: "Users!A2:F"
      });
      
      console.log("Debug - Données utilisateurs:", response.data.values);
      
      const user = (response.data.values || []).find(row => row[2] === userId);
      
      if (!user) {
        console.log("Utilisateur non trouvé pour ID:", userId);
        return null;
      }
      
      return {
        username: user[1] || "Anonyme",
        balance: user[3] || "0",
        lastClaim: user[4] || null
      };
    } catch (error) {
      console.error('Erreur getUserData:', error);
      throw error;
    }
  }

  async getReferralInfo(code) {
    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: process.env.GOOGLE_SHEET_ID,
        range: "Referrals!A2:D"
      });
      
      const referral = (response.data.values || []).find(row => row[0] === code);
      
      return referral ? {
        referralCode: code,
        pointsEarned: referral[1] || 0,
        referralsCount: referral[2] || 0,
        referrals: referral[3] ? referral[3].split(',') : []
      } : null;
    } catch (error) {
      console.error('Erreur getReferralInfo:', error);
      throw error;
    }
  }
}

const googleSheetsService = new GoogleSheetsService();

module.exports = {
  initGoogleSheets: () => googleSheetsService.init(),
  readTasks: () => googleSheetsService.readTasks(),
  claimTaskForUser: (userId, taskId) => googleSheetsService.claimTask(userId, taskId),
  claimRandomTaskForUser: (userId) => googleSheetsService.claimRandomTask(userId),
  getReferralInfo: (code) => googleSheetsService.getReferralInfo(code),
  getAvailableTasks: () => googleSheetsService.getAvailableTasks(),
  getUserData: (userId) => googleSheetsService.getUserData(userId),
  getSheetInstance: () => googleSheetsService.sheets
};