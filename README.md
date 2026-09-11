# Discord ↔ LINE Bridge — Full Setup Guide

This bot forwards messages from a Discord channel to a LINE chat, and from that
LINE chat back into Discord. This guide assumes no prior experience and covers
setup entirely from a phone browser (tested for Samsung/Android, but works the
same on any phone).

---

## What you'll end up with

- A GitHub repo containing this code
- A Render web service running the bot 24/7
- A Discord bot in your server
- A LINE "official account" you can chat with
- UptimeRobot pinging it so Render doesn't put it to sleep

---

## Part 1 — Upload the code to GitHub

1. Go to **github.com** and log in, then create a **New repository**
   (green "New" button or the **+** icon top right → *New repository*).
   - Name it something like `discord-line-bridge`
   - Keep it **Public** or **Private**, either works
   - Don't add a README/gitignore from GitHub's own prompt — we already have them
   - Tap **Create repository**

2. **Upload the normal files first:**
   - On your new repo's page, tap **Add file → Upload files**
   - Select `index.js`, `package.json`, and `README.md` from your phone's storage
   - Scroll down, tap **Commit changes**

3. **Create `.gitignore` (phones hide dot-files, so create it manually):**
   - Tap **Add file → Create new file**
   - In the "Name your file" box type: `.gitignore`
   - Paste in:
     ```
     node_modules/
     .env
     ```
   - Tap **Commit changes**

4. **Create `.env.example` the same way:**
   - **Add file → Create new file**
   - Name: `.env.example`
   - Paste:
     ```
     DISCORD_TOKEN=your_discord_bot_token
     DISCORD_CHANNEL_ID=discord_channel_id_to_watch
     DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/xxxx/yyyy
     LINE_CHANNEL_ACCESS_TOKEN=your_line_channel_access_token
     LINE_CHANNEL_SECRET=your_line_channel_secret
     LINE_TARGET_ID=line_user_or_group_id_to_push_to
     PORT=3000
     ```
   - Tap **Commit changes**

   ⚠️ **Never create a real `.env` file in GitHub.** Your actual secrets only ever
   go into Render's Environment settings (Part 5), never into the repo.

---

## Part 2 — Create the Discord bot

1. Go to **discord.com/developers/applications** → tap **New Application**,
   give it a name (e.g. "LINE Bridge") → **Create**.

2. In the left sidebar, tap **Bot**.
   - Tap **Reset Token** (or it may already show one) → **Copy** it.
     This is your `DISCORD_TOKEN`. Save it somewhere temporarily (like your Notes app) — you'll paste it into Render later.
   - Scroll down to **Privileged Gateway Intents** → turn ON **Message Content Intent** → Save.

3. In the left sidebar, tap **OAuth2 → URL Generator**.
   - Under **Scopes**, check `bot`
   - Under **Bot Permissions**, check `Send Messages` and `Read Message History`
   - Scroll down, copy the generated URL, open it in a new tab, pick your server, **Authorize**.
   - This adds the bot to your server (it'll show offline until we deploy it — that's normal).

4. In Discord itself:
   - Open **Settings → Advanced** → turn on **Developer Mode**.
   - Go to the channel you want to bridge, **long-press or tap the channel name → Copy Channel ID**.
     This is your `DISCORD_CHANNEL_ID`.

5. Still in that channel:
   - Tap **Edit Channel → Integrations → Webhooks → New Webhook**.
   - Tap the webhook, **Copy Webhook URL**.
     This is your `DISCORD_WEBHOOK_URL`.

---

## Part 3 — Create the LINE bot

1. Go to **developers.line.biz** and log in with your LINE account.

2. Create a **Provider** if you don't have one (just a name for your organization/self).

3. Under that provider, tap **Create a new channel → Messaging API**.
   - Fill in the required fields (channel name, description, category — anything reasonable works).
   - Agree to terms → **Create**.

4. Open your new channel, go to the **Messaging API** tab:
   - Scroll to **Channel access token** → tap **Issue** → copy it.
     This is your `LINE_CHANNEL_ACCESS_TOKEN`.
   - Go to the **Basic settings** tab → copy **Channel secret**.
     This is your `LINE_CHANNEL_SECRET`.
   - Back in **Messaging API** tab, turn **OFF** "Auto-reply messages" and
     "Greeting messages" (under Response settings / LINE Official Account Manager) — optional, but keeps things clean.

5. On the **Messaging API** tab, find the **QR code** → scan it with LINE on
   your phone (or another phone) to add the bot as a friend. Send it any test
   message like "hi" — you'll need this later to get your `LINE_TARGET_ID`.

---

## Part 4 — Deploy to Render

1. Go to **dashboard.render.com** → **New → Web Service**.

2. Connect your GitHub account if not already connected, then select the
   `discord-line-bridge` repo.

3. Fill in:
   - **Name:** anything, e.g. `discord-line-bridge`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free is fine to start

