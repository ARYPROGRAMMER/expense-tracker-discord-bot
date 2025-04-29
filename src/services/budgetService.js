const fs = require("fs").promises;
const path = require("path");
const { getExpensesByCategory } = require("./reportService");

// Path to store budget data
const BUDGET_FILE_PATH = path.join(__dirname, "../../config/budgets.json");

/**
 * Analyze expenses against budget for a category
 * @param {Message} message - Discord message object
 * @param {string} category - Category to analyze
 * @param {number} budgetAmount - Budget amount for the category
 * @returns {Promise<void>}
 */
async function analyzeBudget(message, category, budgetAmount) {
  try {
    // Save/update the budget
    await saveBudget(category, budgetAmount);

    // Get expenses for this category in the current month
    const expenses = await getExpensesByCategory(category, 30);

    if (!expenses || expenses.length === 0) {
      await message.reply(
        `No recent expenses found for the ${category} category. Budget set to $${budgetAmount}.`
      );
      return;
    }

    // Calculate total spent
    const totalSpent = expenses.reduce(
      (sum, expense) => sum + expense.amount,
      0
    );

    // Calculate percentage of budget used
    const percentUsed = (totalSpent / budgetAmount) * 100;

    // Prepare basic budget analysis
    let analysis = `
**Budget Analysis: ${category}**
Monthly Budget: $${budgetAmount.toFixed(2)}
Spent So Far: $${totalSpent.toFixed(2)}
Remaining: $${(budgetAmount - totalSpent).toFixed(2)}
Budget Used: ${percentUsed.toFixed(1)}%
`;

    // Add status indicator
    if (percentUsed >= 100) {
      analysis +=
        "\n⚠️ **Budget Exceeded!** You have spent more than your allocated budget.";
    } else if (percentUsed >= 80) {
      analysis += "\n⚠️ **Warning!** You are close to exceeding your budget.";
    } else {
      analysis += "\n✅ You are within your budget limits.";
    }

    // Add AI recommendations if available
    if (process.env.GEMINI_API_KEY) {
      try {
        const { provideBudgetRecommendations } = require("./geminiService");
        const recommendations = await provideBudgetRecommendations(
          category,
          budgetAmount,
          totalSpent,
          expenses
        );
        if (recommendations) {
          analysis += `\n\n**AI Recommendations:**\n${recommendations}`;
        }
      } catch (error) {
        console.error("Error getting budget recommendations:", error);
        // Continue without AI recommendations
      }
    }

    await message.reply(analysis);
  } catch (error) {
    console.error("Error analyzing budget:", error);
    await message.reply("Sorry, there was an error analyzing your budget.");
  }
}

/**
 * Save budget for a category
 * @param {string} category - Category to save budget for
 * @param {number} amount - Budget amount
 * @returns {Promise<void>}
 */
async function saveBudget(category, amount) {
  try {
    // Ensure budgets file exists
    let budgets = {};
    try {
      const data = await fs.readFile(BUDGET_FILE_PATH, "utf8");
      budgets = JSON.parse(data);
    } catch (error) {
      // File doesn't exist or is invalid - create a new one
      budgets = {};
    }

    // Update budget for category
    budgets[category.toLowerCase()] = {
      amount: amount,
      updatedAt: new Date().toISOString(),
    };

    // Save updated budgets
    await fs.writeFile(
      BUDGET_FILE_PATH,
      JSON.stringify(budgets, null, 2),
      "utf8"
    );
  } catch (error) {
    console.error("Error saving budget:", error);
    throw error;
  }
}

/**
 * Get budget for a category
 * @param {string} category - Category to get budget for
 * @returns {Promise<number|null>} - Budget amount or null if not set
 */
async function getBudget(category) {
  try {
    // Read budgets file
    const data = await fs.readFile(BUDGET_FILE_PATH, "utf8");
    const budgets = JSON.parse(data);

    // Get budget for category
    const budget = budgets[category.toLowerCase()];
    return budget ? budget.amount : null;
  } catch (error) {
    console.error("Error getting budget:", error);
    return null;
  }
}

/**
 * Get all budgets
 * @returns {Promise<Object|null>} - All budgets or null if error
 */
async function getAllBudgets() {
  try {
    // Read budgets file
    const data = await fs.readFile(BUDGET_FILE_PATH, "utf8");
    return JSON.parse(data);
  } catch (error) {
    console.error("Error getting budgets:", error);
    return null;
  }
}

module.exports = {
  analyzeBudget,
  saveBudget,
  getBudget,
  getAllBudgets,
};
