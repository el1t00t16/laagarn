# LAAGARN GPS

Offline-first Philippine navigation, route planning, convoy coordination, corridor weather predictor, and watermarked dashcam system.

## Visual & Theme Contract

- **Preserved Purple Identity**:
  - **Dark**: `#090410` ground, `rgba(20, 10, 35, 0.85)` elevated glass, `#a855f7` primary violet, `#c084fc` lavender highlight, `#7e22ce` deep accent, `#f8f6fc` primary ink.
  - **AMOLED**: `#000000` pure black ground, `#090412` surface, `#c084fc` primary accent, `#ffffff` ink.
  - **Light**: `#f8f6fc` soft lavender-tinted ground, `rgba(255, 255, 255, 0.94)` elevated surface, `#9333ea` primary violet, `#140727` deep ink.
- **Typography**:
  - `Manrope` for operational headings, labels, cards, controls, and actions.
  - `JetBrains Mono` (`tabular-nums`) reserved for telemetry (speed `KM/H`, coordinates, timestamps, ETAs, distances, gradients, room codes).
- **Iconography**: Uniform Lucide vector icons across panels, navigation tabs, and map pins (no raw emoji glyphs inside UI controls).

## Layout & Anti-Overlap Contract

- **Responsive Workspace Split**:
  - **Desktop (`>= 1024px`)**: Full-bleed interactive Philippines map with a floating glass left command rail (`404px`) housing brand navigation, quick search, 6-module tab switcher, and active operational workspace. Map controls (`Locate`, `Pan`, `Driving HUD`, `GPS Pill`) clear the sidebar gutter cleanly.
  - **Mobile (`< 1024px`)**: Edge-to-edge map viewport with swipeable 3-stage bottom sheet (`peek` / `half` / `full`) anchored above the 6-tab dock. Quick map controls fade/tuck cleanly whenever the sheet expands past `peek`.
- **Smart Map Label Declutter**: Dense city POIs and traffic signals stay clean icons at regional zoom levels and run screen-space bounding-box decluttering on pan/zoom so labels never overlap.
- **Dashcam Watermark & HUD Parity**: Bottom-docked purple glass telemetry card computes container height, divider padding, row baselines, and horizontal brand-vs-timestamp clipping budget dynamically so speed, road name, timestamp, and coordinates never collide at any resolution (`240x426` through `4K`).
