const { google } = require("googleapis");
const { analyzeExpenses } = require("./geminiService");
const { getAuthClient } = require("./googleSheetsService");
const { convertToIST, formatDateToIST } = require("../utils/expenseParser");

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
 * Generate an expense summary for a specific period (week, month, year)
 * @param {Message} message - Discord message object
 * @param {string} period - Period to summarize (week, month, year)
 * @returns {Promise<void>}
 */
async function generateExpenseSummary(message, period) {
  try {
    let days;
    let periodName;
    
    switch (period.toLowerCase()) {
      case 'week':
        days = 7;
        periodName = 'Weekly';
        break;
      case 'month':
        days = 30;
        periodName = 'Monthly';
        break;
      case 'year':
        days = 365;
        periodName = 'Yearly';
        break;
      default:
        days = 30;
        periodName = 'Monthly';
    }

    // Fetch expense data 
    const expenses = await fetchRecentExpenses(days);
    
    if (!expenses || expenses.length === 0) {
      await message.reply(`No expenses found for the ${periodName.toLowerCase()} period.`);
      return;
    }

    // Get time range to make the summary more accurate
    const oldestDate = getOldestExpenseDate(expenses);
    const newestDate = getNewestExpenseDate(expenses);

    // Calculate summary statistics
    const stats = calculateSummaryStats(expenses, period);

    // Format the summary
    const summary = formatPeriodSummary(stats, periodName, oldestDate, newestDate);
    await message.reply(summary);

    // If Gemini is available, provide AI predictions and suggestions
    if (process.env.GEMINI_API_KEY) {
      try {
        const { generateMonthlyDigest } = require("./geminiService");
        
        // Get previous period for comparison
        let previousPeriodDays = days;
        const currentPeriodExpenses = expenses;
        
        // Fetch previous period expenses
        const previousStartDate = new Date();
        previousStartDate.setDate(previousStartDate.getDate() - (days * 2));
        const previousEndDate = new Date();
        previousEndDate.setDate(previousEndDate.getDate() - days);
        
        const previousExpenses = await fetchExpensesForDateRange(
          formatDateToIST(previousStartDate), 
          formatDateToIST(previousEndDate)
        );
        
        if (previousExpenses && previousExpenses.length > 0) {
          const digest = await generateMonthlyDigest(currentPeriodExpenses, previousExpenses);
          
          if (digest && digest.insights) {
            const aiInsightsMessage = `
**AI-Powered ${periodName} Insights:**
${digest.insights}

${digest.suggestions && digest.suggestions.length > 0 ? '**Suggestions:**\n' + digest.suggestions.map(s => `- ${s}`).join('\n') : ''}
`;
            await message.reply(aiInsightsMessage);
          }
        }
      } catch (error) {
        console.error("Error generating AI digest:", error);
        // Continue without AI insights
      }
    }
  } catch (error) {
    console.error("Error generating expense summary:", error);
    await message.reply(
      "Sorry, there was an error generating your expense summary."
    );
  }
}

/**
 * Calculate summary statistics with period-specific analysis
 * @param {Array} expenses - Array of expenses
 * @param {string} period - Period type (week, month, year)
 * @returns {Object} - Summary statistics
 */
function calculateSummaryStats(expenses, period) {
  const stats = calculateExpenseStats(expenses);
  
  // Add period-specific stats
  stats.periodType = period;
  
  // Calculate daily average
  stats.dailyAverage = stats.total / (period === 'week' ? 7 : period === 'month' ? 30 : 365);
  
  // Get top spending days (for week/month)
  if (period !== 'year') {
    const expensesByDay = {};
    
    expenses.forEach(expense => {
      const dateObj = parseISTDateString(expense.date);
      const dayName = getDayName(dateObj);
      
      if (!expensesByDay[dayName]) {
        expensesByDay[dayName] = 0;
      }
      expensesByDay[dayName] += expense.amount;
    });
    
    stats.topSpendingDays = Object.entries(expensesByDay)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([day, amount]) => ({ day, amount }));
  }
  
  // Calculate spending trend (basic)
  if (expenses.length >= 3) {
    const sortedByDate = [...expenses].sort((a, b) => {
      return parseISTDateString(a.date) - parseISTDateString(b.date);
    });
    
    const firstThird = sortedByDate.slice(0, Math.floor(sortedByDate.length / 3));
    const lastThird = sortedByDate.slice(Math.floor(sortedByDate.length * 2 / 3));
    
    const firstThirdTotal = firstThird.reduce((sum, exp) => sum + exp.amount, 0);
    const lastThirdTotal = lastThird.reduce((sum, exp) => sum + exp.amount, 0);
    
    const trend = lastThirdTotal - firstThirdTotal;
    stats.trend = trend > 0 ? 'increasing' : trend < 0 ? 'decreasing' : 'stable';
    stats.trendPercentage = firstThirdTotal !== 0 ? 
      (Math.abs(trend) / firstThirdTotal * 100).toFixed(1) : 0;
  } else {
    stats.trend = 'insufficient data';
    stats.trendPercentage = 0;
  }
  
  return stats;
}

