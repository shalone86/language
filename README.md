# 🗣️ Hablar: Spanish slang, out loud

Practice everyday **Mexican and Latin American Spanish** by acting out short skits with an AI partner. The AI plays the taquero, your compa, the mechanic; you play you. Say your lines out loud, and the app tells you word by word whether they came through.

- **16 skits in 4 levels**: taquería, corner store, a party, haggling at the market, a hangover morning, an asado in Buenos Aires, a party in Santiago, hanging out in San Juan… Mexico first, then Colombia, Argentina, Peru, Chile and Puerto Rico.
- **Speaks to you** with natural Mexican, Colombian and Latin American voices (Deepgram Aura-2 on Cloudflare Workers AI).
- **Checks what you said** with Whisper: each word turns green, orange or red. Tap a word to hear it slowly. You get plain-English tips for the classic English-speaker slips: rr, ñ, pure vowels, slipping into English.
- **Slang in context**: phrases are underlined in the conversation (tap for meaning). A phrase is added to **Mis frases** once you've said it correctly, together with the line you said it in.
- **Three rounds per skit, less help each time**: 1 · *Con letra* (every word shown) → 2 · *A medias* (half the words are blanks, the slang first) → 3 · *Sin letra* (no Spanish on screen: say it your way, and any reply that makes sense in the conversation counts; an LLM on Workers AI checks the meaning).
- **Repaso (review tests)**: every phrase you've said comes back as a quick test after 1, 3, 7, 14, 30 and 60 days. You hear the line before it and answer with no Spanish on screen, using the phrase. Miss it and it comes back tomorrow.
- **Progress tracking**: current and best streak, days used, last day practiced, words learned (said correctly at least once), slang phrases, lines spoken, time talking, a practice calendar, and rounds done per skit. It's all stored in the browser, with backup and restore.
- **Built to beat the fear**: a lenient pass mark, you're never stuck (skip any line or peek at it), and help fades round by round. There's a hands-free mode, and new levels open as you go.
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
- Meaning check for free replies: `@cf/meta/llama-3.3-70b-instruct-fp8-fast`
- Voices: `@cf/deepgram/aura-2-es` (estrella, sirio, javier, celeste, selena, aquila), cached at the edge
- For a custom domain, add a `routes` entry in `wrangler.jsonc` (there's a commented example).
- `public/` on its own also works on any static host, with the device voice and checking by ear.

## Develop

```bash
npm test          # scoring, skit data, streaks, rounds, reviews, store, Worker judge (node:test, no deps)
npx wrangler dev  # local dev (the AI binding calls your Cloudflare account)
```

| Path | What |
|---|---|
| `public/js/data/skits.js` | All skits, levels, phrases. Add a skit by adding an object; `npm test` checks it |
| `public/js/score.js` | Spanish normalization, word alignment, pass marks, pronunciation tips |
| `public/js/progress.js` | Streaks, rounds, hiding half the words, review schedule (pure, tested) |
| `public/js/review.js` | Finding phrases in lines, building a review session |
| `public/js/judge.js` | "Does this reply make sense?" prompt and answer parsing (Worker + tests) |
| `public/js/app.js` | Home, skit player (rounds + reviews), Progreso, Mis frases, settings |
| `public/js/audio.js`, `wav.js`, `tts.js`, `api.js` | Mic, WAV and voice helpers, from articulation |
| `worker/index.js` | Cloudflare Worker API (`/api/health`, `/api/transcribe`, `/api/tts`, `/api/judge`) |
