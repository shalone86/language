// Skit Stocks icon: the Polar World bear-hug bear, hugging a ball with a rising stock chart
// instead of the globe. Reads design/polar-world/3-bear-hug.svg and swaps the globe (lines 10–17).
//   node icon.cjs   → writes icon.svg, icon-maskable.svg here and ../public/icon.svg
const fs = require("fs");
const src = fs.readFileSync(`${__dirname}/../../design/polar-world/3-bear-hug.svg`, "utf8").split("\n");
const NAVY = "#1b2a4a", GREEN = "#22c55e", RED = "#f87171", BALL = "#1f3a66";

// Candles rising left to right inside the ball (centre 256,372, radius 134; the paws cover the top).
const candles = [
  [176, 432, 404, false], [204, 418, 388, true], [232, 424, 398, false], [260, 398, 362, true],
  [288, 384, 350, true], [316, 362, 322, true],
];
const chart = `
  <circle cx="256" cy="372" r="134" fill="${BALL}" stroke="${NAVY}" stroke-width="10"/>
  <clipPath id="ball"><circle cx="256" cy="372" r="129"/></clipPath>
  <g clip-path="url(#ball)">
    <g stroke="#ffffff" stroke-opacity="0.12" stroke-width="4"><path d="M120 330 H392 M120 380 H392 M120 430 H392"/></g>
    ${candles.map(([x, a, b, up]) => {
      const top = Math.min(a, b), h = Math.abs(a - b);
      return `<g fill="${up ? GREEN : RED}" stroke="${up ? GREEN : RED}"><path d="M${x} ${top - 14} V${top + h + 14}" stroke-width="5" stroke-linecap="round"/><rect x="${x - 10}" y="${top}" width="20" height="${h}" rx="4" stroke="none"/></g>`;
    }).join("\n    ")}
    <path d="M150 462 L196 430 L232 438 L270 396 L300 384 L352 334" fill="none" stroke="#ffffff" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M326 330 L356 330 L356 360" fill="none" stroke="#ffffff" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>
  </g>`;
const lines = [...src.slice(0, 9), chart, ...src.slice(17)];
const hug = lines.join("\n");
fs.writeFileSync(`${__dirname}/bear-hug-chart.svg`, hug);

// App tile and maskable versions, same placement as the Skit Spanish icon.
const ICE = "#e8f6fd";
const art = hug.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "").replace(/<rect [^>]*rx="120"[^>]*\/>/, "");
const place = (scale) => `<g transform="translate(256 256) scale(${scale}) translate(-256 -297)">${art}</g>`;
const tile = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512"><rect width="512" height="512" rx="112" fill="${ICE}"/>${place(0.86)}</svg>\n`;
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512"><rect width="512" height="512" fill="${ICE}"/>${place(0.74)}</svg>\n`;
fs.writeFileSync(`${__dirname}/icon.svg`, tile);
fs.writeFileSync(`${__dirname}/icon-maskable.svg`, maskable);
fs.writeFileSync(`${__dirname}/../public/icon.svg`, tile);
console.log("wrote icon.svg, icon-maskable.svg, public/icon.svg");
