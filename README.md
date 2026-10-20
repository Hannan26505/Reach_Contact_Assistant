# Reach

Reach is a contact assistant for times when your phone isn’t with you. Save contacts in your Reach account, then use the Telegram bot to look one up from another device with a one-time recovery code.

**Live app:** [reach-contact-assistant.onrender.com](https://reach-contact-assistant.onrender.com)  
**Telegram bot:** [@HannanReachBot](https://t.me/HannanReachBot)

## Features

- Sign up, sign in, and manage your own contacts
- Search contacts by name or phone number
- Prevent duplicate names and phone numbers within an account
- Generate one-time recovery codes for Telegram lookups
- Reset a forgotten password with an emailed code
- Store contacts in MongoDB Atlas

## Telegram lookup

1. Sign in to Reach and generate recovery codes.
2. Open [@HannanReachBot](https://t.me/HannanReachBot) and send `/start`.
3. Send a lookup in this format:

   ```text
   LOOKUP your-email@example.com 123456 Contact Name


Each recovery code can be used for one lookup. Keep unused codes private.
Technology
- React and Vite
- Node.js and Express
- MongoDB Atlas with Mongoose
- JWT authentication and bcrypt password hashing
- Telegram Bot API
- Nodemailer for password reset emails
Run locally
You’ll need Node.js, npm, and a MongoDB Atlas database.
1. Install dependencies:
   npm install
2. Create a .env file in the project root. Add your own values:
   MONGODB_URI=your_mongodb_connection_string
   JWT_SECRET=your_long_random_secret
   TELEGRAM_BOT_TOKEN=your_telegram_bot_token
   
   SMTP_HOST=your_smtp_host
   SMTP_PORT=587
   SMTP_SECURE=false
   SMTP_USER=your_email_address
   SMTP_PASS=your_email_password_or_app_password
   MAIL_FROM=your_email_address
   Never commit .env or share its secrets. The repository ignores this file.
3. Start the backend in one terminal:
   npm run server
4. Start the frontend in another terminal:
   npm run dev
5. Open the local URL printed by Vite in your browser.
Deployment
The app is deployed as a Render web service. It builds the frontend with:
npm ci && npm run build
and starts the server with:
node server/index.mjs
Set the required environment variables in Render’s service settings. Do not put secret values in this README or in GitHub.
Security notes
Recovery codes are one-time use. Contact API routes require authentication and only return contacts belonging to the signed-in account. Keep your account password, recovery codes, bot token, database URI, and SMTP credentials private.