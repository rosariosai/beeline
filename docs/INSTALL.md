---
source: claude
date: 2026-11-01
status: draft
summary: How to install Beeline (v2.6.1) in Chrome, Brave and Firefox, how to update it, how to sync between browsers, and a tour of every feature.
tags: [tilenest, bookmarks, install, chrome, brave, firefox]
---
# Installing Beeline (formerly Tilenest Bookmarks)

Files you need are in the project folder (the project folder):

- `dist\chrome` : unpacked build for Chrome and Brave
- `dist\firefox` : unpacked build for Firefox
- `release\bookmarkonly-chrome.zip`, `release\bookmarkonly-firefox.zip` : the same builds as zip files (unzip them into a folder that you will not delete)

Keep the folder in a permanent place. The browser reads the extension from that folder every time it starts; if you move or delete the folder, the extension stops working.

## Chrome

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and choose the `dist\chrome` folder (the one that contains `manifest.json`).
4. Open a new tab. If Chrome asks whether to keep the changes to your New Tab page, choose **Keep it**.
5. Update later: replace the files in the folder with the new build, then on `chrome://extensions` click the circular **reload** button on the Beeline card.

If Chrome shows "Disable developer mode extensions" at start-up, choose **Cancel** (or keep the extension and ignore the prompt). That message is normal for unpacked extensions.

## Brave

1. Open `brave://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and choose the `dist\chrome` folder (Brave uses the Chrome build).
4. Open a new tab. If Brave's own New Tab page still appears, go to `brave://settings/newTab`, set **New Tab Page shows** to **Beeline** (or "Dashboard / extension" wording in your version).
5. Update later: same as Chrome (replace the files, click **reload** on `brave://extensions`).

## Firefox

Firefox only keeps unsigned extensions until you close it, unless you use one of the permanent options below.

**Quick way (temporary, good for testing)**

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on...** and select the file `manifest.json` inside `dist\firefox` (or the zip `bookmarkonly-firefox.zip`).
3. Open a new tab. The extension is removed when Firefox closes; repeat these steps after each restart.

**Permanent options**

- **Firefox Developer Edition, Nightly or ESR:** open `about:config`, set `xpinstall.signatures.required` to `false`, then install the zip from `about:addons` > gear icon > **Install Add-on From File...** (rename the zip to `.xpi` if needed).
- **Signed by Mozilla (works in normal Firefox):** create a free developer account at addons.mozilla.org, choose **Submit a New Add-on** > **On your own** (unlisted), upload `bookmarkonly-firefox.zip` and download the signed `.xpi`. Install it with **Install Add-on From File...**. The extension id in the manifest is `beeline-bookmarks@rosariosai.github.io`; if Mozilla rejects it, change it to an id you own (for example `tilenest-bookmarks@yourname.example`) and rebuild. The source zip `release\bookmarkonly-source.zip` is for Mozilla's reviewers.

Firefox shows letter tiles instead of site icons (it has no local icon cache for extensions). Pick an icon image in the Edit dialog if you want one.

## Importing your existing browser bookmarks

Settings > **Import / Export** > import from this browser (the browser asks for the optional "bookmarks" permission only at that moment), or import a bookmarks HTML file.

## Keeping Chrome and Brave in sync (Settings > Sync between browsers)

Automatic sync is available in **Chrome and Brave** (and other Chromium browsers). Each browser keeps its own copy of your bookmarks; to keep them equal they share **one sync file** that lives in a folder on your computer, or in a folder your cloud drive already syncs (Google Drive, OneDrive, Dropbox...) if the browsers are on different computers. Beeline only reads and writes that file; nothing is sent anywhere else.

**First time, in the browser that has your bookmarks**

1. Create a folder, for example `C:\BeelineSync`.
2. Settings > **Sync between browsers** > **Create sync file...** and save `beeline-sync.json (an older beeline-sync.json keeps working)` in that folder.
3. Allow the browser to edit the file when it asks. Beeline shows "Sync file created".

**In the other browser**

1. Settings > **Sync between browsers** > **Use an existing sync file...** and pick the same file.
2. Your bookmarks arrive. If that browser already had its own bookmarks, the same ones are recognised (same web address, group name and tag name) and are not duplicated; the others are added.

