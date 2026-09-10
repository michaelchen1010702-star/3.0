# Discord ↔ LINE Bridge

Forwards messages from a Discord channel to a LINE chat, and from that LINE chat
back into a Discord channel.

## 1. Discord setup

1. Go to the **Discord Developer Portal** → New Application → give it a name.
2. Go to **Bot** tab → click **Add Bot**.
   - Copy the **Bot Token** → this is `DISCORD_TOKEN`.
   - Under **Privileged Gateway Intents**, enable **Message Content Intent**.
3. Go to **OAuth2 → URL Generator**:
   - Scopes: `bot`
   - Bot permissions: `Read Messages/View Channels`, `Send Messages`
   - Open the generated URL and invite the bot to your server.
4. In Discord, enable Developer Mode (User Settings → Advanced), right-click the
   channel you want to bridge, and **Copy Channel ID** → this is `DISCORD_CHANNEL_ID`.
5. In that same channel, go to **Edit Channel → Integrations → Webhooks → New Webhook**.
   Copy its URL → this is `DISCORD_WEBHOOK_URL`.

## 2. LINE setup

1. Go to **LINE Developers Console** → create a **Provider** (if you don't have one).
2. Create a new **Messaging API** channel under that provider.
3. In the channel's **Messaging API** tab:
   - Issue a **Channel Access Token (long-lived)** → this is `LINE_CHANNEL_ACCESS_TOKEN`.
   - Copy the **Channel Secret** (Basic settings tab) → this is `LINE_CHANNEL_SECRET`.
   - Disable "Auto-reply messages" and "Greeting messages" (optional but recommended).
4. Add the bot as a friend using its QR code (shown in the Messaging API tab), and
   send it any message.
5. To get `LINE_TARGET_ID` (the userId to push messages to):
   - Temporarily log incoming webhook events (see step 4 below) — the `source.userId`
     field in the first message you send will be your target ID. Copy it into your
     env vars once you have it.

## 3. Deploy to Render

1. Push this project to a **GitHub** repo.
2. In the **Render Dashboard**: New → Web Service → connect your GitHub repo.
   - Build command: `npm install`
   - Start command: `npm start`
3. Add all variables from `.env.example` under **Environment** in Render.
4. Deploy. Once live, Render gives you a URL like `https://your-app.onrender.com`.
5. Go back to **LINE Developers Console → Messaging API tab**:
   - Set **Webhook URL** to `https://your-app.onrender.com/line-webhook`
   - Click **Verify** to confirm it connects, then toggle **Use webhook** on.

## 4. Getting your LINE_TARGET_ID (first run)

Before you have `LINE_TARGET_ID`, the app will still boot (it's required, so use a
placeholder temporarily, e.g. `pending`). To find your real ID:
- Temporarily add `console.log(JSON.stringify(event.source))` inside `handleLineEvent`
  in `index.js`, redeploy, send the LINE bot a message, and check the Render logs.
- Copy the `userId` value into `LINE_TARGET_ID` in Render's environment settings,
  remove the debug log, and redeploy.

## 5. Keep it alive with UptimeRobot

Render's free tier spins down after inactivity. To prevent that:
1. In **UptimeRobot**, create a new **HTTP(s) monitor**.
2. URL: `https://your-app.onrender.com/` (the health-check route).
3. Interval: every 5 minutes.

## Local development

```bash
npm install
cp .env.example .env   # fill in your real values
npm start
```

## How messages flow

- **Discord → LINE**: any non-bot message in `DISCORD_CHANNEL_ID` is pushed to
  `LINE_TARGET_ID` via the LINE Messaging API.
- **LINE → Discord**: LINE calls `/line-webhook` on new messages; the app posts
  them to Discord via `DISCORD_WEBHOOK_URL`.

