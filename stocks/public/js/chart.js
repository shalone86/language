// Generated price charts for the chart skits: candles or a line, moving averages, RSI, levels,
// and turning a tap into "which candle / what price". Pure functions; renderChart returns SVG.

/** Small seeded random generator, so a chart looks the same every time. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Candles that follow a path of [index, price] anchors with a little noise.
 * Anchors are hit closely, so lessons can point at "the dip at candle 12" or "support at $40".
 */
export function makeSeries({ seed = 1, path, noise = 0.3 }) {
  const r = rng(seed);
  const n = path[path.length - 1][0] + 1;
  const closes = [];
  for (let i = 0; i < n; i++) {
    let k = 0;
    while (k < path.length - 2 && path[k + 1][0] <= i) k++;
    const [x0, y0] = path[k], [x1, y1] = path[k + 1];
    const base = y0 + ((y1 - y0) * (i - x0)) / Math.max(1, x1 - x0);
    const atAnchor = path.some(([x]) => x === i);
    closes.push(base + (r() - 0.5) * 2 * noise * (atAnchor ? 0.2 : 1));
  }
  return closes.map((c, i) => {
    const open = i ? closes[i - 1] + (r() - 0.5) * noise * 0.8 : c - noise;
    const high = Math.max(open, c) + r() * noise * 1.4;
    const low = Math.min(open, c) - r() * noise * 1.4;
    return { open, high, low, close: c };
  });
}

export function sma(values, n) {
  const out = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= n) sum -= values[i - n];
    if (i >= n - 1) out[i] = sum / n;
  }
  return out;
}

/** Wilder's RSI (14 by default). null until there's enough data. */
export function rsi(closes, period = 14) {
  const out = new Array(closes.length).fill(null);
  let gain = 0, loss = 0;
  for (let i = 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    const g = Math.max(d, 0), l = Math.max(-d, 0);
    if (i <= period) {
      gain += g; loss += l;
      if (i === period) { gain /= period; loss /= period; out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss); }
    } else {
      gain = (gain * (period - 1) + g) / period;
      loss = (loss * (period - 1) + l) / period;
      out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
    }
  }
  return out;
}

/** First index where the fast average crosses above the slow one, or -1. */
export function goldenCross(closes, fast = 50, slow = 200) {
  const a = sma(closes, fast), b = sma(closes, slow);
  for (let i = 1; i < closes.length; i++) {
    if (a[i - 1] != null && b[i - 1] != null && a[i - 1] <= b[i - 1] && a[i] > b[i]) return i;
  }
  return -1;
}

/** Indexes where RSI is above a level. */
export const rsiAbove = (closes, level = 70) => rsi(closes).flatMap((v, i) => (v != null && v > level ? [i] : []));

/** Is a tap (candle index, price) on the target? Targets use the full series' indexes. */
export function hitTarget(target, { index, price }, closes) {
  if (target.y) return price >= target.y[0] && price <= target.y[1];
  if (target.x === "goldencross") { const c = goldenCross(closes, 50, 200); return c >= 0 && Math.abs(index - c) <= 5; }
  if (target.x === "rsi70") { const hits = new Set(rsiAbove(closes, 70)); return hits.has(index) || hits.has(index - 1) || hits.has(index + 1); }
  if (Array.isArray(target.x)) return target.x.some(([a, b]) => index >= a && index <= b);
  return false;
}

/** Index ranges to shade when showing the answer. */
export function targetZones(target, closes) {
  if (target.x === "goldencross") { const c = goldenCross(closes, 50, 200); return c < 0 ? [] : [[c - 3, c + 3]]; }
  if (target.x === "rsi70") {
    const out = [];
    for (const i of rsiAbove(closes, 70)) { const last = out[out.length - 1]; if (last && i <= last[1] + 1) last[1] = i; else out.push([i, i]); }
    return out;
  }
  return Array.isArray(target.x) ? target.x : [];
}

const W = 360, PAD_L = 8, PAD_R = 40, TOP = 10, PRICE_H = 200;
const fmt = (v) => (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(v >= 10 ? 1 : 2));

/**
 * Draw a chart. spec: { seed, path, noise, style: "candle"|"line", ma: [50, 200], rsi: true,
 * levels: [{ y, label }], show: last N bars }. opts: { mark: {index, price, ok}, reveal: target }.
 * Returns { svg, map } where map(x, y in viewBox units) → { index, price }.
 */
