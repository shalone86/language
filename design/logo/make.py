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
def svg(bg=True, size=512, maskable=False):
    R = 108
    canopy = f"M{-R} 0 A{R} 104 0 0 1 {R} 0" + scallop_edge(R, 6) + "Z"
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="{size}" height="{size}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd166"/><stop offset="0.55" stop-color="#ffb3c7"/><stop offset="1" stop-color="#ff8fb1"/></linearGradient>
    <linearGradient id="sea" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2bb3e8"/><stop offset="1" stop-color="#1468b8"/></linearGradient>
    <clipPath id="tile"><rect width="512" height="512" rx="112"/></clipPath>
    <clipPath id="globe"><circle cx="256" cy="640" r="262"/></clipPath>
    <pattern id="stripes" width="22" height="22" patternUnits="userSpaceOnUse" patternTransform="rotate(60)"><rect width="22" height="22" fill="#00b3a7"/><rect width="11" height="22" fill="#ffffff"/></pattern>
    <clipPath id="canopy"><path d="{canopy}"/></clipPath>
  </defs>
  {'<rect width="512" height="512" fill="url(#sky)"/>' if maskable else ''}
  <g {'transform="translate(51.2 51.2) scale(0.8)"' if maskable else 'clip-path="url(#tile)"'}>
    {'<rect width="512" height="512" rx="112" fill="url(#sky)"/>' if bg and not maskable else ''}
    <circle cx="408" cy="104" r="42" fill="#fff6d6"/>
    <g stroke="#fff6d6" stroke-width="8" stroke-linecap="round" opacity="0.8"><path d="M408 42 v-14"/><path d="M466 104 h14"/><path d="M450 62 l10 -10"/><path d="M450 146 l10 10"/></g>
    <!-- globe -->
    <circle cx="256" cy="640" r="262" fill="url(#sea)" stroke="{INK}" stroke-width="10"/>
    <g clip-path="url(#globe)">
      <path d="M40 470 C80 420 150 410 170 440 C190 470 150 500 175 530 L60 560Z" fill="#3fbf7f"/>
      <path d="M300 395 C350 380 420 400 440 440 C455 470 410 470 400 500 C390 530 330 520 320 480 C310 450 280 430 300 395Z" fill="#3fbf7f"/>
      <path d="M200 520 C230 505 260 515 255 545 L210 560Z" fill="#3fbf7f"/>
      <ellipse cx="256" cy="640" rx="262" ry="190" fill="none" stroke="#ffffff" stroke-opacity="0.35" stroke-width="5"/>
      <ellipse cx="256" cy="640" rx="140" ry="262" fill="none" stroke="#ffffff" stroke-opacity="0.35" stroke-width="5"/>
    </g>
    <!-- umbrella pole (behind) -->
    <path d="M150 392 L214 128" stroke="{INK}" stroke-width="10" stroke-linecap="round"/>
    <!-- umbrella canopy -->
    <g transform="translate(222 124) rotate(14)">
      <g clip-path="url(#canopy)">{wedges(6, R, -118, ["#e4007c", "#ffffff"])}</g>
      <path d="{canopy}" fill="none" stroke="{INK}" stroke-width="9" stroke-linejoin="round"/>
      <circle cx="0" cy="-108" r="9" fill="{INK}"/>
    </g>
    <!-- chair frame -->
    <g stroke="#8a5a2b" stroke-width="11" stroke-linecap="round">
      <path d="M166 226 L268 382"/>
      <path d="M332 330 L222 382"/>
      <path d="M226 342 L338 332"/>
    </g>
    <!-- chair fabric: backrest + seat, striped -->
    <path d="M160 222 L226 340 L334 330 L328 308 L240 314 L186 214Z" fill="url(#stripes)" stroke="{INK}" stroke-width="8" stroke-linejoin="round"/>
    <!-- bear -->
    <g stroke="{INK}" stroke-width="8" stroke-linejoin="round">
      <ellipse cx="270" cy="296" rx="66" ry="44" transform="rotate(-18 270 296)" fill="#ffffff"/>
      <ellipse cx="338" cy="300" rx="44" ry="20" transform="rotate(-6 338 300)" fill="#ffffff"/>
      <circle cx="377" cy="296" r="15" fill="#ffffff"/>
      <circle cx="198" cy="186" r="15" fill="#ffffff"/>
      <circle cx="238" cy="176" r="15" fill="#ffffff"/>
      <circle cx="222" cy="218" r="44" fill="#ffffff"/>
      <ellipse cx="258" cy="234" rx="24" ry="17" transform="rotate(10 258 234)" fill="#ffffff"/>
      <ellipse cx="282" cy="292" rx="34" ry="13" transform="rotate(-24 282 292)" fill="#f1f5f9"/>
    </g>
    <circle cx="198" cy="186" r="6" fill="#ffb3c7"/>
    <circle cx="238" cy="176" r="6" fill="#ffb3c7"/>
    <circle cx="279" cy="231" r="8" fill="{INK}"/>
    <path d="M254 248 Q262 256 272 250" fill="none" stroke="{INK}" stroke-width="5" stroke-linecap="round"/>
    <!-- sunglasses -->
    <path d="M198 206 L262 202" stroke="{INK}" stroke-width="6" stroke-linecap="round"/>
    <rect x="203" y="202" width="24" height="17" rx="7" fill="{INK}"/>
    <rect x="236" y="199" width="24" height="17" rx="7" fill="{INK}"/>
    <!-- drink -->
    <path d="M304 262 L326 262 L322 290 L308 290Z" fill="#00c2b8" stroke="{INK}" stroke-width="6" stroke-linejoin="round"/>
    <path d="M318 262 L326 240" stroke="{INK}" stroke-width="5" stroke-linecap="round"/>
  </g>
</svg>'''
open("logo.svg", "w").write(svg())
open("maskable.svg", "w").write(svg(maskable=True))
