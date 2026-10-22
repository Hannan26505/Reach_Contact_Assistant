# Reach

Reach is a contact assistant for times when your phone isn’t with you. Save contacts in your Reach account, then look one up through the Telegram Mini App.

**Live app:** [reach-contact-assistant.onrender.com](https://reach-contact-assistant.onrender.com)  
**Telegram bot:** [@HannanReachBot](https://t.me/HannanReachBot)

## Features

- Sign up, sign in, and manage your own contacts
- Search contacts by name or phone number
- Prevent duplicate names and phone numbers within an account
- Look up contacts through a Telegram Mini App using a masked PIN
- Generate one-time recovery codes as a backup
- Reset a forgotten password with an emailed code
- Store contacts in MongoDB Atlas

## Telegram lookup

1. Sign in to Reach and set a six-digit Telegram lookup PIN.
2. Open [@HannanReachBot](https://t.me/HannanReachBot) and send `/start`.
3. Tap **Open Reach lookup**.
4. Enter your Reach account email, lookup PIN, and the contact’s name or phone number.

The PIN is reusable until you change it. You enter it in a masked field inside the Mini App rather than sending it as a regular chat message. After five incorrect PIN attempts, lookups are locked for 15 minutes.

Optional one-time recovery codes are available from your signed-in Reach account.

## Technology

- React and Vite
- Node.js and Express
- MongoDB Atlas with Mongoose
- JWT authentication and bcrypt password hashing
- Telegram Bot API
- Nodemailer for password reset emails

## Run locally

You’ll need Node.js, npm, and a MongoDB Atlas database.

1. Install dependencies:

   ```bash
   npm install

2. Create a .env file in the project root and add your own values:

   MONGODB_URI=your_mongodb_connection_string
   JWT_SECRET=your_long_random_secret
   TELEGRAM_BOT_TOKEN=your_telegram_bot_token

   SMTP_HOST=your_smtp_host
   SMTP_PORT=587
   SMTP_SECURE=false
   SMTP_USER=your_email_address
   SMTP_PASS=your_app_password
   MAIL_FROM=your_email_address
Never commit .env or share its secret values. The repository ignores this file.

3. Start the backend in one terminal:
   npm run server

4. Start the frontend in another terminal:
   npm run dev

5. Open the local URL printed by Vite in your browser.

   Only run one Telegram polling process at a time. If Render is running the bot, stop the local server before testing the same bot token locally.

Deployment
   The app is deployed as a Render web service. It builds the frontend with:
   npm ci && npm run build

It starts the server with:
   node server/index.mjs

Set the required environment variables in Render’s service settings. Do not put secret values in this README or in GitHub. MongoDB Atlas must allow connections from Render’s outbound IP ranges.

Security notes
- Passwords and lookup PINs are stored as hashes.
- Contact API routes require authentication and only return contacts belonging to the signed-in account.
- The lookup PIN is reusable until changed. Choose one you don’t use for your phone, bank, or other accounts.
- Recovery codes are for one-time use.
- Keep your account password, PIN, recovery codes, Telegram bot token, database URI, and SMTP credentials private.
