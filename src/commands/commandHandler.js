const fs = require("fs");
const path = require("path");
const { handleExpenseMessage } = require("../services/expenseHandler");
const { getExpenseReport, generateExpenseSummary } = require("../services/reportService");
const { analyzeBudget, getAllBudgets } = require("../services/budgetService");
const { 
  findExpense, 
  deleteExpense, 
  editExpense, 
  listRecentExpenses
} = require("../services/expenseEditorService");
const { parseExpense } = require("../utils/expenseParser");
const { getCurrentISTTimestamp } = require("../utils/expenseParser");

// Command prefix for explicit commands
const PREFIX = "!";

// Available commands
const COMMANDS = {
  HELP: "help",
  REPORT: "report",
  BUDGET: "budget",
  CATEGORY: "categories",
  SUMMARY: "summary",
  BUDGETS: "budgets",
  TRENDS: "trends",
  EDIT: "edit",
  DELETE: "delete",
  LIST: "list",
  RECENT: "recent",
};

// Store for ongoing edit/delete operations
const pendingOperations = new Map();

/**
 * Process commands and messages
 * @param {Message} message - Discord message object
 * @returns {Promise<void>}
 */
async function processMessage(message) {
  // Check if this is a response to a pending operation
  if (await handlePendingOperation(message)) {
    return; // Message was a response to a pending operation
  }

  // First, clean the message content by removing bot mentions
  const cleanContent = message.content.replace(/<@!?[0-9]+>/g, "").trim();

  // Check if this is a command (starts with prefix)
  if (cleanContent.startsWith(PREFIX)) {
    await handleCommand(message, cleanContent.slice(PREFIX.length).trim());
    return;
  }

  // If not a command, treat as an expense
  await handleExpenseMessage(message);
}

/**
 * Handle responses to pending operations (edits/deletes)
 * @param {Message} message - Discord message object
 * @returns {Promise<boolean>} - Whether the message was handled as a pending operation
 */
async function handlePendingOperation(message) {
  const operation = pendingOperations.get(message.author.id);
  
  if (!operation) return false;
  
  const response = message.content.toLowerCase();
  
  try {
    switch (operation.type) {
      case 'delete_confirm': {
        if (response === 'yes') {
          await deleteExpense(operation.rowNumber);
          await message.reply(`✅ Expense deleted successfully.`);
        } else if (response === 'no') {
          await message.reply(`Deletion canceled.`);
        } else {
          await message.reply(`I didn't understand that. Please reply with 'yes' or 'no'.`);
          return true;
        }
        break;
      }
      
      case 'edit_field': {
        // Handle edit field selection
        const validFields = ['category', 'amount', 'date', 'description'];
        if (validFields.includes(response)) {
          pendingOperations.set(message.author.id, {
            ...operation,
            type: 'edit_value',
            field: response
          });
          await message.reply(`Please enter the new ${response} value:`);
        } else {
          await message.reply(`Invalid field. Please enter one of: category, amount, date, description`);
        }
        return true;
      }
      
      case 'edit_value': {
        // Handle field value update
        const field = operation.field;
        const rowNumber = operation.rowNumber;
        const expenseData = {...operation.expenseData};
        
        switch (field) {
          case 'category':
            expenseData.category = message.content.trim();
            break;
          case 'amount':
            const amount = parseFloat(message.content.replace(/[$,]/g, ''));
            if (isNaN(amount)) {
              await message.reply(`Invalid amount. Please enter a numeric value.`);
              return true;
            }
            expenseData.amount = amount;
            break;
          case 'date':
            // Date format validation could be more complex
            expenseData.date = message.content.trim();
            break;
          case 'description':
            expenseData.description = message.content.trim();
            break;
        }
        
        // Update the expense
        await editExpense(rowNumber, expenseData);
        await message.reply(`✅ Expense updated successfully.`);
        break;
      }
      
      case 'edit_select':
      case 'delete_select': {
        // Handle selection from multiple matches
        const index = parseInt(response) - 1;
        if (isNaN(index) || index < 0 || index >= operation.expenses.length) {
          await message.reply(`Invalid selection. Please enter a number from 1 to ${operation.expenses.length}.`);
          return true;
        }
        
        const expense = operation.expenses[index];
        const rowNumber = operation.rows[index];
        
        if (operation.type === 'delete_select') {
          // Set up delete confirmation
          pendingOperations.set(message.author.id, {
            type: 'delete_confirm',
            rowNumber
          });
          
          await message.reply(
            `Are you sure you want to delete this expense?\n` +
            `- Category: ${expense.category}\n` +
            `- Amount: $${expense.amount}\n` +
            `- Date: ${expense.date}\n` +
            `Reply with 'yes' to confirm or 'no' to cancel.`
          );
        } else {
          // Set up edit field selection
          pendingOperations.set(message.author.id, {
            type: 'edit_field',
            rowNumber,
            expenseData: expense
          });
          
          await message.reply(
            `Which field do you want to edit?\n` +
            `- category\n` +
            `- amount\n` +
            `- date\n` +
            `- description\n`
          );
        }
        return true;
      }
    }
    
    // Clean up after operation is complete
    pendingOperations.delete(message.author.id);
    return true;
  } catch (error) {
    console.error("Error handling pending operation:", error);
    await message.reply("Sorry, something went wrong while processing your request.");
    pendingOperations.delete(message.author.id);
    return true;
  }
}

