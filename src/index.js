// Load environment variables
require("dotenv").config();

// Import required modules
const { Client, GatewayIntentBits, Events } = require("discord.js");
const { initializeSheet } = require("./services/googleSheetsService");
const {
  initializeGemini,
  isGeminiAvailable,
} = require("./services/geminiService");
const { processMessage } = require("./commands/commandHandler");

// Initialize Discord client with necessary intents
// Modified to use only the minimum required intents
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    // MESSAGE_CONTENT is a privileged intent that needs to be enabled in the Discord Developer Portal
    GatewayIntentBits.MessageContent,
  ],
});

// Bot ready event
client.once(Events.ClientReady, async (readyClient) => {
  console.log(`Successfully logged in as ${readyClient.user.tag}`);

  // Initialize Google Sheet with headers if needed
  try {
    await initializeSheet();
    console.log("Google Sheet initialized and ready to use");
  } catch (error) {
    console.error("Failed to initialize Google Sheet:", error.message);
    console.log(
      "Bot will continue running, but Google Sheets functionality may be limited"
    );
  }

  // Initialize Gemini AI if API key is provided
  if (process.env.GEMINI_API_KEY) {
    const geminiInitialized = initializeGemini();
    if (geminiInitialized) {
      console.log("Gemini AI features are enabled");
    } else {
      console.log(
        "Gemini AI initialization failed. AI features will be disabled."
      );
    }
  } else {
    console.log("Gemini AI key not provided. AI features are disabled.");
  }

  // Set bot status to show command help
  client.user.setActivity("!help", { type: "LISTENING" });
});

// Message event handler
client.on(Events.MessageCreate, async (message) => {
  // Ignore messages from bots to prevent potential loops
  if (message.author.bot) return;

  try {
    // Handle direct messages or messages mentioning the bot
    if (message.channel.type === "DM" || message.mentions.has(client.user)) {
      console.log(`Received message: ${message.content}`);
      // Use our new command handler instead of directly calling handleExpenseMessage
      await processMessage(message);
    }
  } catch (error) {
    console.error("Error handling message:", error);
    message.reply(
      "Sorry, there was an error processing your message. Please try again later."
    );
  }
});

// Log in to Discord with the bot token
client.login(process.env.DISCORD_TOKEN).catch((error) => {
  console.error("Failed to log in to Discord:", error);
  process.exit(1);
});

// Handle process termination
process.on("SIGINT", () => {
  console.log("Bot shutting down...");
  client.destroy();
  process.exit(0);
});
