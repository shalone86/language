# Handoff: deploy Hablar to Cloudflare

**For:** an AI agent (or a person) running on the owner's own computer, logged in to the owner's Cloudflare account.
**Goal:** put the Hablar app online as a Cloudflare Worker with Workers AI, then check that it works.
**Time:** about 10 minutes. Nothing in this repo needs editing unless you add a custom domain (step 5).

## Context

- Repo: `https://github.com/shalone86/language`, branch `ccr-7ca913f8-1tjcbt` (or `main` once that branch is merged).
- The app is a static site in `public/` plus a small Worker API in `worker/index.js`. Config is in `wrangler.jsonc`. There's no build step.
- The Worker uses the **Workers AI** binding (`AI`) for speech-to-text (`@cf/openai/whisper-large-v3-turbo`) and Spanish voices (`@cf/deepgram/aura-2-es`). For 1–2 users, the free daily allowance is plenty.
- It's set up the same way as the owner's existing `articulation` app (`articulate.shalonely.com`), so use that Cloudflare account (ariyandhamma@gmail.com).

## Rules

- Deploy only to the owner's own Cloudflare account: **ariyandhamma@gmail.com**, the one that hosts `articulation` / `shalonely.com`. If `wrangler whoami` shows any other email (for example admin@olphvb.org), stop and ask. Don't deploy there.
- Don't change or delete any other Worker, DNS record or route on the account.
- Don't commit secrets. The passcode goes in with `wrangler secret put`, never into a file.
- Ask the owner before adding a custom domain (step 5). It creates a DNS record.

## Steps

### 1. Prerequisites

```bash
node --version        # needs Node 18 or newer (20+ recommended)
git --version
```

### 2. Get the code and install

```bash
git clone https://github.com/shalone86/language.git hablar
cd hablar
git checkout ccr-7ca913f8-1tjcbt     # skip if it's already merged into main
npm install
npm test                             # expect: 19 pass, 0 fail
```

### 3. Log in to Cloudflare

```bash
npx wrangler login       # opens a browser; the owner approves
npx wrangler whoami      # must say ariyandhamma@gmail.com, and the account must have the "articulation" Worker
```

To confirm it's the right account, the Workers list should include `articulation`. Check at https://dash.cloudflare.com → Workers & Pages.

If a `CLOUDFLARE_API_TOKEN` is already set in the shell for another account, `unset CLOUDFLARE_API_TOKEN` first, or wrangler will use that account instead of your login. If there are several accounts, set the right one: `export CLOUDFLARE_ACCOUNT_ID=<id from whoami>`.

### 4. Deploy

```bash
npx wrangler deploy
```

Expected output ends with something like:

```
Uploaded hablar
Deployed hablar triggers
  https://hablar.<subdomain>.workers.dev
```

Write down that URL.

**Optional but recommended, a passcode** (stops strangers using up the AI quota):

```bash
npx wrangler secret put APP_PASSCODE    # type a passcode when asked
```

Tell the owner the passcode. They enter it once per device in the app under **⚙️ Ajustes → Passcode**.

### 5. Optional: custom domain (ask the owner first)

To match articulation, e.g. `hablar.shalonely.com`. In `wrangler.jsonc`, add this after `"workers_dev": true` (mind the comma):

```jsonc
  "workers_dev": true,
  "routes": [{ "pattern": "hablar.shalonely.com", "custom_domain": true }]
```

Then run `npx wrangler deploy` again. Cloudflare creates the DNS record and certificate (it can take a minute or two). Commit that change on the branch:

```bash
git add wrangler.jsonc && git commit -m "Serve Hablar on hablar.shalonely.com" && git push
```

## Verify (replace URL; add `-H "x-app-passcode: <passcode>"` if you set one)

```bash
URL=https://hablar.<subdomain>.workers.dev

curl -s $URL/api/health
# expect: {"stt":true,"tts":true,"backend":"Cloudflare Workers AI","model":"whisper-large-v3-turbo","voices":{...}}

curl -s -o /tmp/v.mp3 -w "%{http_code} %{content_type}\n" "$URL/api/tts?text=%C2%A1Qu%C3%A9%20onda%2C%20g%C3%BCey!&voice=javier"
# expect: 200 audio/mpeg   (play /tmp/v.mp3: a Mexican male voice says "¡Qué onda, güey!")

curl -s -o /dev/null -w "%{http_code}\n" $URL/
# expect: 200
```

Then have the owner open the URL **on their phone** (the mic needs HTTPS, and workers.dev has it):

1. Tap **▶ Empezar: En la taquería** → **▶ Empezar**. Don Chuy should speak.
2. On your turn, tap 🎙️, say "Me da tres de pastor, por favor", and tap ■.
3. Words should turn green and the next line should play.
4. **⚙️ Ajustes** should say "✅ Speech checker online".

## Troubleshooting

| Symptom | Fix |
|---|---|
| `wrangler deploy` says the AI binding isn't allowed or Workers AI isn't enabled | In the dashboard, open **AI → Workers AI** once to accept the terms, then deploy again |
| `/api/health` returns `{"error":"passcode required"}` | A passcode is set. Add the header to curl, and enter it in the app's Settings |
| `/api/tts` returns 502 or `tts failed` | Run `npx wrangler tail hablar` and retry. If the voice name is rejected, the model's voices changed; check https://developers.cloudflare.com/workers-ai/models/aura-2-es/ and update `TTS_VOICE_INFO` in `worker/index.js` and the voices in `public/js/data/skits.js` |
| Transcription errors mentioning `initial_prompt` | Delete the `initial_prompt: STT_PROMPT,` line in `worker/index.js` and deploy again |
| Mic does nothing on the phone | It must be opened over `https://`; allow microphone access in the browser's site settings |
| Old version keeps showing | The service worker caches the app. Reload twice, or bump `VERSION` in `public/sw.js` on the next change |
| Name clash: a Worker called `hablar` already exists for something else | Change `"name"` in `wrangler.jsonc` (e.g. `"hablar-es"`) and deploy |

## Report back to the owner

- The live URL (and custom domain, if added)
- Whether a passcode was set (tell them the passcode privately)
- The results of the 3 curl checks and the phone test
- Anything you changed in the repo (commit hash)
