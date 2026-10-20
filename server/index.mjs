import express from 'express';
import 'dotenv/config';
import mongoose from 'mongoose';
import Contact from './models/Contact.mjs';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from './models/User.mjs';
import { createHmac, createHash, randomInt, timingSafeEqual } from 'node:crypto';
import RecoveryCode from './models/RecoveryCode.mjs';
import nodemailer from 'nodemailer';
import PasswordResetToken from './models/PasswordResetToken.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const recoveryAttempts = new Map();
const MAX_RECOVERY_ATTEMPTS = 5;
const RECOVERY_WINDOW_MS = 15 * 60 * 1000;

const app = express();
const port = process.env.PORT || 3001;
const frontendDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../dist'
);

app.use(
  express.json({
    verify: (request, response, buffer) => {
      request.rawBody = Buffer.from(buffer);
    },
  })
);

const mailer = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

app.get('/webhook', (request, response) => {
  const mode = request.query['hub.mode'];
  const token = request.query['hub.verify_token'];
  const challenge = request.query['hub.challenge'];

  if (
    mode === 'subscribe' &&
    token === process.env.WHATSAPP_VERIFY_TOKEN &&
    typeof challenge === 'string'
  ) {
    return response.status(200).send(challenge);
  }

  return response.sendStatus(403);
});

app.post('/webhook', async (request, response) => {
  const appSecret = process.env.META_APP_SECRET;
  const signature = request.get('x-hub-signature-256');

  if (!appSecret || !Buffer.isBuffer(request.rawBody) || !signature) {
    return response.sendStatus(401);
  }

  const expectedSignature =
    'sha256=' +
    createHmac('sha256', appSecret)
      .update(request.rawBody)
      .digest('hex');

  const receivedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (
    receivedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(receivedBuffer, expectedBuffer)
  ) {
    return response.sendStatus(401);
  }

  const incomingMessages = [];

for (const entry of request.body.entry ?? []) {
  for (const change of entry.changes ?? []) {
    if (change.field !== 'messages') continue;

    for (const message of change.value?.messages ?? []) {
      if (
        message.type === 'text' &&
        typeof message.text?.body === 'string'
      ) {
        incomingMessages.push({
          from: message.from,
          text: message.text.body,
        });
      }
    }
  }
}

const lookupRequests = incomingMessages
  .map(({ from, text }) => {
    const match = text
      .trim()
      .match(/^LOOKUP\s+(\S+)\s+(\d{6})\s+(.+)$/i);

    if (!match) return null;

    return {
      from,
      email: match[1].toLowerCase(),
      code: match[2],
      query: match[3].trim(),
    };
  })
  .filter(Boolean);

const lookupResults = [];

for (const lookup of lookupRequests) {
  const lookupResponse = await fetch(
    `http://127.0.0.1:${port}/api/recovery/lookup`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: lookup.email,
        code: lookup.code,
        query: lookup.query,
      }),
    }
  );

  const result = await lookupResponse.json();

  lookupResults.push({
    accepted: lookupResponse.ok,
    matches: Array.isArray(result.contacts) ? result.contacts.length : 0,
  });
}

return response.status(200).json({
  received: true,
  textMessages: incomingMessages.length,
  validLookupRequests: lookupRequests.length,
  lookupResults,
});
});

