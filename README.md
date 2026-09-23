# SAMFIP — 3D Portfolio

Live at https://samfip1.github.io. Built on an MIT-licensed 3D portfolio template (see `LICENSE`).

```bash
npm install
npm run dev
```

## Regenerating textures

| What | Script | Content lives in |
|------|--------|------------------|
| Gallery card fronts | `node scripts/make_project_cards.js` | `CARDS` in the script |
| Nimsdai painting (corridor frame) | `node scripts/make_nims_painting.js [photo]` | defaults to `../nims.jpg`; placeholder mountain if missing |
| Logo-free skill balloons | `node scripts/make_blank_balloons.js` | `OUTPUTS` in the script |
| Journey islands without lettering | `node scripts/blank_island_letters.js` | — |

Content that isn't generated: gallery projects (`GalleryRoom.jsx` → `FALLBACK_PROJECTS`), awards / balloons / journey
(`About/InfiniteSkyManager.jsx`), contact barrels (`Contact/ContactRoom.jsx`), corridor frames (`corridor/CorridorDecorations.jsx`).

## Credits

- Nimsdai photo (`../nims.jpg`, used in the corridor painting): Nirmal Purja by Iamthanes,
  [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), via
  [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:NIRMAL_PURJA_%22NIMS%22.jpg).
