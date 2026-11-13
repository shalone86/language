// Four Polar World logo concepts: a polar bear and a world. Flat shapes, one palette.
const fs = require("fs");
const opentype = require("opentype.js");

const NAVY = "#1b2a4a", OCEAN = "#2f8fdc", OCEAN_D = "#1f6fb8", ICE = "#e8f6fd", WHITE = "#ffffff", LAND = "#47c08a";
const svg = (body, bg = "") => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">${bg}${body}</svg>\n`;

// Globe lines clipped to a circle: latitude ellipses + meridians.
function globeLines(cx, cy, r, id, { color = WHITE, opacity = 0.45, w = 6 } = {}) {
  return `<clipPath id="${id}"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath>
  <g clip-path="url(#${id})" fill="none" stroke="${color}" stroke-opacity="${opacity}" stroke-width="${w}">
    <ellipse cx="${cx}" cy="${cy}" rx="${r}" ry="${r * 0.36}"/>
    <path d="M${cx - r} ${cy} H${cx + r}"/>
    <ellipse cx="${cx}" cy="${cy}" rx="${r * 0.42}" ry="${r}"/>
    <path d="M${cx} ${cy - r} V${cy + r}"/>
  </g>`;
}

// ── 1. On top of the world: a bear walking over the globe, white on a navy badge ──
function bear(x, y, s = 1) {
  // Side view walking right: big rump, shoulder hump, long neck, head held low. One white shape.
  const t = (dx, dy) => `${(x + dx * s).toFixed(1)} ${(y + dy * s).toFixed(1)}`;
  return `<path fill="${WHITE}" d="
    M${t(-100, 10)}
    C${t(-104, -26)} ${t(-80, -46)} ${t(-44, -46)}
    C${t(-14, -46)} ${t(10, -52)} ${t(34, -50)}
    C${t(56, -48)} ${t(70, -36)} ${t(84, -22)}
    C${t(94, -12)} ${t(104, -6)} ${t(116, -6)}
    C${t(130, -6)} ${t(140, 0)} ${t(138, 10)}
    C${t(136, 18)} ${t(122, 20)} ${t(108, 18)}
    C${t(96, 17)} ${t(86, 20)} ${t(76, 26)}
    L${t(76, 54)} C${t(76, 62)} ${t(54, 62)} ${t(54, 54)} L${t(52, 32)}
    L${t(28, 34)} L${t(28, 50)} C${t(28, 58)} ${t(8, 58)} ${t(8, 50)} L${t(6, 34)}
    L${t(-44, 34)} L${t(-46, 50)} C${t(-46, 58)} ${t(-66, 58)} ${t(-66, 50)} L${t(-68, 32)}
    L${t(-78, 32)} L${t(-78, 56)} C${t(-78, 64)} ${t(-100, 64)} ${t(-100, 56)}
    Z"/>
  <circle cx="${x + 96 * s}" cy="${y - 18 * s}" r="${9 * s}" fill="${WHITE}"/>
  <circle cx="${x + 138 * s}" cy="${y + 6 * s}" r="${5.5 * s}" fill="${NAVY}"/>
  <circle cx="${x + 112 * s}" cy="${y - 4 * s}" r="${4 * s}" fill="${NAVY}"/>`;
}
const c1 = svg(`
  <circle cx="256" cy="256" r="246" fill="${NAVY}"/>
  <circle cx="256" cy="336" r="132" fill="${OCEAN}" stroke="${ICE}" stroke-width="10"/>
  ${globeLines(256, 336, 127, "g1")}
  ${bear(236, 150, 1.02)}
  <g fill="${ICE}"><circle cx="120" cy="120" r="5"/><circle cx="398" cy="96" r="4"/><circle cx="420" cy="180" r="6"/><circle cx="92" cy="210" r="4"/><circle cx="170" cy="72" r="3"/></g>
`);

// ── 2. Bear-head globe: the head IS the world (ears + face on a globe) ──
const c2 = svg(`
  <circle cx="138" cy="148" r="58" fill="${OCEAN_D}"/><circle cx="374" cy="148" r="58" fill="${OCEAN_D}"/>
  <circle cx="138" cy="148" r="28" fill="${ICE}"/><circle cx="374" cy="148" r="28" fill="${ICE}"/>
  <circle cx="256" cy="288" r="190" fill="${OCEAN}"/>
  ${globeLines(256, 288, 190, "g2", { opacity: 0.4 })}
  <ellipse cx="256" cy="352" rx="92" ry="70" fill="${WHITE}"/>
  <path d="M226 322 Q256 306 286 322 Q284 350 256 356 Q228 350 226 322Z" fill="${NAVY}"/>
  <path d="M256 356 V378 M256 378 Q236 396 216 384 M256 378 Q276 396 296 384" fill="none" stroke="${NAVY}" stroke-width="9" stroke-linecap="round"/>
  <circle cx="186" cy="262" r="17" fill="${NAVY}"/><circle cx="326" cy="262" r="17" fill="${NAVY}"/>
  <circle cx="191" cy="256" r="5" fill="${WHITE}"/><circle cx="331" cy="256" r="5" fill="${WHITE}"/>
`);