function authenticateToken(request, response, next) {
  const authorization = request.headers.authorization;
  const [scheme, token] = authorization?.split(' ') ?? [];

  if (scheme !== 'Bearer' || !token) {
    return response.status(401).json({ message: 'Sign-in required.' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    request.userId = payload.userId;
   
    
    next();
  } catch {
    return response.status(401).json({ message: 'Invalid or expired token.' });
  }
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

app.post('/api/auth/signup', async (request, response) => {
  try {
    const email = String(request.body.email ?? '').trim().toLowerCase();
    const password = String(request.body.password ?? '');

    if (!email || !password) {
      return response.status(400).json({
        message: 'Email and password are required.',
      });
    }

    if (password.length < 8) {
      return response.status(400).json({
        message: 'Password must be at least 8 characters.',
      });
    }

    const existingUser = await User.findOne({ email });

    if (existingUser) {
      return response.status(409).json({
        message: 'An account with that email already exists.',
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({ email, passwordHash });

    const token = jwt.sign(
      { userId: user._id.toString() },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    return response.status(201).json({
      message: 'Account created.',
      token,
      user: { id: user._id.toString(), email: user.email },
    });
  } catch (error) {
    if (error.code === 11000) {
      return response.status(409).json({
        message: 'An account with that email already exists.',
      });
    }

    console.error('Sign-up error:', error.message);
    return response.status(500).json({ message: 'Could not create account.' });
  }
});

app.post('/api/auth/login', async (request, response) => {
  try {
    const email = String(request.body.email ?? '').trim().toLowerCase();
    const password = String(request.body.password ?? '');

    if (!email || !password) {
      return response.status(400).json({
        message: 'Email and password are required.',
      });
    }

    const user = await User.findOne({ email });

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return response.status(401).json({
        message: 'Invalid email or password.',
      });
    }

    const token = jwt.sign(
      { userId: user._id.toString() },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    return response.json({
      message: 'Signed in.',
      token,
      user: { id: user._id.toString(), email: user.email },
    });
  } catch (error) {
    console.error('Login error:', error.message);
    return response.status(500).json({ message: 'Could not sign in.' });
  }
});

app.post('/api/auth/forgot-password', async (request, response) => {
  const genericMessage =
    'If an account exists for that email, a reset code will be sent.';

  try {
    const email = String(request.body.email ?? '').trim().toLowerCase();

    if (!email) {
      return response.json({ message: genericMessage });
    }

    const user = await User.findOne({ email });

    // Use the same response whether or not the account exists.
    if (user) {
      const code = String(randomInt(100000, 1000000));
      const codeHash = createHash('sha256').update(code).digest('hex');

      await PasswordResetToken.deleteMany({ userId: user._id });
      await PasswordResetToken.create({
        userId: user._id,
        tokenHash: codeHash,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      });

      try {
        await mailer.sendMail({
          from: process.env.MAIL_FROM,
          to: user.email,
          subject: 'Your Reach password reset code',
          text:
            `Your Reach password reset code is: ${code}\n\n` +
            'It expires in 10 minutes. If you did not request this, ignore this email.',
        });
      } catch (emailError) {
        await PasswordResetToken.deleteMany({ userId: user._id });
        console.error('Could not send password reset email:', emailError.message);
      }
    }

    return response.json({ message: genericMessage });
  } catch (error) {
    console.error('Password reset request failed:', error.message);
    return response.json({ message: genericMessage });
  }
});
app.post('/api/recovery-codes', authenticateToken, async (request, response) => {
  try {
    const codes = new Set();

    while (codes.size < 2) {
      const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
      codes.add(code);
    }

    const records = await Promise.all(
      [...codes].map(async (code) => ({
        ownerId: request.userId,
        codeHash: await bcrypt.hash(code, 12),
      }))
    );

    // Replacing the codes invalidates all previous ones.
    await RecoveryCode.deleteMany({ ownerId: request.userId });
    await RecoveryCode.insertMany(records);

    return response.status(201).json({
      message: 'Save these codes now. They will not be shown again.',
      codes: [...codes],
    });
  } catch (error) {
    console.error('Could not generate recovery codes:', error.message);
    return response.status(500).json({
      message: 'Could not generate recovery codes.',
    });
  }
});


// Require a valid token for every contact route below.
app.use('/api/contacts', authenticateToken);

const resetCodeAttempts = new Map();
const RESET_CODE_WINDOW_MS = 15 * 60 * 1000;
const MAX_RESET_CODE_ATTEMPTS = 5;

function getResetCodeWaitMinutes(email) {
  const now = Date.now();
  const recentAttempts = (resetCodeAttempts.get(email) ?? [])
    .filter((time) => now - time < RESET_CODE_WINDOW_MS);

  if (recentAttempts.length >= MAX_RESET_CODE_ATTEMPTS) {
    resetCodeAttempts.set(email, recentAttempts);
    const waitMs = RESET_CODE_WINDOW_MS - (now - recentAttempts[0]);
    return Math.ceil(waitMs / 60_000);
  }

  recentAttempts.push(now);
  resetCodeAttempts.set(email, recentAttempts);
  return 0;
}

app.post('/api/auth/reset-password', async (request, response) => {
  try {
    const email = String(request.body.email ?? '').trim().toLowerCase();
    const code = String(request.body.code ?? '').trim();
    const password = String(request.body.password ?? '');

    if (!email) {
      return response.status(400).json({
        message: 'Enter the email address and reset code from the email.',
      });
    }

    const waitMinutes = getResetCodeWaitMinutes(email);

    if (waitMinutes > 0) {
      return response.status(429).json({
        message: `Too many attempts. Try again in about ${waitMinutes} minute(s).`,
      });
    }

    if (!/^\d{6}$/.test(code) || password.length < 8) {
      return response.status(400).json({
        message: 'Enter the six-digit code and a password of at least 8 characters.',
      });
    }

    const user = await User.findOne({ email });

    if (!user) {
      return response.status(400).json({
        message: 'The code is invalid, expired, or already used. Request a new code.',
      });
    }

    const codeHash = createHash('sha256').update(code).digest('hex');

    const resetRecord = await PasswordResetToken.findOneAndDelete({
      userId: user._id,
      tokenHash: codeHash,
      expiresAt: { $gt: new Date() },
    });

    if (!resetRecord) {
      return response.status(400).json({
        message: 'The code is invalid, expired, or already used. Request a new code.',
      });
    }

    user.passwordHash = await bcrypt.hash(password, 12);
    await user.save();

    await PasswordResetToken.deleteMany({ userId: user._id });

    return response.json({
      message: 'Password reset successfully. You can now sign in with your new password.',
    });
  } catch (error) {
    console.error('Password reset failed:', error.message);
    return response.status(500).json({
      message: 'Could not reset the password. Please try again.',
    });
  }
});

app.get('/api/contacts', async (request, response) => {
  try {
    const query = String(request.query.q ?? '').trim().toLowerCase();

    // Always restrict the results to the signed-in user's contacts.
    const filter = { ownerId: request.userId };

    if (query) {
      const conditions = [
        { nameKey: { $regex: escapeRegex(query) } },
      ];

      const phoneDigits = query.replace(/\D/g, '');

      if (phoneDigits) {
        conditions.push({
          phoneDigits: { $regex: escapeRegex(phoneDigits) },
        });
      }

      filter.$or = conditions;
    }

    const contacts = await Contact.find(filter).sort({ name: 1 });
    return response.json(contacts);
  } catch (error) {
    console.error('Could not load contacts:', error.message);
    return response.status(500).json({ error: 'Could not load contacts.' });
  }
});

app.post('/api/contacts', async (request, response) => {
  try {
    const { name, phone } = request.body ?? {};

    if (typeof name !== 'string' || typeof phone !== 'string') {
      return response.status(400).json({
        error: 'Name and phone number are required.',
      });
    }

    const cleanName = name.trim();
    const cleanPhone = phone.trim();
    const nameKey = cleanName.toLowerCase();
    const phoneDigits = cleanPhone.replace(/\D/g, '');

    if (!cleanName || !phoneDigits) {
      return response.status(400).json({
        error: 'Enter a name and a phone number containing digits.',
      });
    }

    // Check duplicates only within this user's contacts.
    const [duplicateName, duplicatePhone] = await Promise.all([
      Contact.exists({ ownerId: request.userId, nameKey }),
      Contact.exists({ ownerId: request.userId, phoneDigits }),
    ]);

    if (duplicateName || duplicatePhone) {
      return response.status(409).json({
        error: 'A contact with that name or phone number already exists.',
      });
    }

    const contact = await Contact.create({
      ownerId: request.userId,
      name: cleanName,
      nameKey,
      phone: cleanPhone,
      phoneDigits,
    });

    return response.status(201).json(contact);
  } catch (error) {
    if (error.code === 11000) {
      return response.status(409).json({
        error: 'A contact with that name or phone number already exists.',
      });
    }

    console.error('Could not add contact:', error.message);
    return response.status(500).json({ error: 'Could not add the contact.' });
  }
});

app.delete('/api/contacts/:id', async (request, response) => {
  try {
    if (!mongoose.isValidObjectId(request.params.id)) {
      return response.status(400).json({ error: 'Invalid contact ID.' });
    }

    // Match both the contact ID and its owner.
    const contact = await Contact.findOneAndDelete({
      _id: request.params.id,
      ownerId: request.userId,
    });

    if (!contact) {
      return response.status(404).json({ error: 'Contact not found.' });
    }

    return response.json(contact);
  } catch (error) {
    console.error('Could not delete contact:', error.message);
    return response.status(500).json({ error: 'Could not delete the contact.' });
  }
});

app.post('/api/recovery/lookup', async (request, response) => {
  try {
    const email = String(request.body.email ?? '').trim().toLowerCase();
    const code = String(request.body.code ?? '').trim();
    const query = String(request.body.query ?? '').trim();

    if (!email || !/^\d{6}$/.test(code) || !query) {
      return response.status(400).json({
        message: 'Email, a six-digit code, and a contact search are required.',
      });
    }

    const attemptKey = email;
const now = Date.now();
const previous = recoveryAttempts.get(attemptKey);

if (previous && now - previous.startedAt < RECOVERY_WINDOW_MS) {
  if (previous.count >= MAX_RECOVERY_ATTEMPTS) {
    return response.status(429).json({
      message: 'Too many attempts. Try again in 15 minutes.',
    });
  }

  previous.count += 1;
} else {
  recoveryAttempts.set(attemptKey, {
    count: 1,
    startedAt: now,
  });
}

    const user = await User.findOne({ email });

    // Keep the response generic so the route doesn't reveal whether an email
    // has an account or whether a code was valid.
    if (!user) {
      return response.status(401).json({ message: 'Invalid email or code.' });
    }

    const unusedCodes = await RecoveryCode.find({
      ownerId: user._id,
      usedAt: null,
    });

    let matchingCode = null;

    for (const savedCode of unusedCodes) {
      if (await bcrypt.compare(code, savedCode.codeHash)) {
        matchingCode = savedCode;
        break;
      }
    }

    if (!matchingCode) {
      return response.status(401).json({ message: 'Invalid email or code.' });
    }

    // Claim the code once, even if two requests arrive at nearly the same time.
    const claimedCode = await RecoveryCode.findOneAndUpdate(
      { _id: matchingCode._id, usedAt: null },
      { $set: { usedAt: new Date() } },
      { new: true }
    );

    if (!claimedCode) {
      return response.status(401).json({ message: 'Invalid email or code.' });
    }

    const normalizedQuery = query.toLowerCase();
    const phoneDigits = query.replace(/\D/g, '');
    const conditions = [
      { nameKey: { $regex: escapeRegex(normalizedQuery) } },
    ];

    if (phoneDigits) {
      conditions.push({
        phoneDigits: { $regex: escapeRegex(phoneDigits) },
      });
    }

    const contacts = await Contact.find({
      ownerId: user._id,
      $or: conditions,
    })
      .select('name phone')
      .sort({ name: 1 })
      .limit(5);

    return response.json({
      contacts: contacts.map(({ name, phone }) => ({ name, phone })),
    });
  } catch (error) {
    console.error('Recovery lookup error:', error.message);
    return response.status(500).json({ message: 'Could not complete the lookup.' });
  }
});

async function sendTelegramMessage(chatId, text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;

  const response = await fetch(
    `https://api.telegram.org/bot${token}/sendMessage`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    }
  );

  const result = await response.json();

  if (!response.ok || !result.ok) {
    throw new Error('Telegram could not send the reply.');
  }
}

const telegramAttempts = new Map();
const TELEGRAM_ATTEMPT_LIMIT = 5;
const TELEGRAM_WINDOW_MS = 15 * 60 * 1000;

function checkTelegramAttempt(userId) {
  const now = Date.now();
  const recentAttempts = (telegramAttempts.get(userId) ?? [])
    .filter((time) => now - time < TELEGRAM_WINDOW_MS);

  if (recentAttempts.length >= TELEGRAM_ATTEMPT_LIMIT) {
    telegramAttempts.set(userId, recentAttempts);
    const waitMs = TELEGRAM_WINDOW_MS - (now - recentAttempts[0]);
    return Math.ceil(waitMs / 60_000);
  }

  recentAttempts.push(now);
  telegramAttempts.set(userId, recentAttempts);
  return 0;
}


async function handleTelegramMessage(message) {
  const chatId = message?.chat?.id;
  const text = typeof message?.text === 'string' ? message.text.trim() : '';

  if (!chatId || !text) return;

  if (/^\/start(?:@\w+)?(?:\s|$)/i.test(text)) {
    await sendTelegramMessage(
      chatId,
      'Reach contact lookup is ready. Send:\nLOOKUP your-email@example.com 123456 Contact Name'
    );
    return;
  }

  const match = text.match(/^LOOKUP\s+(\S+)\s+(\d{6})\s+(.+)$/i);

  if (!match) {
    await sendTelegramMessage(
      chatId,
      'Use this format:\nLOOKUP your-email@example.com 123456 Contact Name'
    );
    return;
  }

  try {
    const lookupResponse = await fetch(
      `http://127.0.0.1:${port}/api/recovery/lookup`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: match[1].toLowerCase(),
          code: match[2],
          query: match[3].trim(),
        }),
      }
    );

    const result = await lookupResponse.json();
    let reply;

    if (lookupResponse.status === 401) {
      reply = 'The email or recovery code is invalid.';
    } else if (lookupResponse.status === 429) {
      reply = 'Too many attempts. Please try again later.';
    } else if (!lookupResponse.ok) {
      reply = 'Reach could not complete the lookup. Please try later.';
    } else if (!result.contacts?.length) {
      reply = 'No matching contact found. This code has been used.';
    } else {
      reply = result.contacts
        .map((contact) => `${contact.name}: ${contact.phone}`)
        .join('\n');
    }

    await sendTelegramMessage(chatId, reply);
  } catch {
    await sendTelegramMessage(
      chatId,
      'Reach could not connect to its lookup service. Please try later.'
    );
  }
}

async function startTelegramPolling() {
  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token) {
    console.log('Telegram bot token missing; polling is off.');
    return;
  }

  const apiBase = `https://api.telegram.org/bot${token}`;
  let offset = 0;

  console.log('Telegram long polling started.');

  while (true) {
    try {
      const params = new URLSearchParams({
        timeout: '50',
        offset: String(offset),
        allowed_updates: JSON.stringify(['message']),
      });

      const response = await fetch(`${apiBase}/getUpdates?${params}`, {
        signal: AbortSignal.timeout(60_000),
      });
      const result = await response.json();

      if (!response.ok || !result.ok) {
        console.error('Telegram polling request failed.');
        await new Promise((resolve) => setTimeout(resolve, 3000));
        continue;
      }

      for (const update of result.result) {
        try {
          await handleTelegramMessage(update.message);
        } catch (error) {
          console.error('Could not process a Telegram update:', error.message);
        }

        offset = update.update_id + 1;
      }
    } catch (error) {
      console.error('Telegram polling connection failed:', error.message);
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
}
app.use(express.static(frontendDirectory));
async function startServer() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB Atlas');

    app.listen(port, '0.0.0.0', () => {
  console.log(`Reach server listening on port ${port}`);
  void startTelegramPolling();
});
  } catch (error) {
    console.error('MongoDB connection failed:', error.message);
    process.exit(1);
  }
}

startServer();