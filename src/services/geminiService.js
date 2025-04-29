const { GoogleGenerativeAI } = require("@google/generative-ai");

// Initialize Gemini with the API key
let genAI = null;
let model = null;

/**
 * Initialize the Gemini AI service
 * @returns {boolean} True if initialization was successful
 */
function initializeGemini() {
  try {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      console.warn(
        "Gemini API key not found. Gemini features will be disabled."
      );
      return false;
    }

    genAI = new GoogleGenerativeAI(apiKey);

    // Using Gemini Pro model - you can change to another model if needed
    model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    console.log("Gemini AI initialized successfully");
    return true;
  } catch (error) {
    console.error("Failed to initialize Gemini AI:", error);
    return false;
  }
}

/**
 * Check if Gemini is initialized
 * @returns {boolean} True if Gemini is initialized
 */
function isGeminiAvailable() {
  return model !== null;
}

/**
 * Use Gemini to categorize an expense based on description
 * @param {string} description - Description of the expense
 * @returns {Promise<string>} - Suggested category for the expense
 */
async function categorizeExpense(description) {
  if (!isGeminiAvailable()) {
    return "Other"; // Default category if Gemini is not available
  }

  try {
    const prompt = `
      Categorize the following expense into one of these categories:
      - Food
      - Transportation
      - Entertainment
      - Utilities
      - Housing
      - Healthcare
      - Personal
      - Education
      - Other

      Expense description: "${description}"
      
      Return only the category name, nothing else.
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const category = response.text().trim();

    return category;
  } catch (error) {
    console.error("Error categorizing expense with Gemini:", error);
    return "Other"; // Default category if categorization fails
  }
}

/**
 * Generate insights about spending patterns based on recent expenses
 * @param {Array} expenses - Array of recent expenses
 * @returns {Promise<string>} - Insights about spending patterns
 */
async function analyzeExpenses(expenses) {
  if (!isGeminiAvailable()) {
    return null; // Skip analysis if Gemini is not available
  }

  try {
    const expensesJSON = JSON.stringify(expenses);

    const prompt = `
      Analyze the following expense data and provide brief insights about spending patterns:
      ${expensesJSON}
      
      Provide 2-3 short insights about spending patterns, areas to save money, or unusual expenses.
      Keep your response under 150 words.
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text().trim();
  } catch (error) {
    console.error("Error analyzing expenses with Gemini:", error);
    return "Unable to analyze expenses at this time.";
  }
}

/**
 * Provide budget recommendations based on spending patterns
 * @param {string} category - Expense category
 * @param {number} budget - Budget amount
 * @param {number} spent - Amount spent
 * @param {Array} expenses - Array of expenses in the category
 * @returns {Promise<string>} - Budget recommendations
 */
async function provideBudgetRecommendations(category, budget, spent, expenses) {
  if (!isGeminiAvailable()) {
    return null; // Skip recommendations if Gemini is not available
  }

  try {
    const data = {
      category,
      budget,
      spent,
      percentUsed: (spent / budget) * 100,
      expenses,
    };

    const prompt = `
      Analyze this budget data and provide practical recommendations:
      ${JSON.stringify(data)}

      If they are over budget, suggest specific ways to reduce spending in this category.
      If they are under budget, suggest whether they should maintain current habits or if the budget could be adjusted.
      Include one specific, actionable tip related to this spending category.
      Keep your response under 120 words and focus on being practical and helpful.
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text().trim();
  } catch (error) {
    console.error("Error getting budget recommendations:", error);
    return null;
  }
}

/**
 * Enhance expense description with more context
 * @param {string} description - Brief expense description
 * @returns {Promise<string>} - Enhanced description with more context
 */
async function enhanceExpenseDescription(description) {
  if (!isGeminiAvailable()) {
    return description; // Return original description if Gemini is not available
  }

  try {
    const prompt = `
      This is a brief expense description: "${description}"
      
      Please add a bit more context about what this expense might represent, but keep it very short (under 15 words).
      Return only the enhanced description, nothing else.
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text().trim();
  } catch (error) {
    console.error("Error enhancing expense description:", error);
    return description; // Return original description if enhancement fails
  }
}

/**
 * Generate monthly spending digest with personalized insights
 * @param {Array} monthExpenses - Array of expenses from the past month
 * @param {Array} previousMonthExpenses - Array of expenses from the previous month
 * @returns {Promise<Object>} - Spending digest with insights and suggestions
 */
async function generateMonthlyDigest(monthExpenses, previousMonthExpenses) {
  if (!isGeminiAvailable()) {
    return {
      insights:
        "Monthly spending digest is only available with Gemini integration.",
      suggestions: [],
    };
  }

  try {
    // Calculate basic stats for comparison
    const currentTotal = monthExpenses.reduce(
      (sum, expense) => sum + expense.amount,
      0
    );
    const previousTotal = previousMonthExpenses.reduce(
      (sum, expense) => sum + expense.amount,
      0
    );

    const data = {
      currentMonth: {
        expenses: monthExpenses,
        total: currentTotal,
      },
      previousMonth: {
        expenses: previousMonthExpenses,
        total: previousTotal,
      },
      percentChange: ((currentTotal - previousTotal) / previousTotal) * 100,
    };

    const prompt = `
      Analyze this monthly spending data and provide personalized insights:
      ${JSON.stringify(data)}

      Generate a response with:
      1. A brief overview of spending compared to last month
      2. 2-3 specific observations about spending patterns
      3. 2 practical suggestions for the coming month

      Format your response as JSON with these fields:
      {
        "insights": "Your analysis text here (150 words max)",
        "suggestions": ["Suggestion 1", "Suggestion 2"]
      }
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;

    try {
      return JSON.parse(response.text().trim());
    } catch (jsonError) {
      // If JSON parsing fails, return a formatted object with the text
      return {
        insights: response.text().trim().substring(0, 300),
        suggestions: [
          "Review your spending categories",
          "Consider setting up a budget",
        ],
      };
    }
  } catch (error) {
    console.error("Error generating monthly digest:", error);
    return {
      insights: "Unable to generate insights at this time.",
      suggestions: ["Review your spending manually", "Try again later"],
    };
  }
}

/**
 * Detect potential duplicate expenses
 * @param {Object} newExpense - The new expense to check
 * @param {Array} recentExpenses - Recent expenses to check against
 * @returns {Promise<Object|null>} - Potential duplicate or null if none found
 */
async function detectDuplicateExpense(newExpense, recentExpenses) {
  // This function works without Gemini too
  try {
    // Look for potential duplicates
    const potentialDuplicates = recentExpenses.filter((expense) => {
      // Consider an expense a potential duplicate if:
      // 1. Same category
      // 2. Same or very similar amount (within $1)
      // 3. Added within 48 hours

      const sameCategory = expense.category === newExpense.category;
      const similarAmount = Math.abs(expense.amount - newExpense.amount) < 1;

      const newDate = new Date(newExpense.date);
      const expenseDate = new Date(expense.date);
      const hoursDifference =
        Math.abs(newDate - expenseDate) / (1000 * 60 * 60);
      const recentTimestamp = hoursDifference < 48;

      return sameCategory && similarAmount && recentTimestamp;
    });

    if (potentialDuplicates.length > 0) {
      return potentialDuplicates[0];
    }

    return null;
  } catch (error) {
    console.error("Error checking for duplicate expenses:", error);
    return null;
  }
}

module.exports = {
  initializeGemini,
  isGeminiAvailable,
  categorizeExpense,
  analyzeExpenses,
  provideBudgetRecommendations,
  enhanceExpenseDescription,
  generateMonthlyDigest,
  detectDuplicateExpense,
};
