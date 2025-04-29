const { google } = require("googleapis");
const { analyzeExpenses } = require("./geminiService");
const { getAuthClient } = require("./googleSheetsService");
const { convertToIST } = require("../utils/expenseParser");

/**
 * Get expense report for a specified number of days
 * @param {Message} message - Discord message object
 * @param {number} days - Number of days to report on
 * @returns {Promise<void>}
 */
async function getExpenseReport(message, days) {
  try {
    // Fetch expense data from Google Sheets
    const expenses = await fetchRecentExpenses(days);

    if (!expenses || expenses.length === 0) {
      await message.reply(`No expenses found for the last ${days} days.`);
      return;
    }

    // Calculate basic statistics
    const stats = calculateExpenseStats(expenses);

    // Format the basic report
    const basicReport = formatBasicReport(stats, days);
    await message.reply(basicReport);

    // If Gemini is available, provide AI analysis
    if (process.env.GEMINI_API_KEY) {
      try {
        // Convert expenses to a more analysis-friendly format
        const formattedExpenses = expenses.map((expense) => ({
          date: expense.date,
          category: expense.category,
          amount: expense.amount,
        }));

        // Get AI insights
        const insights = await analyzeExpenses(formattedExpenses);
        if (insights) {
          await message.reply(`**AI Insights:**\n${insights}`);
        }
      } catch (error) {
        console.error("Error getting AI insights:", error);
        // Continue without AI insights
      }
    }
  } catch (error) {
    console.error("Error generating expense report:", error);
    await message.reply(
      "Sorry, there was an error generating your expense report."
    );
  }
}

/**
 * Parse a date string in DD/MM/YYYY format
 * @param {string} dateStr - Date string in DD/MM/YYYY format
 * @returns {Date} - JavaScript Date object
 */
function parseISTDateString(dateStr) {
  if (!dateStr) return null;

  // Handle both DD/MM/YYYY and DD-MM-YYYY formats
  const parts = dateStr.includes("/") ? dateStr.split("/") : dateStr.split("-");

  if (parts.length !== 3) return null;

  // Create date (parts[0] is day, parts[1] is month (0-based), parts[2] is year)
  // Month is 0-indexed in JavaScript Date
  return new Date(parts[2], parts[1] - 1, parts[0]);
}

/**
 * Fetch expense data from Google Sheets for the specified period
 * @param {number} days - Number of days to look back
 * @returns {Promise<Array>} - Array of expense records
 */
async function fetchRecentExpenses(days) {
  try {
    const auth = await getAuthClient();
    const sheets = google.sheets({ version: "v4", auth });
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;

    // Get all expense data
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "Sheet1!A:E", // Now includes Description and Timestamp columns
    });

    // Skip the header row
    const rows = response.data.values || [];
    if (rows.length <= 1) return [];

    const expenses = [];
    const dateThreshold = convertToIST(new Date());
    dateThreshold.setDate(dateThreshold.getDate() - days);

    // Process each row (skipping header)
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (row.length >= 3) {
        const dateStr = row[0]; // Now in DD/MM/YYYY format
        const expenseDate = parseISTDateString(dateStr);

        if (expenseDate && expenseDate >= dateThreshold) {
          expenses.push({
            date: dateStr,
            category: row[1],
            amount: parseFloat(row[2]),
            description: row[3] || "", // Include description if available
            timestamp: row[4] || "", // Include timestamp if available
          });
        }
      }
    }

    return expenses;
  } catch (error) {
    console.error("Error fetching expenses from Google Sheets:", error);
    throw error;
  }
}

/**
 * Calculate basic statistics from expense data
 * @param {Array} expenses - Array of expense records
 * @returns {Object} - Object containing expense statistics
 */
function calculateExpenseStats(expenses) {
  // Initialize stats object
  const stats = {
    total: 0,
    byCategory: {},
    count: expenses.length,
    average: 0,
    highest: { amount: 0, category: "", date: "" },
    lowest: { amount: Infinity, category: "", date: "" },
  };

  // Calculate statistics
  expenses.forEach((expense) => {
    const amount = parseFloat(expense.amount);

    // Update total
    stats.total += amount;

    // Update category totals
    if (!stats.byCategory[expense.category]) {
      stats.byCategory[expense.category] = 0;
    }
    stats.byCategory[expense.category] += amount;

    // Track highest expense
    if (amount > stats.highest.amount) {
      stats.highest = {
        amount,
        category: expense.category,
        date: expense.date,
      };
    }

    // Track lowest expense
    if (amount < stats.lowest.amount) {
      stats.lowest = {
        amount,
        category: expense.category,
        date: expense.date,
      };
    }
  });

  // Calculate average
  stats.average = stats.count > 0 ? stats.total / stats.count : 0;

  return stats;
}

/**
 * Format a basic expense report from calculated statistics
 * @param {Object} stats - Object containing expense statistics
 * @param {number} days - Number of days in the report
 * @returns {string} - Formatted report
 */
function formatBasicReport(stats, days) {
  // Sort categories by amount spent (descending)
  const sortedCategories = Object.entries(stats.byCategory)
    .sort((a, b) => b[1] - a[1])
    .map(([category, amount]) => ({ category, amount }));

  let report = `
**Expense Report - Last ${days} Days**

**Summary:**
Total Spent: $${stats.total.toFixed(2)}
Number of Expenses: ${stats.count}
Average Expense: $${stats.average.toFixed(2)}

**Highest Expense:**
$${stats.highest.amount.toFixed(2)} - ${stats.highest.category} (${
    stats.highest.date
  })

**Spending by Category:**
${sortedCategories
  .map((c) => `- ${c.category}: $${c.amount.toFixed(2)}`)
  .join("\n")}
`;

  return report;
}

/**
 * Get expenses by category from Google Sheets
 * @param {string} category - Category to filter by
 * @param {number} days - Number of days to look back
 * @returns {Promise<Array>} - Array of expense records for the category
 */
async function getExpensesByCategory(category, days = 30) {
  try {
    const allExpenses = await fetchRecentExpenses(days);

    // Filter expenses by category
    return allExpenses.filter(
      (expense) => expense.category.toLowerCase() === category.toLowerCase()
    );
  } catch (error) {
    console.error("Error fetching category expenses:", error);
    throw error;
  }
}

module.exports = {
  getExpenseReport,
  fetchRecentExpenses,
  getExpensesByCategory,
};
