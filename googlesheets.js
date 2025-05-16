const { google } = require('googleapis');

let sheets;
let authClient;

function initGoogleSheets() {
  if (process.env.GOOGLE_CREDS_B64) {
    const buff = Buffer.from(process.env.GOOGLE_CREDS_B64, 'base64');
    authClient = new google.auth.GoogleAuth({
      credentials: JSON.parse(buff.toString()),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
  } else if (process.env.GOOGLE_CREDS) {
    authClient = new google.auth.GoogleAuth({
      credentials: JSON.parse(process.env.GOOGLE_CREDS),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
  } else {
    throw new Error('Google credentials are missing');
  }
  sheets = google.sheets({ version: 'v4', auth: authClient });
}

async function readTasks() {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: process.env.TASKS_RANGE,
  });
  const rows = res.data.values || [];
  // Transform rows to objects with header keys
  // Suppose first row is headers, here skipped as range starts at row 2
  return rows.map(row => ({
    TaskID: row[0],
    Description: row[1],
    Reward: row[2],
    Status: row[3],
  }));
}

async function claimTaskForUser(userId, taskId) {
  // Simplified claim logic: check if user already claimed, then insert transaction

  // Get all transactions
  const txRes = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: process.env.TRANSACTION_RANGE,
  });
  const txRows = txRes.data.values || [];

  // Check if user already claimed this task
  const alreadyClaimed = txRows.some(tx => tx[1] == userId && tx[2] == taskId);
  if (alreadyClaimed) {
    return { success: false, message: 'Tâche déjà réclamée.' };
  }

  // Append new transaction
  const now = new Date().toISOString();
  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: process.env.TRANSACTION_RANGE,
    valueInputOption: 'USER_ENTERED',
    resource: {
      values: [[txRows.length + 1, userId, taskId, now, 'claimed']],
    },
  });

  return { success: true, message: 'Réclamation enregistrée avec succès!' };
}

async function getReferralInfo(code) {
  // Dummy: retourner une info statique
  return { code, reward: 10, referredUsers: 5 };
}

module.exports = {
  initGoogleSheets,
  readTasks,
  claimTaskForUser,
  getReferralInfo,
};
