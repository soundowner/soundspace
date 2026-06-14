# Project: SoundSpace Player & Marker Upgrade

## Architecture
- Static Gateway Frontend: `qobuz-data-gateway/src/main/resources/static/`
  - `index.html`: UI structure, player panel container, SVG timebar waveform, overlay panels.
  - `style.css`: Styles for the panels, typography, layout, glassmorphic effects, OKLCH colors.
  - `script.js`: State management (`playerState`, `libraryState`), playback logic, cut marker handling.

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|---|---|---|---|
| 1 | Exploration & Test Suite Plan | Analyze codebase and establish test framework/plan | None | DONE |
| 2 | E2E Testing Track | Write comprehensive E2E tests, publish TEST_READY.md | M1 | IN_PROGRESS |
| 3 | UI/UX Player Panel Redesign | Implement premium editorial layout, glassmorphic card, Outfit/Inter typography | M1 | PLANNED |
| 4 | Advanced Cut Marker Feature | Interactive drag-and-drop, microscope waveform zoom, preview play, manual input | M3 | PLANNED |
| 5 | final Integration & Verification | E2E test verification, adversarial coverage hardening | M2, M4 | PLANNED |

## Interface Contracts
### Player UI ↔ Library/Artist/Album Overlays
- Clicking artist name/label triggers `openOverlay('artist-panel')` and populates overlay content.
- Clicking album name/label triggers `openOverlay('album-panel')` and populates overlay content.

### Cut Marker Logic & State
- `cutMarkersByTrack`: Map of `trackId (string)` -> Array of markers.
- `localStorage` key: `ss_cut_markers`
- Markers must be updated dynamically on drag-and-drop or manual time input.

## Code Layout
- `qobuz-data-gateway/src/main/resources/static/index.html` - HTML file
- `qobuz-data-gateway/src/main/resources/static/style.css` - CSS file
- `qobuz-data-gateway/src/main/resources/static/script.js` - JS file