4. Before deploying, scroll to **Environment Variables** and add each one:

   | Key | Value |
   |---|---|
   | `DISCORD_TOKEN` | (from Part 2) |
   | `DISCORD_CHANNEL_ID` | (from Part 2) |
   | `DISCORD_WEBHOOK_URL` | (from Part 2) |
   | `LINE_CHANNEL_ACCESS_TOKEN` | (from Part 3) |
   | `LINE_CHANNEL_SECRET` | (from Part 3) |
   | `LINE_TARGET_ID` | `pending` (temporary — see Part 6) |
   | `PORT` | `3000` |

5. Tap **Create Web Service**. Render will build and deploy — watch the logs
   until it says something like `Server listening on port 3000` and
   `Discord bot logged in as ...`.

6. Once live, copy your app's URL from the top of the Render page
   (e.g. `https://discord-line-bridge-xxxx.onrender.com`).

---

## Part 5 — Connect LINE's webhook to Render

1. Back in **developers.line.biz**, open your channel → **Messaging API** tab.
2. Find **Webhook URL** → tap **Edit** → paste:
   `https://your-render-url.onrender.com/line-webhook`
   → **Update**.
3. Tap **Verify** — it should say Success (this confirms Render is reachable).
4. Turn **Use webhook** to **ON**.

---

## Part 6 — Get your real LINE_TARGET_ID

Right now `LINE_TARGET_ID` is a placeholder, so LINE→Discord messages won't send yet. To get the real value:

1. In LINE, send another message to your bot (the friend you added in Part 3).
2. In Render, go to your service → **Logs** tab.
3. Because the app is already set up to log webhook activity, look for a line
   mentioning your message — the LINE `userId` will appear there. It's a string
   starting with `U` followed by a long string of letters/numbers.
4. Copy that ID.
5. In Render → your service → **Environment** → edit `LINE_TARGET_ID` → paste
   the real value → **Save Changes** (this triggers a redeploy automatically).

---

## Part 7 — Keep it awake with UptimeRobot

Render's free tier sleeps after ~15 minutes of no traffic, which would delay
the first message after idle time. UptimeRobot pings it so it never sleeps.

1. Go to **uptimerobot.com** → log in → **Add New Monitor**.
2. Monitor Type: **HTTP(s)**
3. Friendly Name: anything, e.g. "Discord LINE Bridge"
4. URL: your Render URL (the same one, no path needed —
   `https://your-render-url.onrender.com/`)
5. Monitoring Interval: **5 minutes**
6. **Create Monitor**.

---

## Part 8 — Using a LINE group chat instead of a 1:1 chat

1. In the **LINE Official Account Manager** (manage.line.biz — log in with the
   same account), go to your bot's account → **Settings → Response settings**.
   - Under **Chats**, make sure **"Allow bot to join group chats"** is turned **ON**.
2. In the LINE app, open the group you want to bridge → tap the menu → **Invite** →
   search for your bot by name → add it.
3. Send any message in that group (e.g. "hi bot").
4. Get the **group ID** the same way as Part 6: open Render → **Logs**, find the
   `LINE event source` log line — for a group it'll look like
   `{"type":"group","groupId":"C1234...","userId":"..."}`. Copy the `groupId` value
   (starts with `C`).
5. In Render → **Environment**, set `LINE_TARGET_ID` to that group ID → **Save Changes**.

Messages the bridge sends will now go to the whole group, and any message
anyone sends in that group will be forwarded to Discord (labeled
"LINE (group):").

## Sending and receiving pictures and files

- **Discord → LINE:**
  - Images (jpg/png/gif/webp) attached to a Discord message are sent as real
    inline images in LINE.
  - Any other file type (pdf, zip, docx, etc.) can't be sent as a native LINE
    file message — LINE's API only supports pushing image/video/audio media —
    so the bridge instead sends a text message with the file name and a
    direct download link.
- **LINE → Discord:**
  - Images, videos, audio clips, and files sent in LINE (including in a group)
    are downloaded by the bot and re-uploaded to Discord as a real attachment,
    so they show up inline/playable in Discord just like a normal upload.
  - Stickers show up as a "[sent a sticker]" placeholder (LINE stickers are
    licensed assets, so the actual sticker image isn't forwarded).

## Testing it

- **Discord → LINE:** type a message (or attach an image) in the Discord
  channel you connected — it should arrive in your LINE chat/group within a
  few seconds.
- **LINE → Discord:** send a message, photo, or file to the bot in LINE (or in
  the group) — it should appear in the Discord channel via the webhook,
  labeled "LINE: ..." or "LINE (group): ...".

---

## Troubleshooting

- **Nothing happens on Discord → LINE:** double check `DISCORD_CHANNEL_ID` is
  the exact channel you're typing in, and that Message Content Intent is
  enabled in the Developer Portal.
- **Nothing happens on LINE → Discord:** re-check the Webhook URL is saved and
  "Use webhook" is ON in LINE, and that `LINE_TARGET_ID` is your real ID, not
  `pending`.
- **Render shows a crash/red status:** open the **Logs** tab — it usually
  points to a missing or mistyped environment variable.
