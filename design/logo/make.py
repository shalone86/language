# Draws the Skit Spanish / Polar World logo: a polar bear in a beach chair under an umbrella, on a globe.
import math, sys
INK = "#24304a"
def wedges(n, r, apex_y, stripes):
    out = []
    for k in range(n):
        x0 = -r*1.4 + k*(2.8*r/n); x1 = x0 + 2.8*r/n
        out.append(f'<path d="M0 {apex_y} L{x0:.1f} 40 L{x1:.1f} 40Z" fill="{stripes[k%len(stripes)]}"/>')
    return "\n".join(out)
def scallop_edge(r, n):
    # bottom edge from +r back to -r with n scallops
    d = ""
    step = 2*r/n
    for k in range(n):
        x0 = r - k*step; x1 = x0 - step
        d += f" Q{(x0+x1)/2:.1f} 26 {x1:.1f} 0"
    return d
def stars(n=46, seed=7):
    import random
    rnd = random.Random(seed)
    out = []
    for _ in range(n):
        x, y = rnd.uniform(14, 498), rnd.uniform(14, 400)
        r = rnd.choice([1.4, 1.8, 2.2, 3])
        out.append(f'<circle cx="{x:.0f}" cy="{y:.0f}" r="{r}" fill="#ffffff" opacity="{rnd.uniform(0.5, 1):.2f}"/>')
    for x, y in [(70, 70), (300, 40), (470, 330), (40, 380)]:  # a few twinkles
        out.append(f'<path d="M{x} {y-11} L{x+3} {y-3} L{x+11} {y} L{x+3} {y+3} L{x} {y+11} L{x-3} {y+3} L{x-11} {y} L{x-3} {y-3}Z" fill="#fff6d6"/>')
    return "\n    ".join(out)

