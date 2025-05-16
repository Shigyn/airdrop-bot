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

    const credentials = JSON.parse(
      Buffer.from(process.env.GOOGLE_CREDS_B64, 'base64').toString()
    );

    this.authClient = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });

    this.sheets = google.sheets({ version: 'v4', auth: this.authClient });
    console.log('Google Sheets initialized successfully');
  }

  async readTasks() {
    try {
      const res = await this.sheets.spreadsheets.values.get({
        spreadsheetId: process.env.GOOGLE_SHEET_ID,
        range: process.env.TASKS_RANGE || 'Tasks!A2:D'
      });

      return (res.data.values || []).map(row => ({
        id: row[0],
        description: row[1],
        reward: row[2],
        status: row[3]
      }));
    } catch (error) {
      console.error('Error reading tasks:', error);
      throw new Error('Failed to fetch tasks');
    }
  }

  async claimTask(userId, taskId) {
    try {
      // Verify task exists
      const tasks = await this.readTasks();
      const task = tasks.find(t => t.id === taskId);
      if (!task) throw new Error('Task not found');

      // Record transaction
      await this.sheets.spreadsheets.values.append({
        spreadsheetId: process.env.GOOGLE_SHEET_ID,
        range: process.env.TRANSACTIONS_RANGE || 'Transactions!A2:E',
        valueInputOption: 'USER_ENTERED',
        resource: {
          values: [[
            new Date().toISOString(),
            userId,
            taskId,
            task.reward,
            'PENDING'
          ]]
        }
      });

      return {
        success: true,
        message: `Task claimed successfully! Reward: ${task.reward}`
      };
    } catch (error) {
      console.error('Claim error:', error);
      throw error;
    }
  }

  async getReferralInfo(code) {
    // Implement your referral logic here
    return {
      code,
      reward: 10,
      referrals: 0
    };
  }
}

module.exports = new GoogleSheetsService();