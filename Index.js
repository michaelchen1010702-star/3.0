// Discord <-> LINE message bridge
// Forwards messages from a Discord channel to LINE, and from LINE to a Discord webhook.

require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const line = require('@line/bot-sdk');

// ---------- Config (from environment variables) ----------
const {
  DISCORD_TOKEN,
  DISCORD_CHANNEL_ID,      // Discord channel to watch for outgoing (Discord -> LINE) messages
  DISCORD_WEBHOOK_URL,     // Discord webhook used to post incoming (LINE -> Discord) messages
  LINE_CHANNEL_ACCESS_TOKEN,
  LINE_CHANNEL_SECRET,
  LINE_TARGET_ID,          // userId or groupId to push Discord messages to
  PORT = 3000,
} = process.env;

const REQUIRED = [
  'DISCORD_TOKEN', 'DISCORD_CHANNEL_ID', 'DISCORD_WEBHOOK_URL',
  'LINE_CHANNEL_ACCESS_TOKEN', 'LINE_CHANNEL_SECRET', 'LINE_TARGET_ID',
];
for (const key of REQUIRED) {
  if (!process.env[key]) {
    console.error(`Missing required env var: ${key}`);
    process.exit(1);
  }
}

// ---------- LINE client ----------
const lineConfig = {
  channelAccessToken: LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: LINE_CHANNEL_SECRET,
};
const lineClient = new line.Client(lineConfig);

// ---------- Express app (handles LINE webhook + health check) ----------
const app = express();

// Health check for UptimeRobot
app.get('/', (req, res) => {
  res.status(200).send('Discord <-> LINE bridge is running.');
});

// LINE webhook endpoint
app.post('/line-webhook', line.middleware(lineConfig), async (req, res) => {
  try {
    const events = req.body.events || [];
    await Promise.all(events.map(handleLineEvent));
    res.status(200).end();
  } catch (err) {
    console.error('Error handling LINE webhook:', err);
    res.status(500).end();
  }
});

async function handleLineEvent(event) {
  if (event.type !== 'message') return;

  let content = null;

  if (event.message.type === 'text') {
    content = event.message.text;
  } else if (event.message.type === 'sticker') {
    content = '[Sent a sticker]';
  } else if (event.message.type === 'image') {
    content = '[Sent an image]';
  } else {
    content = `[Sent a ${event.message.type} message]`;
  }

  await postToDiscord(`**LINE:** ${content}`);
}

async function postToDiscord(content) {
  const res = await fetch(DISCORD_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error('Failed to post to Discord:', res.status, text);
  }
}

// ---------- Discord client ----------
const discordClient = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

discordClient.once('ready', () => {
  console.log(`Discord bot logged in as ${discordClient.user.tag}`);
});

discordClient.on('messageCreate', async (message) => {
  // Ignore bots (including itself) and messages outside the watched channel
  if (message.author.bot) return;
  if (message.channel.id !== DISCORD_CHANNEL_ID) return;
  if (!message.content) return;

  try {
    await lineClient.pushMessage(LINE_TARGET_ID, {
      type: 'text',
      text: `[Discord] ${message.author.username}: ${message.content}`,
    });
  } catch (err) {
    console.error('Failed to push message to LINE:', err.originalError?.response?.data || err);
  }
});

// ---------- Start everything ----------
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

discordClient.login(DISCORD_TOKEN);