// ── 3. Bear hug: a bear peeking over the world, paws wrapped on top ──
const c3 = svg(`
  <rect x="8" y="8" width="496" height="496" rx="120" fill="${ICE}"/>
  <circle cx="186" cy="114" r="30" fill="${WHITE}" stroke="${NAVY}" stroke-width="10"/>
  <circle cx="326" cy="114" r="30" fill="${WHITE}" stroke="${NAVY}" stroke-width="10"/>
  <circle cx="186" cy="114" r="12" fill="${NAVY}" opacity="0.25"/><circle cx="326" cy="114" r="12" fill="${NAVY}" opacity="0.25"/>
  <circle cx="256" cy="196" r="96" fill="${WHITE}" stroke="${NAVY}" stroke-width="10"/>
  <circle cx="220" cy="180" r="11" fill="${NAVY}"/><circle cx="292" cy="180" r="11" fill="${NAVY}"/>
  <ellipse cx="256" cy="222" rx="38" ry="28" fill="${ICE}"/>
  <path d="M240 210 Q256 202 272 210 Q270 224 256 226 Q242 224 240 210Z" fill="${NAVY}"/>
  <circle cx="256" cy="372" r="134" fill="${OCEAN}" stroke="${NAVY}" stroke-width="10"/>
  ${globeLines(256, 372, 129, "g3", { opacity: 0.45, w: 6 })}
  <ellipse cx="186" cy="262" rx="44" ry="28" fill="${WHITE}" stroke="${NAVY}" stroke-width="10" transform="rotate(-18 186 262)"/>
  <ellipse cx="326" cy="262" rx="44" ry="28" fill="${WHITE}" stroke="${NAVY}" stroke-width="10" transform="rotate(18 326 262)"/>
  <g fill="${NAVY}"><circle cx="170" cy="272" r="5"/><circle cx="188" cy="266" r="5"/><circle cx="206" cy="258" r="5"/><circle cx="306" cy="258" r="5"/><circle cx="324" cy="266" r="5"/><circle cx="342" cy="272" r="5"/></g>
`);

// ── 4. Wordmark: POLAR / W(globe with bear ears)RLD — text converted to outlines ──
const font = opentype.parse(fs.readFileSync(require.resolve("@fontsource/fredoka/files/fredoka-latin-700-normal.woff")).buffer);
function word(text, x, y, size, fill) {
  const p = font.getPath(text, x, y, size);
  p.fill = fill;
  return { d: p.toPathData(1), w: font.getAdvanceWidth(text, size) };
}
function wordmark(ink = NAVY, inner = ICE) {
  const size = 132;
  const polar = word("POLAR", 0, 0, size);
  const w = word("W", 0, 0, size), rld = word("RLD", 0, 0, size);
  const gR = 46; // globe radius standing in for the O
  const gap = 8;
  const line2 = w.w + gap + gR * 2 + gap + rld.w;
  const x1 = 256 - polar.w / 2, x2 = 256 - line2 / 2;
  const y1 = 222, y2 = 372;
  const P = word("POLAR", x1, y1, size).d;
  const W = word("W", x2, y2, size).d;
  const gx = x2 + w.w + gap + gR, gy = y2 - 46;
  const R = word("RLD", gx + gR + gap, y2, size).d;
  return svg(`
  <path d="${P}" fill="${ink}"/>
  <path d="${W}" fill="${ink}"/>
  <path d="${R}" fill="${ink}"/>
  <circle cx="${gx - 32}" cy="${gy - 40}" r="17" fill="${ink}"/><circle cx="${gx + 32}" cy="${gy - 40}" r="17" fill="${ink}"/>
  <circle cx="${gx - 32}" cy="${gy - 40}" r="7" fill="${OCEAN}"/><circle cx="${gx + 32}" cy="${gy - 40}" r="7" fill="${OCEAN}"/>
  <circle cx="${gx}" cy="${gy}" r="${gR}" fill="${OCEAN}" stroke="${ink}" stroke-width="9"/>
  ${globeLines(gx, gy, gR - 4, "g4", { opacity: 0.55, w: 4 })}
  <ellipse cx="${gx}" cy="${gy + 14}" rx="20" ry="14" fill="${WHITE}"/>
  <path d="M${gx - 8} ${gy + 8} Q${gx} ${gy + 4} ${gx + 8} ${gy + 8} Q${gx + 7} ${gy + 15} ${gx} ${gy + 16} Q${gx - 7} ${gy + 15} ${gx - 8} ${gy + 8}Z" fill="${NAVY}"/>
  <circle cx="${gx - 17}" cy="${gy - 10}" r="5.5" fill="${NAVY}"/><circle cx="${gx + 17}" cy="${gy - 10}" r="5.5" fill="${NAVY}"/>
`);
}
const c4 = wordmark();
const c4w = wordmark(WHITE).replace(/(<svg[^>]*>)/, `$1<rect width="512" height="512" rx="120" fill="${NAVY}"/>`);

const out = process.argv[2] || ".";
const files = { "1-on-top-of-the-world.svg": c1, "2-bear-head-globe.svg": c2, "3-bear-hug.svg": c3, "4-wordmark.svg": c4, "4b-wordmark-on-dark.svg": c4w };
for (const [n, s] of Object.entries(files)) fs.writeFileSync(`${out}/${n}`, s);
console.log(Object.keys(files).join("\n"));