/**
 * Format a summary for a specific time period
 * @param {Object} stats - Summary statistics
 * @param {string} periodName - Name of the period (Weekly, Monthly, Yearly)
 * @param {string} startDate - Start date of the period
 * @param {string} endDate - End date of the period
 * @returns {string} - Formatted summary
 */
function formatPeriodSummary(stats, periodName, startDate, endDate) {
  // Sort categories by amount spent (descending)
  const sortedCategories = Object.entries(stats.byCategory)
    .sort((a, b) => b[1] - a[1])
    .map(([category, amount]) => ({ category, amount }));

  let summary = `
**${periodName} Expense Summary** ${startDate && endDate ? `(${startDate} - ${endDate})` : ''}

**Overview:**
Total Spent: $${stats.total.toFixed(2)}
Daily Average: $${stats.dailyAverage.toFixed(2)}
Number of Expenses: ${stats.count}
Average Expense: $${stats.average.toFixed(2)}

**Highest Expense:**
$${stats.highest.amount.toFixed(2)} - ${stats.highest.category} (${stats.highest.date})

**Top Spending Categories:**
${sortedCategories.slice(0, 3).map((c, i) => `${i+1}. ${c.category}: $${c.amount.toFixed(2)} (${(c.amount/stats.total*100).toFixed(1)}%)`).join('\n')}
`;

  // Add trend analysis if available
  if (stats.trend && stats.trend !== 'insufficient data') {
    summary += `\n**Spending Trend:** ${stats.trend} ${stats.trendPercentage > 0 ? `by ${stats.trendPercentage}%` : ''}`;
  }

  // Add day analysis for week/month
  if (stats.topSpendingDays && stats.topSpendingDays.length > 0) {
    summary += `\n\n**Top Spending Days:**\n${stats.topSpendingDays.map((d) => `${d.day}: $${d.amount.toFixed(2)}`).join('\n')}`;
  }

  return summary;
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
 * Get the day name from a Date object
 * @param {Date} date - Date object
 * @returns {string} - Day name (Monday, Tuesday, etc.)
 */
function getDayName(date) {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[date.getDay()];
}

/**
 * Get the oldest expense date from an array of expenses
 * @param {Array} expenses - Array of expenses
 * @returns {string} - Oldest date in DD/MM/YYYY format
 */
function getOldestExpenseDate(expenses) {
  if (!expenses || expenses.length === 0) return null;
  
  let oldestDate = parseISTDateString(expenses[0].date);
  
  expenses.forEach(expense => {
    const expenseDate = parseISTDateString(expense.date);
    if (expenseDate && expenseDate < oldestDate) {
      oldestDate = expenseDate;
    }
  });
  
  return formatDateToIST(oldestDate);
}

/**
 * Get the newest expense date from an array of expenses
 * @param {Array} expenses - Array of expenses
 * @returns {string} - Newest date in DD/MM/YYYY format
 */
function getNewestExpenseDate(expenses) {
  if (!expenses || expenses.length === 0) return null;
  
  let newestDate = parseISTDateString(expenses[0].date);
  
  expenses.forEach(expense => {
    const expenseDate = parseISTDateString(expense.date);
    if (expenseDate && expenseDate > newestDate) {
      newestDate = expenseDate;
    }
  });
  
  return formatDateToIST(newestDate);
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
 * Fetch expenses for a specific date range
 * @param {string} startDate - Start date in DD/MM/YYYY format
 * @param {string} endDate - End date in DD/MM/YYYY format
 * @returns {Promise<Array>} - Array of expense records
 */
async function fetchExpensesForDateRange(startDate, endDate) {
  try {
    const auth = await getAuthClient();
    const sheets = google.sheets({ version: "v4", auth });
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;

    // Get all expense data
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "Sheet1!A:E",
    });

    // Skip the header row
    const rows = response.data.values || [];
    if (rows.length <= 1) return [];

    const expenses = [];
    const startDateObj = parseISTDateString(startDate);
    const endDateObj = parseISTDateString(endDate);

    // Process each row (skipping header)
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (row.length >= 3) {
        const dateStr = row[0];
        const expenseDate = parseISTDateString(dateStr);

        if (expenseDate && expenseDate >= startDateObj && expenseDate <= endDateObj) {
          expenses.push({
            date: dateStr,
            category: row[1],
            amount: parseFloat(row[2]),
            description: row[3] || "",
            timestamp: row[4] || "",
          });
        }
      }
    }

    return expenses;
  } catch (error) {
    console.error("Error fetching expenses for date range:", error);
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
  generateExpenseSummary,
  fetchExpensesForDateRange,
};
