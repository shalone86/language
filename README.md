# 🗣️ Hablar: Spanish slang, out loud

Practice everyday **Mexican and Latin American Spanish** by acting out short skits with an AI partner. The AI plays the taquero, your compa, the mechanic; you play you. Say your lines out loud, and the app tells you word by word whether they came through.

- **16 skits in 4 levels**: taquería, corner store, a party, haggling at the market, a hangover morning, an asado in Buenos Aires, a party in Santiago, hanging out in San Juan… Mexico first, then Colombia, Argentina, Peru, Chile and Puerto Rico.
- **Speaks to you** with natural Mexican, Colombian and Latin American voices (Deepgram Aura-2 on Cloudflare Workers AI).
- **Checks what you said** with Whisper: each word turns green, orange or red. Tap a word to hear it slowly. You get plain-English tips for the classic English-speaker slips: rr, ñ, pure vowels, slipping into English.
- **Slang in context**: phrases are underlined in the conversation (tap for meaning). A phrase is added to **Mis frases** once you've said it correctly, together with the line you said it in.
- **Built to beat the fear**: a lenient pass mark, you're never stuck (skip any line), and help fades by level (echo → read → recall). There's a hands-free mode, and stars and unlocks as you go.
- Works on phones, installable, and works offline for listening. Without the speech checker, you compare your recording with the model voice by ear.

How it was designed (four approaches compared, and what was reused from the articulation app): **[docs/WORKSHOP.md](docs/WORKSHOP.md)**.

## Deploy (Cloudflare Workers, same as articulation)

```bash
npm install
npx wrangler login
npx wrangler deploy            # → https://hablar.<you>.workers.dev
npx wrangler secret put APP_PASSCODE   # optional: keep strangers off your AI quota
```

- Speech-to-text: `@cf/openai/whisper-large-v3-turbo`, forced to Spanish
- Voices: `@cf/deepgram/aura-2-es` (estrella, sirio, javier, celeste, selena, aquila), cached at the edge
- For a custom domain, add a `routes` entry in `wrangler.jsonc` (there's a commented example).
- `public/` on its own also works on any static host, with the device voice and checking by ear.

## Develop

```bash
npm test          # scoring + skit data checks (node:test, no deps)
npx wrangler dev  # local dev (the AI binding calls your Cloudflare account)
```

| Path | What |
|---|---|
| `public/js/data/skits.js` | All skits, levels, phrases. Add a skit by adding an object; `npm test` checks it |
| `public/js/score.js` | Spanish normalization, word alignment, pass marks, pronunciation tips |
| `public/js/app.js` | Home, skit player, Mis frases, settings |
| `public/js/audio.js`, `wav.js`, `tts.js`, `api.js` | Mic, WAV and voice helpers, from articulation |
| `worker/index.js` | Cloudflare Worker API (`/api/health`, `/api/transcribe`, `/api/tts`) |
