# Discord Expense Tracker Bot

A powerful Discord bot that lets you track expenses by sending messages, automatically saves them to a Google Sheet, and provides advanced budget analysis and AI-powered insights.

## Features

- **Easy Expense Tracking**: Message the bot directly or mention it in a server with your expense details
- **Smart Parsing**: Automatically extracts category, amount, and date information from your messages
- **Google Sheets Integration**: Automatically saves all expenses to a Google Sheet for permanent record-keeping
- **Budget Management**: Set and track budgets for different categories with alerts when you're close to limits
- **Detailed Reports**: Generate comprehensive expense reports and summaries with trend analysis
- **AI-Powered Insights**: Optional Gemini AI integration for smart categorization, spending analysis, and personalized recommendations
- **Expense Management**: Edit or delete expenses directly through Discord commands
- **Duplicate Detection**: Alerts you when you might be recording the same expense twice

## Setup Instructions

### Prerequisites

- Node.js (v14 or higher)
- A Discord account and bot application
- A Google account with access to Google Sheets
- (Optional) Google Gemini API key for AI features

### Quick Setup

1. **Discord Bot Setup**

   - Create a bot in [Discord Developer Portal](https://discord.com/developers/applications)
   - Enable MESSAGE CONTENT INTENT in the "Bot" section
   - Generate an invite link with the necessary permissions and invite the bot to your server

2. **Google Sheets Setup**

   - Enable Google Sheets API in [Google Cloud Console](https://console.cloud.google.com/)
   - Create a Service Account and download the credentials JSON file
   - Create a Google Sheet and share it with the service account email (with edit permissions)
   - Copy the credentials.json to the config folder of the bot

3. **Configure Environment Variables**

   - Create a `.env` file in the root directory with the following variables:

   ```
   DISCORD_TOKEN=your_discord_bot_token
   GOOGLE_SHEET_ID=your_google_sheet_id
   GOOGLE_APPLICATION_CREDENTIALS=path/to/credentials.json
   GEMINI_API_KEY=your_gemini_api_key (optional)
   ```

4. **Install and Run**
   - Run `npm install` to install dependencies
   - Run `npm start` to start the bot

## Usage Guide

### Adding Expenses

Simply message the bot directly or mention it in a server with your expense details. The bot understands various formats:

```
# Basic format: Category Amount
@ExpenseTracker Groceries $45.50
@ExpenseTracker Coffee $3.75

# With specific date
@ExpenseTracker Rent $800 03/05/2025
@ExpenseTracker Movie Tickets $28.99 04/25/2025

# Just the amount (AI will help categorize if enabled)
@ExpenseTracker $25.99
@ExpenseTracker spent $12 at Starbucks
```

### Command Reference

#### Basic Commands

```
!help - Show help and list of commands
!categories - List available expense categories
!recent [number] - Show your most recent expenses
```

#### Reporting

```
!report [days] - Generate expense report for the specified days
!summary [week|month|year] - Generate a detailed expense summary with trends
!trends - See spending trends and insights
```

#### Budget Management

```
!budget [category] [amount] - Set a budget for a category
!budget [category] - Check current budget and spending for a category
!budgets - View all your budgets
```

#### Expense Management

```
!edit [category] [amount] [date?] - Edit an existing expense
!delete [category] [amount] [date?] - Delete an expense
```

### Examples

```
!report 7 - Report for last 7 days
!budget Groceries 200 - Set grocery budget to $200
!budget Entertainment - Check current entertainment budget
!summary week - Weekly expense summary with analysis
!recent 3 - Show 3 most recent expenses
!edit Food 12.99 - Start the process to edit a Food expense of $12.99
```

## AI-powered Features

When Gemini AI integration is enabled (by providing a valid GEMINI_API_KEY), the bot gains several advanced features:

- **Smart Categorization**: Automatically categorizes expenses when you don't specify a category
- **Enhanced Descriptions**: Enriches expense descriptions with additional context
- **Spending Analysis**: Provides insights about spending patterns and anomalies
- **Budget Recommendations**: Offers personalized suggestions to help you stay within budget
- **Duplicate Detection**: Intelligently identifies potential duplicate expenses
- **Trend Predictions**: Analyzes your spending trends to make useful predictions

## License

MIT License - See LICENSE file for details.
