# Discord Expense Tracker Bot

A Discord bot that lets you track expenses by sending messages, which are then automatically saved to a Google Sheet.

## Features

- Message the bot directly or mention it in a server with your expense
- Bot parses expense details (category, amount, date)
- Automatically saves expenses to a Google Sheet
- Optional Gemini AI integration for smarter categorization and insights
- Budget tracking and expense reporting

## Setup Instructions

### Prerequisites

- Node.js
- A Discord account and application/bot
- A Google account with access to Google Sheets

### Quick Setup

1. **Discord Bot Setup**

   - Create a bot in [Discord Developer Portal](https://discord.com/developers/applications)
   - Enable MESSAGE CONTENT INTENT
   - Invite the bot to your server

2. **Google Sheets Setup**

   - Enable Google Sheets API in [Google Cloud Console](https://console.cloud.google.com/)
   - Create a Service Account and download credentials.json to the config folder
   - Create a Google Sheet and share it with the service account email

3. **Configure and Run**
   - Set up your .env file with required tokens and IDs
   - Run `npm install` and `npm start`

## Usage

### Basic Expense Recording

```
# Format: Category Amount [Date]
@ExpenseTracker Groceries $45.50
@ExpenseTracker Coffee $3.75
@ExpenseTracker Rent $800

# With date
@ExpenseTracker Groceries $45.50 04/30/2025
@ExpenseTracker Movie Tickets $28.99 04/25/2025

# Without category (Gemini will categorize if enabled)
@ExpenseTracker $25.99
@ExpenseTracker spent $12 at Starbucks
```

### Commands

```
# Help
@ExpenseTracker !help

# Reports
@ExpenseTracker !report
@ExpenseTracker !report 7

# Budgets
@ExpenseTracker !budget Food 300
@ExpenseTracker !budget Entertainment 100

# Other commands
@ExpenseTracker !categories
@ExpenseTracker !summary month
```

Replace `@ExpenseTracker` with your bot's mention or use direct messages.

## License

MIT License - See LICENSE file for details.
