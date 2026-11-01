# Workshop: four ways to build a Spanish slang skit app

The brief: Mexican and Latin American colloquial Spanish, practiced **out loud** in everyday skits with an AI partner, at the click of a button. The AI says some lines and you say others. The app speaks to you and checks whether you said your words right. Grammar explanations aren't the point. The main goal is to **stop being afraid to speak Spanish out loud**, and to learn new words **in context**, never as isolated vocab. As you get skits right, harder skits with more slang open up.

This doc covers the four designs I considered, what each is good and bad at, what was copied from the [articulation](https://github.com/shalone86/articulation) app, and what got built.

---

## The one hard constraint: how do you check pronunciation?

Everything depends on this. Articulation's workshop already measured the core lesson: **Whisper is built to understand you despite your accent**, so it's a "would a listener understand you?" checker, not a phonetics lab. It's also much more reliable when it knows what you were trying to say. For skits that works in our favor:

- If we **know the line** you're meant to say, we can align what Whisper heard word by word and color each word: ✅ came through, 🟠 close, 🔴 missed. That's concrete, honest feedback ("*pastor* came out as *pasto*").
- If we **don't know the line** (free conversation), we can only judge meaning, not pronunciation.

So the four designs below differ mostly in how much of the script is fixed, which trades **natural conversation** against **reliable pronunciation feedback**.

---

## Way 1: Scripted skits ("karaoke")

Each skit is a fixed script. The AI character says its lines with a natural voice; you say yours; Whisper (forced to Spanish) transcribes; the app aligns it word by word against your line.

| 👍 | 👎 |
|---|---|
| Feedback is reliable and specific: we know every word you were meant to say | Rigid: same conversation every time |
| Slang is hand-picked and correct for each country (no AI-invented slang) | Someone has to write the skits |
| Cheap: AI voice lines are cached at the edge after the first play, and STT is one call per attempt | |
| Works offline for listening; degrades to "compare by ear" without a server | |
| Difficulty is easy to tune (line length, slang density, speed, how much help) | |

## Way 2: Branching skits ("pick your reply")

Same as Way 1, but at some turns you get two or three replies to choose from ("¡Va! ¿A qué hora?" or "Sale, pero ahorita no puedo."). **You don't tap one, you just say one**: the app scores your attempt against every option and takes the best match. Later, branches can lead to different AI replies.

| 👍 | 👎 |
|---|---|
| Feels like *your* conversation: you decide what to say | More writing (each branch needs a sensible reply) |
| Still fully checkable: every option is known text | Options must sound different enough for the scorer to tell apart |
| Teaches several ways to say the same thing (sale / va / me late) | |

## Way 3: AI improv (LLM role-play)

An LLM (e.g. Llama 3.3 70B on Workers AI) plays the character from a scene card ("taquero in CDMX, use: ¿qué le damos?, con todo, aguas"). You speak freely; Whisper transcribes; the LLM answers in character, and could "recast" what you said into a more natural, slangier version for you to repeat.

| 👍 | 👎 |
|---|---|
| Endless, natural conversations, never the same twice | **No pronunciation check**: we don't know what you meant to say, so we can only judge meaning |
| Great final exam for someone who's no longer afraid | Slow: STT + LLM + TTS ≈ 3–6 s per turn, which kills the flow |
| | LLMs mix regions (Argentine *che* in a Mexican taquería) and invent slang |
| | Needs content safety and costs more per turn |
| | Too open for a beginner who is nervous to speak at all |

## Way 4: Shadowing with sound-level scoring ("eco")

Pronunciation first: the AI says your line, you echo it immediately, and a phoneme recognizer (a wav2vec2 / XLS-R model fine-tuned for phonemes, self-hosted) compares sounds, so it can say "your rr was a single r" or "your *e* glided into *ei*".

| 👍 | 👎 |
|---|---|
| The most precise pronunciation feedback | Needs a self-hosted GPU/CPU server (no serverless option runs these models) |
| Echoing is the gentlest way to start talking | Phoneme feedback for a nervous learner can feel like grading, which works against "sin miedo" |
| | Accuracy on accented, noisy phone audio needs real measurement before it can be trusted |

---

## The pick: Way 1 as the backbone, with Way 2 and Way 4 built in, and Way 3 later

What got built is **scripted skits** (Way 1), plus:

- **Way 2's "say any one" replies**: some of your turns have two options; whichever you say counts.
- **Way 4's echo, without the phoneme server**: in level 1 the AI says your line first and you repeat it. Instead of phoneme scoring, the word-level scorer spots the specific mistakes English speakers make (rr → r: *perro* → *pero*; ñ → n: *año* → *ano*; vowel changes: *tengo* → *tango*; English slips: *sé* → *say*; dropped final s) and explains each in plain words. Before you speak, a 🔊 tip shows the hardest sound in the line.
- **Way 3** stays on the roadmap as a "free play" mode after level 4. It will run on the same Worker, and it should only open once a learner has finished the scripted skits, so it's the final exam and not the first experience.

Why: the brief's #1 goal is **confidence speaking out loud**. That needs fast turns, clear "it came through!" moments, and feedback that's right. Scripted skits give all three. Choices and echo add agency and a gentle on-ramp without losing checkability.

### How it reduces fear (design choices)

- **Lenient pass mark**: 75% of words is a pass ("They'd understand you"), and 95%+ is "¡Eso!". A word that's one letter off counts half.
- **Never stuck**: ⏭ Saltar is always there, and after two tries it turns into a highlighted "Seguir". Skipping just costs a star.
- **Help fades by level**: Level 1 *echo* (hear it, say it) → Level 2 *read* (read and say) → Levels 3–4 *recall* (see the English, say it in Spanish, 👀 peek if needed).
- **Hands-free mode**: the mic opens automatically on your turn, so it feels like a real back-and-forth.
- **Loud is good**: "I didn't catch that" asks you to speak *louder*, never "wrong".
- **Stars** come from first-try lines, but finishing always gives at least ★.

### How words are learned in context

- Each skit has 6–13 **frases**: underlined in the lines, tap to hear them and see the meaning. 🌶️ marks informal ones (güey, la raja, coger in Puerto Rico vs. Mexico).
- A phrase only goes into **Mis frases** when you've *said it out loud* correctly, and it's saved with the line you said it in, so you review it as part of a sentence, not on its own.
- A test makes sure every listed phrase actually appears in its skit.

### Levels and progression

| Level | Help | Skits | Unlocks after |
|---|---|---|---|
| 1 · Calentando | echo | 🇲🇽 taquería, ¿qué onda güey?, tiendita, taxi | — |
| 2 · Agarrando la onda | read | 🇲🇽 fiesta, mercado, chamba · 🇨🇴 tinto en Medellín | 3 level-1 skits |
| 3 · Sin miedo | recall | 🇲🇽 la cruda · 🇨🇴 parche · 🇦🇷 asado · 🇵🇪 ceviche | 3 level-2 skits |
| 4 · Como local | recall, faster | 🇨🇱 carrete · 🇵🇷 janguear · 🇲🇽 chisme, taller | 3 level-3 skits |

The learner's lines avoid gendered words (*tengo un poco de nervios*, not *estoy nervioso/a*), so anyone can say them as written.

---

## What was copied from articulation

| From articulation | In Hablar | Changes |
|---|---|---|
| `audio.js` (mic → trimmed, normalized 16 kHz WAV; auto-stop on silence; **noise suppression off**) | copied | longer takes (12 s max, 1.3 s pause) for full lines |
| `wav.js` | copied as is | — |
| `api.js` (health / transcribe / tts, passcode header) | copied | — |
| `tts.js` (stuck-speechSynthesis fixes, prefetch, one reused `<audio>`) | adapted | voice per character; browser fallback prefers es-MX → es-US → es-419 |
| `worker/index.js` (Workers AI Whisper + Aura, edge-cached TTS, passcode) | adapted | `language: "es"`, a slang spelling hint, Aura-2 **Spanish** voices |
| `score.js` → `scoreSentence` (word alignment) | adapted | Spanish normalization (accents off, **ñ kept**, numbers → *setenta y cinco*, güey/wey/way, pa'/para, quiubo/qué hubo), half credit for close words, Spanish learner diagnoses |
| `store.js` (localStorage, backup/restore) | adapted | skits, stars, phrases, streak |
| `sw.js` (offline shell, cached voice clips) | copied | asset list |
| Hosting decision (Cloudflare Workers + Workers AI, zero upkeep) | same | — |
| Not copied | phoneme cards, minimal pairs, forced-choice server, ESL first-language data | English-specific |

### Voices

Workers AI's `@cf/deepgram/aura-2-es` has 10 voices. Deepgram lists their accents as: **Mexican**: estrella (f), sirio (m), javier (m); **Colombian**: celeste (f); **Latin American**: selena (f), aquila (m); and four from Spain (not used). Mexican and Colombian characters get matching voices. **Argentina, Chile, Peru and Puerto Rico use the "Latin American" voices**, so the slang is local but the accent isn't; the Argentine skit says so in its scene description. When the server is unavailable, the device's own Spanish voice is used.

---

## Honest limits (and what to measure next)

- **Not yet measured on real learners.** Articulation's numbers were for English single words. Whisper on full Spanish lines from English-accented speakers needs the same kind of test: record ~20 people per skit, and tune `PASS` and the close-word rule in `score.js`.
- Whisper normalizes accents. ✅ means "a Mexican would understand you", not "native-like". Every line has ▶ *Mi voz* and 👂 *Oír*, so you can also train your own ear.
- Stress (*esta* / *está*, *papa* / *papá*) can't be checked: Whisper places written accents from context, not from your voice, so the scorer ignores accent marks.
- Single-sound faults (a soft rr that's still understood) pass. Catching those needs Way 4's phoneme model, which is the natural next upgrade for the self-hosted option.

## Roadmap

1. **Measure** pass/fail accuracy on real recordings and tune the thresholds.
2. **Free play (Way 3)** after level 4: LLM character from the skit's scene card, restricted to that country's phrase list, with recasts you repeat (those *are* checkable).
3. **Phoneme check (Way 4)** on a self-hosted server, for an opt-in "precision" mode on rr / ñ / vowels.
4. More skits per country and real branching (different AI replies per choice), plus spaced review of *Mis frases* as mini-skits.
5. Human-recorded audio for Argentine, Chilean and Caribbean voices.