/**
 * Handle explicit commands
 * @param {Message} message - Discord message object
 * @param {string} commandText - Command text without prefix
 * @returns {Promise<void>}
 */
async function handleCommand(message, commandText) {
  const args = commandText.split(/\s+/); // Use regex to handle multiple spaces
  const command = args[0].toLowerCase();

  try {
    switch (command) {
      case COMMANDS.HELP:
        await sendHelpMessage(message);
        break;

      case COMMANDS.REPORT:
        // Fix: Ensure we're properly parsing the number of days
        let days = 30; // Default to 30 days
        if (args.length > 1 && !isNaN(args[1])) {
          days = parseInt(args[1]);
          // Ensure days is a reasonable number
          if (days <= 0) days = 30;
          if (days > 365) days = 365; // Cap at 1 year
        }
        await message.reply(
          `Generating expense report for the last ${days} days...`
        );
        await getExpenseReport(message, days);
        break;

      case COMMANDS.BUDGET:
        // Check if we need to set a budget or just view one
        if (args.length >= 3) {
          // Setting a budget: !budget [category] [amount]
          const category = args[1];
          // Fix: Better number parsing for budget amount
          const amount = parseFloat(args[2].replace(/[$,]/g, ''));

          if (!category || isNaN(amount)) {
            await message.reply(
              "Please provide a category and amount. Example: `!budget Groceries 200`"
            );
            return;
          }

          await analyzeBudget(message, category, amount);
        } else if (args.length === 2) {
          // Viewing a single budget: !budget [category]
          const category = args[1];
          await analyzeBudget(message, category);
        } else {
          await message.reply(
            "Please specify a category. Example: `!budget Groceries` to check a budget or `!budget Groceries 200` to set one."
          );
        }
        break;

      case COMMANDS.BUDGETS:
        // Show all budgets
        await showAllBudgets(message);
        break;

      case COMMANDS.CATEGORY:
        await sendCategoryList(message);
        break;

      case COMMANDS.SUMMARY:
        const period = args.length > 1 ? args[1].toLowerCase() : "month";
        
        // Validate period is one of the allowed values
        if (!['week', 'month', 'year'].includes(period)) {
          await message.reply(
            "Please specify a valid period: week, month, or year. Example: `!summary week`"
          );
          return;
        }
        
        await message.reply(`Generating ${period}ly expense summary...`);
        await generateExpenseSummary(message, period);
        break;

      case COMMANDS.TRENDS:
        await message.reply("Analyzing spending trends...");
        await generateExpenseSummary(message, "month"); // Using summary for now
        break;
        
      case COMMANDS.LIST:
      case COMMANDS.RECENT:
        // List recent expenses for editing/reference
        const limit = args.length > 1 && !isNaN(args[1]) ? parseInt(args[1]) : 5;
        await showRecentExpenses(message, limit);
        break;
        
      case COMMANDS.DELETE:
        // Delete an expense: !delete [category] [amount] [date?]
        if (args.length < 3) {
          await message.reply(
            "Please provide the category and amount of the expense to delete. Example: `!delete Groceries 25.50`"
          );
          return;
        }
        
        const delCategory = args[1];
        const delAmount = parseFloat(args[2].replace(/[$,]/g, ''));
        const delDate = args.length > 3 ? args[3] : null;
        
        if (isNaN(delAmount)) {
          await message.reply("Invalid amount. Please provide a numeric value.");
          return;
        }
        
        await handleExpenseDeletion(message, delCategory, delAmount, delDate);
        break;
        
      case COMMANDS.EDIT:
        // Edit an expense: !edit [category] [amount] [date?]
        if (args.length < 3) {
          await message.reply(
            "Please provide the category and amount of the expense to edit. Example: `!edit Groceries 25.50`"
          );
          return;
        }
        
        const editCategory = args[1];
        const editAmount = parseFloat(args[2].replace(/[$,]/g, ''));
        const editDate = args.length > 3 ? args[3] : null;
        
        if (isNaN(editAmount)) {
          await message.reply("Invalid amount. Please provide a numeric value.");
          return;
        }
        
        await handleExpenseEdit(message, editCategory, editAmount, editDate);
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
 * Handle expense deletion workflow
 * @param {Message} message - Discord message object
 * @param {string} category - Expense category
 * @param {number} amount - Expense amount
 * @param {string|null} date - Optional expense date
 */
async function handleExpenseDeletion(message, category, amount, date) {
  try {
    const result = await findExpense(category, amount, date);
    
    if (!result.found) {
      await message.reply(`No matching expense found.`);
      return;
    }
    
    // If one match found, confirm deletion
    if (result.count === 1) {
      const expense = result.expenses[0];
      const rowNumber = result.rows[0];
      
      pendingOperations.set(message.author.id, {
        type: 'delete_confirm',
        rowNumber
      });
      
      await message.reply(
        `Are you sure you want to delete this expense?\n` +
        `- Category: ${expense.category}\n` +
        `- Amount: $${expense.amount}\n` +
        `- Date: ${expense.date}\n` +
        `Reply with 'yes' to confirm or 'no' to cancel.`
      );
    } else {
      // Multiple matches, ask user to select one
      pendingOperations.set(message.author.id, {
        type: 'delete_select',
        expenses: result.expenses,
        rows: result.rows
      });
      
      let response = `Found ${result.count} matching expenses. Please select one by number:\n\n`;
      
      result.expenses.forEach((expense, index) => {
        response += `${index+1}. ${expense.category} - $${expense.amount} - ${expense.date}${expense.description ? ` (${expense.description})` : ''}\n`;
      });
      
      await message.reply(response);
    }
  } catch (error) {
    console.error("Error handling expense deletion:", error);
    await message.reply("Sorry, there was an error processing your request.");
  }
}

/**
 * Handle expense editing workflow
 * @param {Message} message - Discord message object
 * @param {string} category - Expense category
 * @param {number} amount - Expense amount
 * @param {string|null} date - Optional expense date
 */
async function handleExpenseEdit(message, category, amount, date) {
  try {
    const result = await findExpense(category, amount, date);
    
    if (!result.found) {
      await message.reply(`No matching expense found.`);
      return;
    }
    
    // If one match found, go straight to field selection
    if (result.count === 1) {
      const expense = result.expenses[0];
      const rowNumber = result.rows[0];
      
      pendingOperations.set(message.author.id, {
        type: 'edit_field',
        rowNumber,
        expenseData: expense
      });
      
      await message.reply(
        `Which field do you want to edit?\n` +
        `- category\n` +
        `- amount\n` +
        `- date\n` +
        `- description\n`
      );
    } else {
      // Multiple matches, ask user to select one
      pendingOperations.set(message.author.id, {
        type: 'edit_select',
        expenses: result.expenses,
        rows: result.rows
      });
      
      let response = `Found ${result.count} matching expenses. Please select one by number:\n\n`;
      
      result.expenses.forEach((expense, index) => {
        response += `${index+1}. ${expense.category} - $${expense.amount} - ${expense.date}${expense.description ? ` (${expense.description})` : ''}\n`;
      });
      
      await message.reply(response);
    }
  } catch (error) {
    console.error("Error handling expense edit:", error);
    await message.reply("Sorry, there was an error processing your request.");
  }
}

/**
 * Show recent expenses
 * @param {Message} message - Discord message object
 * @param {number} limit - Number of expenses to show
 */
async function showRecentExpenses(message, limit) {
  try {
    const expenses = await listRecentExpenses(limit);
    
    if (!expenses || expenses.length === 0) {
      await message.reply("No recent expenses found.");
      return;
    }
    
    let response = `**${expenses.length} Most Recent Expenses:**\n\n`;
    
    expenses.forEach((expense, index) => {
      response += `${index+1}. ${expense.category} - $${expense.amount} - ${expense.date}${expense.description ? ` (${expense.description})` : ''}\n`;
    });
    
    response += `\nTo edit: \`!edit [category] [amount]\`\nTo delete: \`!delete [category] [amount]\``;
    
    await message.reply(response);
  } catch (error) {
    console.error("Error showing recent expenses:", error);
    await message.reply("Sorry, there was an error retrieving recent expenses.");
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

**Basic Commands:**
\`${PREFIX}help\` - Show this help message
\`${PREFIX}categories\` - List available expense categories
\`${PREFIX}recent [number]\` - Show your most recent expenses

**Reporting:**
\`${PREFIX}report [days]\` - Generate expense report for specified days (default: 30)
\`${PREFIX}summary [week|month|year]\` - Generate a detailed expense summary with trends
\`${PREFIX}trends\` - See spending trends and insights

**Budget Management:**
\`${PREFIX}budget [category] [amount]\` - Set a budget for a category
\`${PREFIX}budget [category]\` - Check current budget and spending for a category
\`${PREFIX}budgets\` - View all your budgets

**Expense Management:**
\`${PREFIX}edit [category] [amount] [date?]\` - Edit an existing expense
\`${PREFIX}delete [category] [amount] [date?]\` - Delete an expense

**Examples:**
\`${PREFIX}report 7\` - Report for last 7 days
\`${PREFIX}budget Groceries 200\` - Set grocery budget to $200
\`${PREFIX}summary week\` - Weekly expense summary with analysis
\`${PREFIX}recent 3\` - Show 3 most recent expenses
`;

  await message.reply(helpText);
}

/**
 * Show all budgets and their current status
 * @param {Message} message - Discord message object
 */
async function showAllBudgets(message) {
  try {
    const budgets = await getAllBudgets();
    
    if (!budgets || Object.keys(budgets).length === 0) {
      await message.reply("No budgets have been set yet. Use `!budget [category] [amount]` to set a budget.");
      return;
    }
    
    let budgetResponse = "**Your Current Budgets:**\n\n";
    
    // Process each budget
    for (const [category, data] of Object.entries(budgets)) {
      budgetResponse += `**${category.charAt(0).toUpperCase() + category.slice(1)}**: $${data.amount.toFixed(2)}\n`;
    }
    
    budgetResponse += "\nUse `!budget [category]` to see detailed analysis for a specific category.";
    
    await message.reply(budgetResponse);
  } catch (error) {
    console.error("Error showing all budgets:", error);
    await message.reply("Sorry, there was an error retrieving your budgets.");
  }
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
    "Shopping",
    "Travel",
    "Dining",
    "Groceries",
    "Subscriptions",
    "Other",
  ];

  const categoriesText = `
**Available Expense Categories:**

${categories.map((cat) => `- ${cat}`).join("\n")}

When adding expenses, you can use any of these categories or create your own.
`;

  await message.reply(categoriesText);
}

module.exports = {
  processMessage,
};