**After that**

- A **⟳ Synced** button appears in the top bar. About 5 seconds after you change something, the change is saved to the file; when you open a new tab, newer changes from the file are pulled in.
- After you restart the browser it may ask again for permission to the file: the button shows **⟳ Sync (allow)**. Click it once.
- **Sync now** (Settings or the top-bar button) forces a sync. **Stop syncing** unlinks the file without deleting anything.
- Adds and deletes travel both ways. If the same bookmark was changed in both browsers, the newer change wins; a bookmark deleted in one browser but edited in the other is kept.
- **What is synced is your choice**, see the next section. By default the view settings (layout, size, theme) and hidden items stay separate in each browser.
- A normal backup (Import / Export > Download backup) is still a good extra safety copy.

**Brave** switches off the needed feature by default: open `brave://flags/#file-system-access-api`, set it to **Enabled** and relaunch Brave. After that Settings > Sync shows the Create / Use existing sync file buttons.

**Firefox** cannot keep a file linked, so it has no automatic sync. To copy your bookmarks into Firefox: in Chrome or Brave use Import / Export > **Download backup**, then in Firefox Import / Export > choose that file > **Replace everything** (this keeps Preferred flags, colours and emoji). Repeat when you want Firefox to catch up. Do not use *Replace everything* in Firefox if you added bookmarks there that are not in the backup.

### What is synced (Settings > Sync > What is synced)

Bookmarks, groups and tags (names, web addresses, titles, tags, which group a bookmark is in, custom icons) are **always** synced. Everything else is a layer you can switch on or off, separately in each browser:

| Layer | What it contains | Default |
|---|---|---|
| Order and Preferred | order of groups and tiles, ★ Preferred stars and their order, promoted groups | on |
| Group look | group colour, icon, collapsed or not | on |
| Hidden items | hidden bookmarks and groups (and "hide until" dates), which browsers show a group | off |
| View settings | layout, size, density, theme, Launchpad options, Preferred size, tabs, "show site name", your own group icons | off |

Three buttons set them all at once: **Content only** (all layers off), **Recommended** (order and look on) and **Everything**. A layer that is off stays exactly as it is in this browser, and the sync file keeps the values the other browsers wrote, so one browser's choice never erases another's. Hiding something in Brave for a week therefore does not hide it in Chrome unless both have "Hidden items" on. Turning a layer on takes the file's values for it on the next sync (the file wins for that layer the first time). The choice is saved per browser and is not part of the file or of backups.

## Different top groups per browser

**Preferred** is shared: the big buttons at the top are the same in every browser. For browser-specific shortcuts use the per-browser top groups: Every browser profile gets three groups, **Top Chrome, Top Brave and Top Firefox**, created empty the first time this version runs (only the missing ones; if you delete one later it stays deleted, and on the first sync groups with the same name in two browsers are matched, not duplicated). Everything syncs, but in each browser only its own top group is shown normally. The other two appear as *hidden* groups: dimmed, and only visible after you switch on 👁 Hidden. Browsers are recognised automatically; if Brave is taken for Chrome, set it in Settings > **This browser**. **Promote**: in each browser, open its own Top group's menu > **★ Promote group to Preferred**. All its bookmarks then appear in the Preferred bar and the group hides itself; adding a bookmark to that group (Group field in the Add dialog) puts it straight into Preferred. Use Remove group from Preferred to get the group back. To use a hidden group's bookmarks in the current browser, open its menu > **Also show in this browser**. For any other group you can choose browsers yourself: group menu > **Colour, icon, browsers…** > “Show this group in”.

## Settings reference

Settings (⚙ in the top bar) is a set of colour-framed, numbered cards:

