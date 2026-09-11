// Discord <-> LINE message bridge
// Forwards text, images, and files between a Discord channel and a LINE chat
// (works with a 1:1 LINE chat OR a LINE group chat).

require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const FormData = require('form-data');
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const line = require('@line/bot-sdk');

// ---------- Config (from environment variables) ----------
const {
  DISCORD_TOKEN,
  DISCORD_CHANNEL_ID,      // Discord channel to watch for outgoing (Discord -> LINE) messages
  DISCORD_WEBHOOK_URL,     // Discord webhook used to post incoming (LINE -> Discord) messages
  LINE_CHANNEL_ACCESS_TOKEN,
  LINE_CHANNEL_SECRET,
  LINE_TARGET_ID,          // userId (1:1 chat) OR groupId (group chat) to push messages to
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

app.get('/', (req, res) => {
  res.status(200).send('Discord <-> LINE bridge is running.');
});

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

// ---------- Helpers ----------

// Turns a LINE content stream (image/video/audio/file) into a Buffer.
function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

// Posts a plain text message to Discord via the webhook.
async function postTextToDiscord(content) {
  const res = await fetch(DISCORD_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) {
    console.error('Failed to post text to Discord:', res.status, await res.text());
  }
}

// Posts a message with a real file attachment to Discord via the webhook.
async function postFileToDiscord(content, buffer, filename) {
  const form = new FormData();
  form.append('payload_json', JSON.stringify({ content }));
  form.append('files[0]', buffer, { filename });

  const res = await fetch(DISCORD_WEBHOOK_URL, {
    method: 'POST',
    body: form,
    headers: form.getHeaders(),
  });
  if (!res.ok) {
    console.error('Failed to post file to Discord:', res.status, await res.text());
  }
}

// Guesses a filename/extension for LINE media based on message type.
function guessLineFilename(event) {
  if (event.message.fileName) return event.message.fileName; // LINE 'file' type includes this
  const ext = { image: 'jpg', video: 'mp4', audio: 'm4a' }[event.message.type] || 'bin';
  return `line-${event.message.id}.${ext}`;
}

async function handleLineEvent(event) {
  // Logged so you can find your LINE_TARGET_ID (user or group) in Render's logs.
  // Group IDs start with "C", user IDs start with "U" — see README.
  console.log('LINE event source:', JSON.stringify(event.source));

  if (event.type !== 'message') return;

  const senderLabel = event.source.type === 'group' ? '**LINE (group):**' : '**LINE:**';
  const { type } = event.message;

  if (type === 'text') {
    await postTextToDiscord(`${senderLabel} ${event.message.text}`);
    return;
  }

  if (['image', 'video', 'audio', 'file'].includes(type)) {
    try {
      const stream = await lineClient.getMessageContent(event.message.id);
      const buffer = await streamToBuffer(stream);
      const filename = guessLineFilename(event);
      await postFileToDiscord(`${senderLabel} sent a ${type}`, buffer, filename);
    } catch (err) {
      console.error(`Failed to relay LINE ${type} to Discord:`, err);
      await postTextToDiscord(`${senderLabel} sent a ${type} (failed to forward it — check logs)`);
    }
    return;
  }

  if (type === 'sticker') {
    await postTextToDiscord(`${senderLabel} [sent a sticker]`);
    return;
  }

  await postTextToDiscord(`${senderLabel} [sent a ${type} message]`);
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
  if (message.author.bot) return;
  if (message.channel.id !== DISCORD_CHANNEL_ID) return;

  const author = message.author.username;

  // 1. Forward plain text, if any
  if (message.content) {
    try {
      await lineClient.pushMessage(LINE_TARGET_ID, {
        type: 'text',
        text: `[Discord] ${author}: ${message.content}`,
      });
    } catch (err) {
      console.error('Failed to push text to LINE:', err.originalError?.response?.data || err);
    }
  }

  // 2. Forward attachments (images render inline in LINE; other files are sent as a link,
  //    since LINE's Messaging API can only push image/video/audio media types, not arbitrary files)
  for (const attachment of message.attachments.values()) {
    const isImage = (attachment.contentType || '').startsWith('image/');
    try {
      if (isImage) {
        await lineClient.pushMessage(LINE_TARGET_ID, {
          type: 'image',
          originalContentUrl: attachment.url,
          previewImageUrl: attachment.url,
        });
      } else {
        await lineClient.pushMessage(LINE_TARGET_ID, {
          type: 'text',
          text: `[Discord] ${author} sent a file: ${attachment.name}\n${attachment.url}`,
        });
      }
    } catch (err) {
      console.error('Failed to push attachment to LINE:', err.originalError?.response?.data || err);
    }
  }
});

// ---------- Start everything ----------
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

discordClient.login(DISCORD_TOKEN);

