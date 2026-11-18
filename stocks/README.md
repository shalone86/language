# 📈 Skit Stocks by Polar World

Learn investing and the stock market through short interactive skits, like Skit Spanish, but for markets. A coach and a classmate talk you through real situations, and you answer.

- **15 skits in 5 levels.** Levels 1–3 follow the Trapper University course modules in order (paying yourself first, brokerage setup, compound interest, how the market works, sectors and market cap, watchlists and ETFs, financial statements, value vs. value traps, trading styles, LEAPS and inverse ETFs). Levels 4–5 add the standard basics: order types, candlesticks and trends, support and resistance, chart patterns, moving averages, RSI, MACD, bonds and yields, dividends, and risk management.
- **Spoken skits, like Skit Spanish.** The scene plays out, and on your turn you say your line out loud (Whisper writes down what you said and it's matched word by word, or tap ⌨️ to type). After each line you get the "why" behind it.
- **Three rounds per skit, less help each time:** 1 · *Say it* (your line is on screen; in levels 1–2 you hear it first and repeat it) → 2 · *Fill the gaps* (the key term and the important words are hidden; say the whole line) → 3 · *Your own words* (just the question; any correct answer counts, checked for meaning by Llama 3.3 on Workers AI, with a keyword fallback).
- **More freedom as levels get harder:** in levels 1–2 rounds 1 and 2 want the line itself; from level 3, round 2 also accepts your own correct wording; round 3 always does.
- **Charts you tap:** support and resistance, higher lows, the double-top neckline and breakdown, the golden cross, RSI above 70. Prices are generated (no data feed) so every pattern is a clean textbook example.
- **Numbers** in lines are matched whether you say "seventy-two" or Whisper writes "72".
- **Review:** every term you get right comes back as a quiz after 1, 3, 7, 14, 30 and 60 days.
- **Progress:** streak, best streak, days used, last day, terms learned, questions answered, first-try accuracy, rounds, a practice calendar, plus a **save code** that keeps an online copy, so a phone that clears its data doesn't lose anything.

For learning only, not financial advice. Company names in the skits are made up.

## Deploy

From the repo root:

```bash
npm install
npm run deploy:stocks        # → https://stocks.shalonely.com (and skit-stocks.<you>.workers.dev)
```

Uses Workers AI (Whisper for spoken answers, Aura-2 English voices, Llama 3.3 for checking explanations) and a KV namespace for save codes (`wrangler.jsonc`).

## Develop

```bash
npm test                     # from the repo root: runs both apps' tests
```

| Path | What |
|---|---|
| `public/js/data/skits.js` | All lessons: levels, skits, terms and questions. Add a skit by adding an object; the tests check it |
| `public/js/speech.js` | Scoring spoken lines word by word, hiding key words for round 2, which rounds accept your own wording |
| `public/js/grade.js` | Keyword fallback for the meaning check, the review quiz |
| `public/js/chart.js` | Generated candlestick and line charts, moving averages, RSI, and what a tap hit |
| `public/js/judge.js` | The "does this explanation show understanding?" prompt (shared with the Worker) |
| `public/js/app.js` | Home, skit player, review, progress, terms, settings |
| `public/js/store.js`, `progress.js`, `sync.js` | Progress, streaks, review schedule and save codes (same design as Skit Spanish) |
| `worker/index.js` | Cloudflare Worker API |
| `design/icon.cjs` | The icon: the Polar World bear-hug bear holding a rising chart |
