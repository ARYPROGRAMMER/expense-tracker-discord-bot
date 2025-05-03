// filepath: d:\bounty\expense-tracker-bot\src\services\expenseEditorService.js
const { google } = require("googleapis");
const { getAuthClient } = require("./googleSheetsService");
const { fetchRecentExpenses } = require("./reportService");

/**
 * Find an expense by criteria for editing or deletion
 * @param {string} category - Expense category to search for
 * @param {number} amount - Expense amount to search for
 * @param {string} date - Optional date to narrow down search
 * @returns {Promise<Object>} Found expense with row information
 */
async function findExpense(category, amount, date = null) {
  try {
    // Get the expenses from the last 30 days (reasonable window for edits)
    const recentExpenses = await fetchRecentExpenses(30);
    
    // Filter the expenses based on provided criteria
    const filteredExpenses = recentExpenses.filter(expense => {
      // Category and amount must match
      const categoryMatch = expense.category.toLowerCase() === category.toLowerCase();
      const amountMatch = Math.abs(expense.amount - amount) < 0.01; // Allow for tiny rounding differences
      
      // If date is provided, it must match too
      if (date) {
        return categoryMatch && amountMatch && expense.date === date;
      } else {
        return categoryMatch && amountMatch;
      }
    });
    
    if (filteredExpenses.length === 0) {
      return { found: false };
    }
    
    // If multiple matches found, get the row numbers for all of them
    const matchingRows = await findMatchingRowNumbers(filteredExpenses);
    
    return {
      found: true,
      count: matchingRows.length,
      expenses: filteredExpenses,
      rows: matchingRows
    };
  } catch (error) {
    console.error("Error finding expense:", error);
    throw error;
  }
}

/**
 * Find row numbers for matching expenses in the sheet
 * @param {Array} expenses - Array of expense objects to find
 * @returns {Promise<Array>} - Array of row indexes
 */
async function findMatchingRowNumbers(expenses) {
  try {
    const auth = await getAuthClient();
    const sheets = google.sheets({ version: "v4", auth });
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    
    // Get all expense data
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "Sheet1!A:E",
    });
    
    const rows = response.data.values || [];
    const matchingRows = [];
    
    // For each expense we're trying to find
    for (const expense of expenses) {
      // Look through all rows in the sheet (starting from 1 to account for header)
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (row.length >= 3) {
          const rowDate = row[0];
          const rowCategory = row[1];
          const rowAmount = parseFloat(row[2]);
          
          // If all fields match, add this row to our matches
          if (rowDate === expense.date && 
              rowCategory.toLowerCase() === expense.category.toLowerCase() && 
              Math.abs(rowAmount - expense.amount) < 0.01) {
            matchingRows.push(i + 1); // +1 because sheets API is 1-indexed
          }
        }
      }
    }
    
    return matchingRows;
  } catch (error) {
    console.error("Error finding matching row numbers:", error);
    throw error;
  }
}

/**
 * Delete an expense by row number
 * @param {number} rowNumber - Row number in spreadsheet
 * @returns {Promise<boolean>} Success of deletion
 */
async function deleteExpense(rowNumber) {
  try {
    const auth = await getAuthClient();
    const sheets = google.sheets({ version: "v4", auth });
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    
    // Delete the row
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      resource: {
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId: 0,
                dimension: "ROWS",
                startIndex: rowNumber - 1, // 0-indexed
                endIndex: rowNumber // exclusive
              }
            }
          }
        ]
      }
    });
    
    return true;
  } catch (error) {
    console.error("Error deleting expense:", error);
    throw error;
  }
}

/**
 * Edit an expense by row number
 * @param {number} rowNumber - Row number in spreadsheet
 * @param {Object} expenseData - New expense data
 * @returns {Promise<boolean>} Success of update
 */
async function editExpense(rowNumber, expenseData) {
  try {
    const auth = await getAuthClient();
    const sheets = google.sheets({ version: "v4", auth });
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    
    // Format the row data
    const values = [
      [
        expenseData.date,
        expenseData.category,
        expenseData.amount,
        expenseData.description || "",
        expenseData.timestamp || "", // Keep original timestamp if available
      ],
    ];
    
    // Update the row
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `Sheet1!A${rowNumber}:E${rowNumber}`,
      valueInputOption: "USER_ENTERED",
      resource: { values }
    });
    
    return true;
  } catch (error) {
    console.error("Error editing expense:", error);
    throw error;
  }
}

/**
 * List recent expenses for a user to select for editing
 * @param {number} limit - Number of expenses to list
 * @returns {Promise<Array>} Array of recent expenses
 */
async function listRecentExpenses(limit = 10) {
  try {
    const recentExpenses = await fetchRecentExpenses(30);
    return recentExpenses.slice(-limit); // Return just the most recent ones
  } catch (error) {
    console.error("Error listing recent expenses:", error);
    throw error;
  }
}

module.exports = {
  findExpense,
  deleteExpense,
  editExpense,
  listRecentExpenses,
};