1. **This browser**: which browser Beeline thinks it runs in (Chrome, Brave or Firefox). It decides which "Top ..." group is yours. If Brave is taken for Chrome, click Brave; the page reloads. Saved per browser, not synced.
2. **Sync between browsers**: create or link the sync file, Sync now, Stop syncing, and **What is synced** (layers and presets). Chrome and Brave only.
3. **Preferred**: show the Preferred Launchpad; optional "Often used" row. Preferred bookmarks (starred ones and promoted groups) are the same in every browser.
4. **Bookmarks**: "Show tags on big tiles" (chips under big tiles; List and Icons never show them; tags still work for search, the side panel filter and Edit); "Show the site name for bookmarks without a title" (on = grey site name in every layout, also for existing bookmarks; off = icon only).
5. **New tab behaviour**: cursor in the search box, open in the same or a new tab, start on All bookmarks or where you left off.
6. **Your data**: Import / Export (browser bookmarks, bookmarks HTML, JSON backup); in Chrome and Brave also **Save site icons into my bookmarks** (stores the automatic icons as images so they appear in backups, sync and Firefox).
7. **Display**: Theme (match system, light, dark).

Layout (Big tiles, Compact list, Icons only), size (Small, Medium, Large), groups per row and tags on tiles are **not** in Settings: they are in the **◫ View** menu in the top bar. The side panel opens with ☰. (The old Comfortable/Compact density option was removed in 1.17.1 because it overlapped with the layouts.)

## Using it (60-second tour)

