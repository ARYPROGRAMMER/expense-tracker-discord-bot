const { google } = require("googleapis");
const fs = require("fs");
const path = require("path");

// Define scope for Google Sheets API
const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

// Cached auth client to prevent multiple authentications
let auth = null;

/**
 * Get authenticated Google client using service account credentials
 * @returns {Promise<JWT>} Authenticated Google client
 */
async function getAuthClient() {
  if (auth) {
    return auth;
  }

  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

  // Check if credentials file exists
  if (!fs.existsSync(credentialsPath)) {
    throw new Error(
      "Google credentials file not found. Please place your credentials.json in the config directory."
    );
  }

  try {
    // Read credentials file
    const credentials = JSON.parse(fs.readFileSync(credentialsPath, "utf8"));

    // Create JWT client for service account
    const { JWT } = google.auth;
    auth = new JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: SCOPES,
    });

    return auth;
  } catch (error) {
    console.error("Error reading or parsing credentials:", error);
    throw error;
  }
}

/**
 * Add expense data to Google Sheet
 * @param {Object} expenseData - The expense data to add
 * @returns {Promise<void>}
 */
async function addExpenseToSheet(expenseData) {
  try {
    const auth = await getAuthClient();
    const sheets = google.sheets({ version: "v4", auth });
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;

    // Verify that we have a spreadsheet ID
    if (!spreadsheetId) {
      throw new Error("Google Sheet ID not found in environment variables");
    }

    // Format data for Google Sheets - now includes description if available
    const values = [
      [
        expenseData.date,
        expenseData.category,
        expenseData.amount,
        expenseData.description || "", // Add description column
        new Date().toISOString(), // Add timestamp
      ],
    ];

    // Append data to the sheet
    const response = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: "Sheet1!A:E", // Extended range to include description and timestamp
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      resource: {
        values,
      },
    });

    console.log(
      `${response.data.updates.updatedCells} cells updated in Google Sheet`
    );
    return response;
  } catch (error) {
    console.error("Error adding expense to Google Sheet:", error);
    throw error;
  }
}

/**
 * Initialize the Google Sheet with headers if it's empty
 * @returns {Promise<void>}
 */
async function initializeSheet() {
  try {
    const auth = await getAuthClient();
    const sheets = google.sheets({ version: "v4", auth });
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;

    // Check if sheet has data
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "Sheet1!A1:E1",
    });

    // If no data or no headers, add headers
    if (!response.data.values || response.data.values.length === 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: "Sheet1!A1:E1",
        valueInputOption: "USER_ENTERED",
        resource: {
          values: [["Date", "Category", "Amount", "Description", "Timestamp"]],
        },
      });
      console.log("Sheet initialized with headers");
    }
  } catch (error) {
    console.error("Error initializing Google Sheet:", error);
    throw error;
  }
}

/**
 * Create a new worksheet in the Google Sheet
 * @param {string} sheetTitle - Title for the new sheet
 * @returns {Promise<string>} - ID of the new sheet
 */
async function createNewSheet(sheetTitle) {
  try {
    const auth = await getAuthClient();
    const sheets = google.sheets({ version: "v4", auth });
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;

    // Add new sheet
    const addSheetResponse = await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      resource: {
        requests: [
          {
            addSheet: {
              properties: {
                title: sheetTitle,
              },
            },
          },
        ],
      },
    });

    const newSheetId =
      addSheetResponse.data.replies[0].addSheet.properties.sheetId;

    // Initialize the sheet with headers
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetTitle}!A1:E1`,
      valueInputOption: "USER_ENTERED",
      resource: {
        values: [["Date", "Category", "Amount", "Description", "Timestamp"]],
      },
    });

    return newSheetId;
  } catch (error) {
    console.error("Error creating new sheet:", error);
    throw error;
  }
}

/**
 * Export budget data to a dedicated sheet
 * @param {Object} budgetData - Budget data to export
 * @returns {Promise<void>}
 */
async function exportBudgetData(budgetData) {
  try {
    const auth = await getAuthClient();
    const sheets = google.sheets({ version: "v4", auth });
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;

    // Check if Budgets sheet exists, create if not
    try {
      await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: "Budgets!A1",
      });
    } catch (error) {
      // Sheet likely doesn't exist, create it
      await createNewSheet("Budgets");
    }

    // Format budget data for the sheet
    const budgetRows = Object.entries(budgetData).map(([category, data]) => [
      category,
      data.amount,
      data.updatedAt,
    ]);

    // Clear existing data and add new data
    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: "Budgets!A2:C",
    });

    if (budgetRows.length > 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: "Budgets!A2",
        valueInputOption: "USER_ENTERED",
        resource: {
          values: budgetRows,
        },
      });
    }

    console.log("Budget data exported successfully");
  } catch (error) {
    console.error("Error exporting budget data:", error);
    throw error;
  }
}

module.exports = {
  getAuthClient,
  addExpenseToSheet,
  initializeSheet,
  createNewSheet,
  exportBudgetData,
};
