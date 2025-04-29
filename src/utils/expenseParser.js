/**
 * Parse expense message to extract category, amount, and date
 * @param {string} messageContent - The content of the message
 * @returns {Object|null} - Parsed expense data or null if parsing fails
 */
function parseExpense(messageContent) {
  // Remove leading/trailing whitespace and any mentions of the bot
  const cleanedMessage = messageContent.replace(/<@!?[0-9]+>/g, "").trim();

  // First, try to match a category with expense pattern
  const categoryExpenseRegex =
    /([A-Za-z\s]+)\s+\$?(\d+(?:\.\d{1,2})?)\s*(?:([0-9]{1,2}\/[0-9]{1,2}\/[0-9]{2,4}|\d{1,2}-\d{1,2}-\d{2,4}|\d{4}-\d{1,2}-\d{1,2}))?/i;
  let match = cleanedMessage.match(categoryExpenseRegex);

  // If no category match, try to match just an amount (triggering Gemini categorization)
  let needsCategorizationHelp = false;
  if (!match) {
    const amountOnlyRegex =
      /\$?(\d+(?:\.\d{1,2})?)\s*(?:([0-9]{1,2}\/[0-9]{1,2}\/[0-9]{2,4}|\d{1,2}-\d{1,2}-\d{2,4}|\d{4}-\d{1,2}-\d{1,2}))?/i;
    match = cleanedMessage.match(amountOnlyRegex);

    if (match) {
      // We have an amount but no category - will need AI help
      needsCategorizationHelp = true;
    } else {
      return null; // Couldn't parse anything useful
    }
  }

  if (!match) {
    return null;
  }

  // Extract data based on which regex matched
  let category, amount, description, dateStr;

  if (needsCategorizationHelp) {
    // For amount-only matches
    category = "Uncategorized";
    amount = parseFloat(match[1]);
    description = cleanedMessage; // Use the whole message for better AI categorization
    dateStr = match[2]; // This might be undefined
  } else {
    // For category + amount matches
    category = match[1].trim();
    amount = parseFloat(match[2]);
    dateStr = match[3]; // This might be undefined
    description = category; // Use category as description
  }

  // If date is provided, use it; otherwise, use today's date
  let date;
  if (dateStr) {
    // Parse the provided date
    date = formatDateToIST(new Date(dateStr));
  } else {
    // Use today's date in IST
    date = formatDateToIST(new Date());
  }

  return {
    category,
    amount,
    date,
    description,
    needsCategorizationHelp,
  };
}

/**
 * Convert date to Indian Standard Time (IST/UTC+5:30)
 * @param {Date} date - The date to convert
 * @returns {Date} - Date in IST
 */
function convertToIST(date) {
  // Create a new date object with the IST offset (+5:30)
  // IST is UTC+5:30
  const istTime = new Date(date.getTime() + 5.5 * 60 * 60 * 1000);
  return istTime;
}

/**
 * Format a Date object to DD/MM/YYYY format (IST format)
 * @param {Date} date - The date to format
 * @returns {string} - Formatted date string in IST
 */
function formatDateToIST(date) {
  // Convert to IST first
  const istDate = convertToIST(date);

  const day = istDate.getDate().toString().padStart(2, "0");
  const month = (istDate.getMonth() + 1).toString().padStart(2, "0");
  const year = istDate.getFullYear();

  return `${day}/${month}/${year}`;
}

/**
 * Get current timestamp in IST formatted as string
 * @returns {string} - Current timestamp in IST format: DD/MM/YYYY HH:MM:SS
 */
function getCurrentISTTimestamp() {
  const now = convertToIST(new Date());

  const day = now.getDate().toString().padStart(2, "0");
  const month = (now.getMonth() + 1).toString().padStart(2, "0");
  const year = now.getFullYear();
  const hours = now.getHours().toString().padStart(2, "0");
  const minutes = now.getMinutes().toString().padStart(2, "0");
  const seconds = now.getSeconds().toString().padStart(2, "0");

  return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
}

module.exports = {
  parseExpense,
  convertToIST,
  formatDateToIST,
  getCurrentISTTimestamp,
};