- **Add**: "+ Add bookmark", or Import / Export to bring in your browser bookmarks (the browser asks permission once).
- **Preferred**: tick "Preferred" in the Add/Edit dialog or use the bookmark menu > "Set as preferred". Preferred bookmarks appear as large buttons at the top; drag them to reorder. To put a whole group there (e.g. your browser's Top group), use group menu > **★ Promote group to Preferred**.
- **Search**: press `/` or Ctrl/Cmd+K, type, arrows to move, Enter to open (Ctrl/Cmd/Shift+Enter: new tab). `#tag` searches tags.
- **Numbers**: View > Numbers on bookmarks > Show puts a number on every bookmark, in the order you see them (the Preferred bar first, then groups in order). Like TV channels: press `/`, type the number, press Enter. It works even with the badges hidden. Reordering tiles or groups changes the numbers, so put your top 20 where you want them first.
- **Duplicate**: bookmark menu > Duplicate makes a copy next to it and opens Edit, handy for several similar links (e.g. Home Assistant dashboards).
- **View**: the **◫ View** button (top bar) holds every display option. Start with **Quick looks** (one click): *Classic* (big tiles in group boxes), *Compact* (one line each, boxes side by side), *Dense* (small numbered icons, no boxes, everything on one page). Then fine-tune: **Bookmarks look like** Tiles / List / Icons (how one bookmark is drawn); **Groups are shown as** Boxes / Side by side / No boxes (how groups are drawn; *No boxes* = raw view, one flat grid); Tags on tiles; Group headers (not used in No boxes); Numbers on bookmarks; Size (Small / Medium / Large).

### How to organise your bookmarks (short version)
- **Two independent choices.** *Bookmarks look like* decides the look of one bookmark. *Groups are shown as* decides whether groups appear as boxes or disappear (raw). They combine freely.
- **Order = number.** Every bookmark has one place in the order you see (Preferred bar first, then groups from top to bottom). The number badge is just that place. Drag to reorder, the number follows.
- **Boxes view:** drag inside a box to reorder; drop on another box or on a group in the sidebar to move it there.
- **No boxes (raw) view:** drag an icon onto another to put it at that place; it joins the group of the icon it lands on. Use boxes view when you need to move something into a specific, empty group.
- **Preferred** = the big bar on top for what you use all day. **Hidden** = removed from the view until you press the eye. **Groups** = optional labels and colours; **Tags** = extra search words.
- **Organise**: drag a whole group window by the ⠿ handle in its header to reorder groups; drag tiles to reorder or onto a group in the side panel. Group menu: rename, collapse, **Colour, icon, browsers…** (colour, one of 40 icons or any emoji or 1-4 letters you add with "+ Add to my icons", and which browsers show the group), promote to Preferred, hide, delete. Group headers are a darker coloured band so they stand out from the bookmarks.
- **Undo**: after deleting, click Undo in the pop-up or press Ctrl/Cmd+Z.
- **Logo**: a bold white B on a blue square (toolbar icon and top bar).
- **Backup**: Import / Export > Download backup (.json). Keep a copy.

## Troubleshooting

- *Tiles show letters, not site icons (Firefox)*: automatic icons come from the browser's own icon cache, which Firefox does not offer, and they are not stored in backups. In Chrome or Brave open Settings > Your data > **Save site icons into my bookmarks**: the icons are copied into Beeline as images (nothing is downloaded), then export a backup or sync, and Firefox shows them. Sites the browser has no icon for stay letters; pick an image in Edit. In Chrome and Brave, automatic icons appear for sites you have visited.
- *The cursor is in the address bar, not the search box*: press `/` or Tab.
- *"Manifest file is missing or unreadable"*: you picked the wrong folder; choose the one that contains `manifest.json`.
- *No Sync buttons in Brave*: enable `brave://flags/#file-system-access-api` and relaunch (see above).
- *"Top Brave" is hidden in Brave*: Settings > This browser > Brave.
- *A group I promoted disappeared from the list*: that is intended; it is under 👁 Hidden with a "★ in Preferred" badge. Use its menu > Remove group from Preferred to bring it back.
- *Sync button shows ⚠*: hover it for the reason. "The sync file cannot be used" means the file is not a Beeline file or is from a newer version; nothing was changed.

### Built-in links (Personal extensions and Beeline documentation)
**Personal extensions.** Each browser gets a hidden bookmark that opens its own extensions page (Chrome `chrome://extensions`, Brave `brave://extensions`, Firefox `about:debugging#/runtime/this-firefox`), handy to reload the extension after an update. Press the **Hidden** eye to see it. Beeline shows only the link of the browser you are in: a Chrome link never appears in Brave, even after you import a Chrome backup. You can edit, unhide or delete it. You can also add any other browser page (for example `chrome://settings`) with + Add: it is accepted as an address and opened through the extension. If a browser refuses (Firefox may block some `about:` pages), Beeline says so; type the address in the address bar instead.

**Beeline documentation.** Two visible bookmarks in Ungrouped, the same in every browser: one for the documentation on GitHub and one for the author's blog. Until the project is published their addresses are placeholders. Delete them if you do not want them.

**Restore.** If a built-in link is missing (deleted, or the browser profile was set up before it existed), Settings > Bookmarks > **Restore built-in links** recreates it. It never changes your other bookmarks, unlike importing a backup, which replaces or merges your whole collection.



## Tabs and Preferred size (2.6.0)

- **Tabs**: open the View menu > **Tabs > Add tabs** (later *Edit tabs*), or the **✎ Edit tabs** button at the right of the tab bar. Add 2 to 5 tabs, name them (for example *Work*, *Free time*, *Media*), and tick in the grid which groups belong to which tab. A group can be in several tabs. Untick *Keep an All tab first* if you want only your own tabs; groups that are in no tab then appear under an automatic **Other** tab. To move one group quickly, use its menu (⋯ in the sidebar, or 🙈 Hide… button) > **Show in tab…**. **Drag and drop**: drag a group from the side panel onto a tab with the left button to copy it into that tab, or with the right button to move it (it leaves the tab you are on). A group created while a tab is open is added to that tab. The Preferred bar stays above every tab; search always looks in all tabs. Removing every tab brings back the plain dashboard.
- **Preferred size**: View menu > **Preferred size** slider. 1× = the same size as your other bookmarks, up to 4×. The size follows the layout and size you chose (Tiles, List, Icons; Small, Medium, Large).
- The **Groups** heading in the sidebar shows how many groups you have (and "2 of 8" when a tab shows only some).

## Simple and Advanced mode (2.6.0)

A new install starts in **Simple**: add bookmarks, put them in groups (colour and icon), drag to reorder, mark favourites with ★ Preferred, search, pick a Quick look (Classic, Compact, Icons), light or dark theme, import and export. Everything else is **Advanced**: tabs, Preferred size, numbers, tags, hiding (and hide-until), group headers, the No boxes view, per-browser groups, promote group, Often used, custom group icons, sync. Switch any time in **View menu > Mode** or **Settings > Mode**. Going back to Simple only hides the extras and shows the plain dashboard; your tabs, tags and settings are kept and return when you switch to Advanced. If you already used Beeline before modes existed, it opens in Advanced.
