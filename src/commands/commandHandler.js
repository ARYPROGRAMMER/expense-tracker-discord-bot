const fs = require("fs");
const path = require("path");
const { handleExpenseMessage } = require("../services/expenseHandler");
const { getExpenseReport } = require("../services/reportService");
const { analyzeBudget } = require("../services/budgetService");

// Command prefix for explicit commands
const PREFIX = "!";

// Available commands
const COMMANDS = {
  HELP: "help",
  REPORT: "report",
  BUDGET: "budget",
  CATEGORY: "categories",
  SUMMARY: "summary",
};

/**
 * Process commands and messages
 * @param {Message} message - Discord message object
 * @returns {Promise<void>}
 */
async function processMessage(message) {
  const content = message.content.trim();

  // Check if this is a command (starts with prefix)
  if (content.startsWith(PREFIX)) {
    await handleCommand(message, content.slice(PREFIX.length).trim());
    return;
  }

  // If not a command, treat as an expense
  await handleExpenseMessage(message);
}

/**
 * Handle explicit commands
 * @param {Message} message - Discord message object
 * @param {string} commandText - Command text without prefix
 * @returns {Promise<void>}
 */
async function handleCommand(message, commandText) {
  const args = commandText.split(" ");
  const command = args[0].toLowerCase();

  try {
    switch (command) {
      case COMMANDS.HELP:
        await sendHelpMessage(message);
        break;

      case COMMANDS.REPORT:
        const days = args[1] ? parseInt(args[1]) : 30;
        await message.reply(
          `Generating expense report for the last ${days} days...`
        );
        await getExpenseReport(message, days);
        break;

      case COMMANDS.BUDGET:
        const category = args[1];
        const amount = args[2] ? parseFloat(args[2]) : null;

        if (!category || !amount) {
          await message.reply(
            "Please provide a category and amount. Example: `!budget Groceries 200`"
          );
          return;
        }

        await analyzeBudget(message, category, amount);
        break;

      case COMMANDS.CATEGORY:
        await sendCategoryList(message);
        break;

      case COMMANDS.SUMMARY:
        const period = args[1] || "month";
        await message.reply(`Generating ${period}ly expense summary...`);
        await generateSummary(message, period);
        break;

      default:
        await message.reply(
          `Unknown command. Type \`${PREFIX}help\` for a list of commands.`
        );
        break;
    }
  } catch (error) {
    console.error(`Error handling command ${command}:`, error);
    await message.reply("Sorry, there was an error processing your command.");
  }
}

/**
 * Send help information
 * @param {Message} message - Discord message object
 */
async function sendHelpMessage(message) {
  const helpText = `
**Expense Tracker Bot Commands**

**Adding Expenses:**
Simply send a message like: "Groceries $45.50" or "Coffee $3.75 04/28/2025"
You can also just send an amount like "$25" and the bot will help categorize it

**Commands:**
\`${PREFIX}help\` - Show this help message
\`${PREFIX}report [days]\` - Generate expense report for specified days (default: 30)
\`${PREFIX}budget [category] [amount]\` - Set or check budget for a category
\`${PREFIX}categories\` - List available expense categories
\`${PREFIX}summary [month|year|week]\` - Generate a summary of expenses

**Examples:**
\`${PREFIX}report 7\` - Report for last 7 days
\`${PREFIX}budget Groceries 200\` - Set grocery budget to $200
\`${PREFIX}summary month\` - Monthly expense summary
`;

  await message.reply(helpText);
}

/**
 * Send list of expense categories
 * @param {Message} message - Discord message object
 */
async function sendCategoryList(message) {
  const categories = [
    "Food",
    "Transportation",
    "Entertainment",
    "Utilities",
    "Housing",
    "Healthcare",
    "Personal",
    "Education",
    "Other",
  ];

  const categoriesText = `
**Available Expense Categories:**

${categories.map((cat) => `- ${cat}`).join("\n")}

When adding expenses, you can use any of these categories or create your own.
`;

  await message.reply(categoriesText);
}

/**
 * Generate a summary of expenses (placeholder for now)
 * @param {Message} message - Discord message object
 * @param {string} period - Summary period (month, year, week)
 */
async function generateSummary(message, period) {
  // This will be implemented in the reportService
  await message.reply(
    `This feature is coming soon! The ${period}ly summary will be available in a future update.`
  );
}

module.exports = {
  processMessage,
};
