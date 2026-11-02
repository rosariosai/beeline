---
source: claude
date: 2026-10-30
status: draft
---
# Firefox manual test checklist (10 minutes)

Why this exists: Firefox could not be run where Tilenest was built. The Firefox build passes Mozilla's linter (web-ext, 0 errors) and the same automated tests pass when that exact build runs in Chromium, but only a real Firefox can confirm the rest. Install it first (INSTALL.md, Firefox section), then tick each line. Note anything that fails and send it to me.

- [ ] New tab shows Tilenest (accept "Keep Changes" if asked).
- [ ] Add a bookmark; reload the page (F5); it is still there.
- [ ] Tiles show coloured letters (no site icons is expected in Firefox).
- [ ] Upload an image as an icon, crop it, save; it survives reload.
- [ ] Drag a tile to another group; also try keyboard (Space, arrows, Space).
- [ ] Press `/` then type: results appear, arrows + Enter open a site. Try Ctrl+K (Firefox may use it for its own search; `/` is the reliable key).
- [ ] Import / Export → "Import my browser bookmarks": a permission prompt appears; Allow; folders listed; import works.
- [ ] Export backup (.json) and HTML; import the JSON back (merge).
- [ ] Settings: Dark, Large tiles, Compact, "Open in a new tab" all apply and persist after restart of the page.
- [ ] Open a dialog (Add) and press Esc: it closes, focus returns.
- [x] Calendar sync (⟳ Sync with `<your-server>:8420`) connects and syncs, extension 0.3.5 or newer (verified 28 Oct 2026; current build 0.5.5).
- [ ] Optional: Windows high-contrast mode or Firefox's "Override colors" still shows tiles and focus outlines.
