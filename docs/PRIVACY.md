---
source: claude
date: 2026-11-02
status: draft
---
# Beeline privacy policy

Beeline does not collect, transmit or share any data. It has no account, no server, no analytics and no third-party services.

**What is stored.** Your bookmarks, groups, tags, custom icon images and settings are saved in your browser's local storage (IndexedDB) on your computer. Removing the extension or clearing its site data deletes them. Nothing leaves your computer unless you export a file or turn on Sync yourself.

**Sync (optional, off by default).** If you link a sync file (Chrome and Brave), Beeline reads and writes that one file in a folder you chose. If that folder belongs to a cloud drive, the drive's own service uploads it; Beeline itself sends nothing anywhere.

**Permissions.**
- *New Tab page override*: replaces the new tab page with the dashboard.
- *favicon* (Chrome only): reads site icons from the browser's own local cache, so no icon is requested from the internet by the extension.
- *bookmarks* (optional): requested only when you click "Import my browser bookmarks". Bookmarks are read once and copied into Beeline.
- *Access to a website* (optional): requested only if you paste an image address that the site does not let the extension download directly; the image is fetched once and stored locally. Declining has no other effect.
- *tabs*-style actions are used only to open a browser page such as `chrome://extensions` when you click a bookmark to it.

**Network.** The only network requests are the ones your browser makes when you open a bookmark, and the one-time image download described above, which you start yourself.

**Contact.** Questions or problems: open an issue at https://github.com/rosariosai/beeline/issues.