def svg(bg=True, size=512, maskable=False):
    R = 108
    canopy = f"M{-R} 0 A{R} 104 0 0 1 {R} 0" + scallop_edge(R, 6) + "Z"
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="{size}" height="{size}">
  <defs>
    <radialGradient id="sky" cx="0.3" cy="0.25" r="0.95"><stop offset="0" stop-color="#2b1b6b"/><stop offset="0.55" stop-color="#150f3d"/><stop offset="1" stop-color="#070a1f"/></radialGradient>
    <radialGradient id="nebula1" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#e4007c" stop-opacity="0.55"/><stop offset="1" stop-color="#e4007c" stop-opacity="0"/></radialGradient>
    <radialGradient id="nebula2" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#00c2d1" stop-opacity="0.45"/><stop offset="1" stop-color="#00c2d1" stop-opacity="0"/></radialGradient>
    <radialGradient id="glow" cx="0.5" cy="0.5" r="0.5"><stop offset="0.86" stop-color="#7fdcff" stop-opacity="0.55"/><stop offset="1" stop-color="#7fdcff" stop-opacity="0"/></radialGradient>
    <linearGradient id="sea" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2bb3e8"/><stop offset="1" stop-color="#1468b8"/></linearGradient>
    <clipPath id="tile"><rect width="512" height="512" rx="112"/></clipPath>
    <clipPath id="globe"><circle cx="256" cy="640" r="262"/></clipPath>
    <pattern id="stripes" width="22" height="22" patternUnits="userSpaceOnUse" patternTransform="rotate(60)"><rect width="22" height="22" fill="#00b3a7"/><rect width="11" height="22" fill="#ffffff"/></pattern>
    <clipPath id="canopy"><path d="{canopy}"/></clipPath>
  </defs>
  {'<rect width="512" height="512" fill="url(#sky)"/>' if maskable else ''}
  <g {'transform="translate(51.2 51.2) scale(0.8)"' if maskable else 'clip-path="url(#tile)"'}>
    {'<rect width="512" height="512" rx="112" fill="url(#sky)"/>' if bg and not maskable else ''}
    <ellipse cx="120" cy="150" rx="190" ry="120" fill="url(#nebula1)"/>
    <ellipse cx="420" cy="250" rx="170" ry="130" fill="url(#nebula2)"/>
    {stars()}
    <!-- ringed planet -->
    <g transform="translate(410 104) rotate(-18)">
      <ellipse cx="0" cy="0" rx="64" ry="16" fill="none" stroke="#ffd166" stroke-width="7" opacity="0.9"/>
      <circle cx="0" cy="0" r="30" fill="#ffb703"/>
      <path d="M-30 0 A30 30 0 0 0 30 0" fill="#f28c28"/>
      <path d="M-64 0 A64 16 0 0 0 64 0" fill="none" stroke="#ffd166" stroke-width="7"/>
    </g>
    <!-- shooting star -->
    <path d="M60 300 L120 268" stroke="#ffffff" stroke-width="4" stroke-linecap="round" opacity="0.7"/>
    <circle cx="122" cy="267" r="5" fill="#ffffff"/>
    <!-- globe, seen with the North Pole on top: ice cap, then the northern continents around it -->
    <circle cx="256" cy="640" r="300" fill="url(#glow)"/>
    <circle cx="256" cy="640" r="262" fill="url(#sea)" stroke="#bfefff" stroke-width="6"/>
    <g clip-path="url(#globe)">
      <!-- land around the Arctic: North America (left), Europe and Asia (right) -->
      <path d="M-10 500 C10 452 60 430 104 436 C140 440 150 462 128 478 C150 486 160 506 140 520 L-10 540Z" fill="#3fbf7f"/>
      <path d="M352 440 C392 424 452 436 492 470 C512 488 520 510 522 540 L380 540 C392 512 356 500 340 474 C334 460 340 446 352 440Z" fill="#3fbf7f"/>
      <path d="M236 498 C262 488 296 494 300 512 L292 540 L232 540Z" fill="#3fbf7f"/>
      <!-- lines of latitude circling the pole, and meridians meeting at it -->
      <ellipse cx="256" cy="452" rx="168" ry="44" fill="none" stroke="#ffffff" stroke-opacity="0.35" stroke-width="4"/>
      <ellipse cx="256" cy="506" rx="226" ry="60" fill="none" stroke="#ffffff" stroke-opacity="0.35" stroke-width="4"/>
      <g stroke="#ffffff" stroke-opacity="0.3" stroke-width="4" fill="none">
        <path d="M256 392 L256 540"/><path d="M256 392 Q150 430 70 540"/><path d="M256 392 Q362 430 442 540"/>
        <path d="M256 392 Q60 400 -20 470"/><path d="M256 392 Q452 400 532 470"/>
      </g>
      <!-- the polar ice cap -->
      <path d="M96 420 C120 372 392 372 416 420 C424 438 396 430 380 440 C360 452 340 434 316 446 C292 458 268 440 244 450 C220 460 200 440 176 448 C152 456 132 436 112 440 C100 442 92 432 96 420Z" fill="#ffffff"/>
      <path d="M150 414 C200 400 312 400 362 414" fill="none" stroke="#cfe9f7" stroke-width="5" stroke-linecap="round"/>
      <!-- Greenland, still icy -->
      <path d="M170 462 C190 452 214 460 210 478 C206 494 184 496 174 484Z" fill="#ffffff"/>
    </g>
    <!-- umbrella pole (behind): striped like a North Pole marker -->
    <path d="M156 398 L216 114" stroke="#ffffff" stroke-width="12" stroke-linecap="round"/>
    <path d="M156 398 L216 114" stroke="#e4007c" stroke-width="12" stroke-dasharray="16 16" stroke-dashoffset="8"/>
    <!-- umbrella canopy -->
    <g transform="translate(216 114) rotate(10)">
      <g clip-path="url(#canopy)">{wedges(6, R, -118, ["#e4007c", "#ffffff"])}</g>
      <path d="{canopy}" fill="none" stroke="#ffffff" stroke-width="7" stroke-linejoin="round"/>
      <circle cx="0" cy="-108" r="9" fill="#f3e7d3"/>
    </g>
    <!-- chair frame: crossed legs and an armrest -->
    <g stroke="#d9a066" stroke-width="11" stroke-linecap="round">
      <path d="M180 192 L296 384"/>
      <path d="M340 322 L212 384"/>
    </g>
    <!-- chair fabric: an upright back and a flat seat, striped -->
    <path d="M170 186 L214 340 L340 330 L338 310 L244 314 L204 178Z" fill="url(#stripes)" stroke="{INK}" stroke-width="8" stroke-linejoin="round"/>
    <!-- bear, sitting up: torso upright, thighs on the seat, shins hanging over the front -->
    <g stroke="{INK}" stroke-width="8" stroke-linejoin="round">
      <circle cx="224" cy="174" r="15" fill="#ffffff"/>
      <circle cx="264" cy="164" r="15" fill="#ffffff"/>
      <ellipse cx="262" cy="276" rx="46" ry="58" transform="rotate(-8 262 276)" fill="#ffffff"/>
      <ellipse cx="362" cy="350" rx="18" ry="34" transform="rotate(-12 362 350)" fill="#ffffff"/>
      <ellipse cx="378" cy="382" rx="24" ry="13" transform="rotate(-6 378 382)" fill="#ffffff"/>
      <ellipse cx="314" cy="314" rx="50" ry="22" transform="rotate(4 314 314)" fill="#ffffff"/>
      <circle cx="248" cy="206" r="44" fill="#ffffff"/>
      <ellipse cx="284" cy="222" rx="24" ry="17" transform="rotate(10 284 222)" fill="#ffffff"/>
      <ellipse cx="298" cy="270" rx="34" ry="13" transform="rotate(6 298 270)" fill="#f1f5f9"/>
    </g>
    <circle cx="224" cy="174" r="6" fill="#ffb3c7"/>
    <circle cx="264" cy="164" r="6" fill="#ffb3c7"/>
    <circle cx="305" cy="219" r="8" fill="{INK}"/>
    <path d="M280 236 Q288 244 298 238" fill="none" stroke="{INK}" stroke-width="5" stroke-linecap="round"/>
    <path d="M366 386 h1 M378 388 h1 M390 386 h1" stroke="{INK}" stroke-width="5" stroke-linecap="round"/>
    <!-- sunglasses -->
    <path d="M224 194 L288 190" stroke="{INK}" stroke-width="6" stroke-linecap="round"/>
    <rect x="229" y="190" width="24" height="17" rx="7" fill="{INK}"/>
    <rect x="262" y="187" width="24" height="17" rx="7" fill="{INK}"/>
    <!-- drink -->
    <path d="M322 240 L344 240 L340 270 L326 270Z" fill="#00c2b8" stroke="{INK}" stroke-width="6" stroke-linejoin="round"/>
    <path d="M336 240 L344 218" stroke="{INK}" stroke-width="5" stroke-linecap="round"/>
  </g>
</svg>'''
open("logo.svg", "w").write(svg())
open("maskable.svg", "w").write(svg(maskable=True))
