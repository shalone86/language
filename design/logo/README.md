# Logo

A polar bear in sunglasses, lounging in a striped beach chair under a beach umbrella, sitting up in it with a drink. The chair sits on the polar ice cap at the top of the globe (the North Pole is on top, and the umbrella pole is striped like a pole marker), out in space (stars, nebula, a ringed planet). It's based on Polar World's logo, in the app's colors.

- `make.py` draws it. Every shape is plain SVG in that file: change a color or a coordinate there, not in the SVGs.
- `logo.svg` is the rounded app tile (also used as `public/icon.svg`).
- `maskable.svg` is the full-bleed version with the art inside the middle 80%, for Android icons that get cropped to a circle or another shape.

Re-export after a change:

```bash
cd design/logo
python3 make.py                      # writes logo.svg and maskable.svg
cp logo.svg ../../public/icon.svg
# PNGs: open each SVG in a browser and save, or render them with any SVG tool, at:
#   public/icons/icon-192.png, icon-512.png            (from logo.svg)
#   public/icons/maskable-192.png, maskable-512.png    (from maskable.svg)
#   public/apple-touch-icon.png  180×180               (from maskable.svg; iOS rounds the corners itself)
```

Then bump `VERSION` in `public/sw.js` so installed copies pick up the new icon.