export function renderChart(spec, opts = {}) {
  const series = makeSeries(spec);
  const closes = series.map((c) => c.close);
  const n = series.length;
  const show = Math.min(spec.show ?? n, n);
  const from = n - show;
  const vis = series.slice(from);
  const mas = (spec.ma ?? []).map((p) => ({ p, v: sma(closes, p).slice(from) }));
  const vals = vis.flatMap((c) => [c.high, c.low]).concat(...mas.map((m) => m.v.filter((v) => v != null)));
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const padY = (hi - lo) * 0.08; lo -= padY; hi += padY;
  const H = TOP + PRICE_H + (spec.rsi ? 78 : 0) + 18;
  const step = (W - PAD_L - PAD_R) / show;
  const X = (i) => PAD_L + (i - from + 0.5) * step;
  const Y = (p) => TOP + ((hi - p) / (hi - lo)) * PRICE_H;
  const parts = [];

  // grid + price labels
  for (let k = 0; k <= 4; k++) {
    const p = lo + ((hi - lo) * k) / 4, y = Y(p);
    parts.push(`<line class="grid" x1="${PAD_L}" x2="${W - PAD_R}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}"/><text class="axis" x="${W - PAD_R + 4}" y="${(y + 3.5).toFixed(1)}">$${fmt(p)}</text>`);
  }
  // answer zones
  if (opts.reveal) {
    if (opts.reveal.y) parts.push(`<rect class="zone" x="${PAD_L}" width="${W - PAD_L - PAD_R}" y="${Y(opts.reveal.y[1]).toFixed(1)}" height="${(Y(opts.reveal.y[0]) - Y(opts.reveal.y[1])).toFixed(1)}"/>`);
    for (const [a, b] of targetZones(opts.reveal, closes)) {
      const x0 = Math.max(PAD_L, X(a) - step / 2), x1 = Math.min(W - PAD_R, X(b) + step / 2);
      parts.push(`<rect class="zone" x="${x0.toFixed(1)}" width="${Math.max(2, x1 - x0).toFixed(1)}" y="${TOP}" height="${H - TOP - 18}"/>`);
    }
  }
  for (const l of spec.levels ?? []) {
    parts.push(`<line class="level" x1="${PAD_L}" x2="${W - PAD_R}" y1="${Y(l.y).toFixed(1)}" y2="${Y(l.y).toFixed(1)}"/>${l.label ? `<text class="level-label" x="${PAD_L + 4}" y="${(Y(l.y) - 4).toFixed(1)}">${l.label}</text>` : ""}`);
  }
  // price
  if (spec.style === "line") {
    parts.push(`<polyline class="price-line" points="${vis.map((c, k) => `${X(from + k).toFixed(1)},${Y(c.close).toFixed(1)}`).join(" ")}"/>`);
  } else {
    const bw = Math.max(1.5, step * 0.62);
    vis.forEach((c, k) => {
      const i = from + k, up = c.close >= c.open, x = X(i);
      const y0 = Y(Math.max(c.open, c.close)), y1 = Y(Math.min(c.open, c.close));
      parts.push(`<g class="${up ? "up" : "down"}"><line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${Y(c.high).toFixed(1)}" y2="${Y(c.low).toFixed(1)}"/><rect x="${(x - bw / 2).toFixed(1)}" y="${y0.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(1, y1 - y0).toFixed(1)}" rx="0.8"/></g>`);
    });
  }
  mas.forEach((m, k) => {
    const pts = m.v.map((v, j) => (v == null ? null : `${X(from + j).toFixed(1)},${Y(v).toFixed(1)}`)).filter(Boolean);
    if (pts.length) parts.push(`<polyline class="ma ma${k}" points="${pts.join(" ")}"/><text class="ma-label ma${k}" x="${PAD_L + 4 + k * 74}" y="${TOP + 12}">— ${m.p}-day</text>`);
  });
  // RSI panel
  if (spec.rsi) {
    const r = rsi(closes).slice(from), top = TOP + PRICE_H + 14, h = 58;
    const RY = (v) => top + ((100 - v) / 100) * h;
    parts.push(`<rect class="panel" x="${PAD_L}" y="${top}" width="${W - PAD_L - PAD_R}" height="${h}"/>`);
    for (const lv of [70, 30]) parts.push(`<line class="level" x1="${PAD_L}" x2="${W - PAD_R}" y1="${RY(lv)}" y2="${RY(lv)}"/><text class="axis" x="${W - PAD_R + 4}" y="${RY(lv) + 3.5}">${lv}</text>`);
    const pts = r.map((v, j) => (v == null ? null : `${X(from + j).toFixed(1)},${RY(v).toFixed(1)}`)).filter(Boolean);
    parts.push(`<polyline class="rsi-line" points="${pts.join(" ")}"/><text class="ma-label" x="${PAD_L + 4}" y="${top + 11}">RSI (14)</text>`);
  }
  if (opts.mark) parts.push(`<circle class="tap ${opts.mark.ok ? "ok" : "no"}" cx="${X(opts.mark.index).toFixed(1)}" cy="${Y(opts.mark.price).toFixed(1)}" r="6"/>`);

  const map = (x, y) => ({
    index: Math.max(from, Math.min(n - 1, Math.floor((x - PAD_L) / step) + from)),
    price: hi - ((y - TOP) / PRICE_H) * (hi - lo),
  });
  const svg = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Price chart">${parts.join("")}</svg>`;
  return { svg, map, closes, width: W, height: H };
}
