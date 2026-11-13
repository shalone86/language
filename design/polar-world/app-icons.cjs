// Builds the Skit Spanish app icons from the bear-hug concept (3-bear-hug.svg).
//   node app-icons.cjs   → writes ../../public/icon.svg and app-icon-maskable.svg here
// The art (ears to the bottom of the globe) is scaled to sit centred with room to breathe:
// in the rounded tile, and inside the 80% safe circle for Android's cropped (maskable) icons.
const fs = require("fs");
const src = fs.readFileSync(`${__dirname}/3-bear-hug.svg`, "utf8");
const ICE = "#e8f6fd";
const art = src.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "").replace(/<rect [^>]*rx="120"[^>]*\/>/, "");
const ART_CY = 297; // vertical middle of the art (ears at 84, globe bottom at 511)
const place = (scale) => `<g transform="translate(256 256) scale(${scale}) translate(-256 -${ART_CY})">${art}</g>`;
const tile = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512"><rect width="512" height="512" rx="112" fill="${ICE}"/>${place(0.86)}</svg>\n`;
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512"><rect width="512" height="512" fill="${ICE}"/>${place(0.74)}</svg>\n`;
fs.writeFileSync(`${__dirname}/app-icon.svg`, tile);
fs.writeFileSync(`${__dirname}/app-icon-maskable.svg`, maskable);
fs.writeFileSync(`${__dirname}/../../public/icon.svg`, tile);
console.log("wrote app-icon.svg, app-icon-maskable.svg, public/icon.svg");
