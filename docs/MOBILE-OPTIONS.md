---
source: claude
date: 2026-11-02
status: draft
summary: What Beeline can do on phones and tablets: the easy options, the medium ones, and what to leave for a later release. Things marked (check) were not verified yet.
---
# Beeline on mobile: options

## The core problem
Beeline today is a **browser extension that replaces the New Tab page**. Phone browsers mostly do not allow that:
- Chrome and Brave on Android: no extensions. Safari on iPhone: extensions exist but cannot replace the new tab page. Firefox for Android: supports some extensions, but a "new tab override" is probably not among them (check).
So on a phone Beeline cannot be "the new tab". It has to be a **web page or app** that you open from the home screen. The good news: the screens, logic and storage are plain React and IndexedDB, and the narrow layout already exists (sidebar drawer), so most code can be reused.

## Options, easiest first

| # | Option | What you get | Effort | Limits |
|---|---|---|---|---|
| 1 | **"Export as web page"** (a single self-contained HTML file) | Button in Import / Export: downloads `beeline.html` with all your tiles, groups, search and Preferred. Put it anywhere (cloud drive, your server, GitHub Pages) and open it on the phone; "Add to Home Screen" makes an icon. | Small (about 1 day). | Read-only: you cannot edit on the phone. You re-export after changes. Fine for a launcher. |
| 2 | **Beeline Web (PWA)**: the same app built as a normal website | Installable from the browser ("Add to Home Screen"), works offline, add, edit, reorder, hide, search. Data lives in the phone's browser storage. First load of your data through **Import backup**. | Medium (about 3 to 5 days): a third build target `web`, replace the extension-only parts (favicon cache, browser bookmark import, opening `chrome://` pages, sync file handle) by web versions or hide them, fix the phone top bar, test on Android and iPhone. | Data is separate from the desktop copy until you import again. iPhone may clear storage of sites you do not use for a while (check; installing it to the Home Screen helps). Needs a place to host it (GitHub Pages is enough). |
| 3 | **Add from the phone** (share sheet) | In the installed PWA on Android, "Share" from any page to Beeline adds a bookmark. | Small once option 2 exists (a manifest `share_target`). | Android Chrome yes; iPhone Safari does not support this (check). |
| 4 | **Sync with the desktop** | The phone copy follows the desktop. | Medium to large, depends on the way (below). | The file-link sync we use on desktop (File System Access API) does not exist on phones. |
| 5 | **Native apps** (Android APK, iOS app) wrapping the web app (for example Capacitor) | Home-screen widgets, better storage, store listing. | Large. Android is easy to try; iOS needs a paid developer account and App Store review. | Maintenance of three platforms. Leave for a later release. |

## Sync ways for option 4 (pick one later)
1. **Manual**: Download backup on the desktop, import on the phone (and back). Works today with option 2, no extra work, a bit tedious.
2. **Your own small server (WebDAV or a tiny HTTP endpoint)**: both sides read and write the same sync file over the network. Good for you (home lab) and for tech users, because nothing goes to a third party. Medium effort, optional setting.
3. **Cloud drive API (Google Drive, Dropbox, OneDrive)**: nicest for ordinary users, but needs an app registration with each provider, OAuth sign-in, and a privacy review. Large; probably a later release.
4. **Share as link or QR code** for a small collection (one-way, no account). Small, fun, not real sync.

## Recommendation
1. **Now (this release cycle):** option 1 "Export as web page". It answers "I want my bookmarks on my phone" with the least work and no new risk, and it is a good feature on its own (also useful on a public computer).
2. **Next:** option 2 "Beeline Web", with manual import, then option 3 (share sheet) on Android.
3. **Later:** sync way 2 (your own server) as an optional setting; sync way 3 and native apps only if people ask for them.
4. **Before any of it:** fix the phone-width top bar (it wraps onto three rows) and make touch targets 44 px. This helps the desktop extension in small windows too and is also on the Stitch feedback list.

## Decisions needed from Ros
- Is read-only on the phone (option 1) good enough as a first step, or do you want to edit on the phone from day one (option 2)?
- Where would the web version live? GitHub Pages (free, public, static) is the simplest; your own server is possible for private use.
- iPhone, Android, or both? (Testing both is more work; Android first is easier.)
