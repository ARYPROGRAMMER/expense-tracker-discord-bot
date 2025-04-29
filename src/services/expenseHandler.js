const { parseExpense } = require("../utils/expenseParser");
const { addExpenseToSheet } = require("./googleSheetsService");
const {
  categorizeExpense,
  enhanceExpenseDescription,
  isGeminiAvailable,
  detectDuplicateExpense,
} = require("./geminiService");
const { fetchRecentExpenses } = require("./reportService");

/**
 * Handle expense messages from users
 * @param {Message} message - Discord message object
 */
async function handleExpenseMessage(message) {
  try {
    // Parse the expense from the message
    const expenseData = parseExpense(message.content);

    if (!expenseData) {
      await message.reply(
        'Sorry, I couldn\'t understand your expense format. Please try again with format like: "Groceries $25.50" or "Coffee $3.75 04/28/2025". You can also just send an amount like "$45" and I\'ll try to categorize it for you.'
      );
      return;
    }

    // Check for potential duplicate expenses
    try {
      const recentExpenses = await fetchRecentExpenses(2); // Get expenses from past 2 days
      const potentialDuplicate = await detectDuplicateExpense(
        expenseData,
        recentExpenses
      );

      if (potentialDuplicate) {
        const confirmMessage = await message.reply(
          `⚠️ This looks similar to a recent expense:\n` +
            `Category: ${potentialDuplicate.category}\n` +
            `Amount: $${potentialDuplicate.amount}\n` +
            `Date: ${potentialDuplicate.date}\n\n` +
            `Is this a different expense? Reply with 'yes' to confirm or 'no' to cancel.`
        );

        // Wait for user confirmation
        try {
          const filter = (m) =>
            m.author.id === message.author.id &&
            (m.content.toLowerCase() === "yes" ||
              m.content.toLowerCase() === "no");

          // Using awaitMessages to wait for a response
          const collected = await message.channel.awaitMessages({
            filter,
            max: 1,
            time: 30000,
            errors: ["time"],
          });

          const response = collected.first();
          if (response.content.toLowerCase() === "no") {
            await message.reply("Expense recording canceled.");
            return;
          }
          // If 'yes', continue with the expense processing
        } catch (timeoutError) {
          // If no response in 30 seconds
          await message.reply(
            "No confirmation received. Expense recording canceled."
          );
          return;
        }
      }
    } catch (error) {
      console.error("Error checking for duplicate expenses:", error);
      // Continue with expense processing even if duplicate check fails
    }

    // If the expense needs categorization help, use Gemini if available
    if (
      expenseData.category === "Uncategorized" ||
      expenseData.needsCategorizationHelp
    ) {
      try {
        // Only show "analyzing" message if Gemini is available
        if (isGeminiAvailable()) {
          await message.reply(
            `Analyzing your expense of $${expenseData.amount}...`
          );

          // Get category suggestion from Gemini
          const suggestedCategory = await categorizeExpense(
            expenseData.description
          );
          if (suggestedCategory) {
            expenseData.category = suggestedCategory;
            console.log(`Gemini suggested category: ${suggestedCategory}`);
          }
        } else {
          // Without Gemini, set a default category
          expenseData.category = "Other";
        }
      } catch (error) {
        console.error("Failed to categorize with Gemini:", error);
        // Set a default category if Gemini categorization fails
        expenseData.category = "Other";
      }
    }

    // Optionally enhance description with Gemini
    try {
      if (
        isGeminiAvailable() &&
        expenseData.description &&
        expenseData.description.length < 10
      ) {
        const enhancedDescription = await enhanceExpenseDescription(
          expenseData.description
        );
        if (
          enhancedDescription &&
          enhancedDescription !== expenseData.description
        ) {
          expenseData.description = enhancedDescription;
        }
      }
    } catch (error) {
      console.error("Error enhancing description:", error);
      // Continue with original description if enhancement fails
    }

    // Add expense to Google Sheet
    await addExpenseToSheet(expenseData);

    // Send confirmation message
    let confirmationMessage = `✅ Expense recorded successfully!\nCategory: ${expenseData.category}\nAmount: $${expenseData.amount}\nDate: ${expenseData.date}`;

    // Add enhanced description if available
    if (
      expenseData.description &&
      expenseData.description !== expenseData.category
    ) {
      confirmationMessage += `\nDescription: ${expenseData.description}`;
    }

    await message.reply(confirmationMessage);
  } catch (error) {
    console.error("Error in expense handler:", error);
    await message.reply(
      "Sorry, there was an error processing your expense. Please try again later."
    );
  }
}

module.exports = {
  handleExpenseMessage,
};
