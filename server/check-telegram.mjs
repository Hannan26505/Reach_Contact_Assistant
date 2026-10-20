import 'dotenv/config';

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
  console.error('TELEGRAM_BOT_TOKEN is missing from the project-root .env file.');
  process.exit(1);
}

const response = await fetch(`https://api.telegram.org/bot${token}/getMe`);
const result = await response.json();

if (!response.ok || !result.ok) {
  console.error('Telegram could not authenticate the bot token.');
  process.exit(1);
}

console.log(`Connected to Telegram bot @${result.result.username}`);