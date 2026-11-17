# 📈 Skit Stocks by Polar World

Learn investing and the stock market through short interactive skits, like Skit Spanish, but for markets. A coach and a classmate talk you through real situations, and you answer.

- **15 skits in 5 levels.** Levels 1–3 follow the Trapper University course modules in order (paying yourself first, brokerage setup, compound interest, how the market works, sectors and market cap, watchlists and ETFs, financial statements, value vs. value traps, trading styles, LEAPS and inverse ETFs). Levels 4–5 add the standard basics: order types, candlesticks and trends, support and resistance, chart patterns, moving averages, RSI, MACD, bonds and yields, dividends, and risk management.
- **Three rounds per skit, less help each time:** 1 · *Pick it* (multiple choice, and every option explains why it's right or wrong) → 2 · *Fill it in* (type the key word or number) → 3 · *Say it your way* (explain it in your own words, typed or spoken; an LLM on Workers AI checks for understanding, with a keyword check as a fallback).
- **Charts you tap:** support and resistance, higher lows, the double-top neckline and breakdown, the golden cross, RSI above 70. Prices are generated (no data feed) so every pattern is a clean textbook example.
- **Math questions** (Rule of 72, market cap, EPS, P/E, position size, dividend yield) accept "$2,000", "2k", "20 billion" and so on.
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
| `public/js/grade.js` | Checking fill-ins, numbers, keyword fallback, which question each round asks, the review quiz |
| `public/js/chart.js` | Generated candlestick and line charts, moving averages, RSI, and what a tap hit |
| `public/js/judge.js` | The "does this explanation show understanding?" prompt (shared with the Worker) |
| `public/js/app.js` | Home, skit player, review, progress, terms, settings |
| `public/js/store.js`, `progress.js`, `sync.js` | Progress, streaks, review schedule and save codes (same design as Skit Spanish) |
| `worker/index.js` | Cloudflare Worker API |
| `design/icon.cjs` | The icon: the Polar World bear-hug bear holding a rising chart |
