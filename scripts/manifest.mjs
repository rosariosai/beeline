// Builds the manifest for each browser. Keep ALL browser differences in this file.
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

export function buildManifest(target, { test = false } = {}) {
  const manifest = {
    manifest_version: 3,
    name: 'Beeline — Bookmark Dashboard',
    version: pkg.version,
    description: 'A fast, visual bookmark dashboard for your New Tab page. Local-first, no tracking.',
    chrome_url_overrides: { newtab: 'newtab.html' },
    icons: { 16: 'icons/16.png', 32: 'icons/32.png', 48: 'icons/48.png', 128: 'icons/128.png' },
    // Requested only when the user clicks "Import" (privacy-friendly).
    optional_permissions: ['bookmarks'],
    // Asked for one site at a time, only when the user pastes an image address that the site does not allow
    // to be downloaded directly. Never requested at install time.
    optional_host_permissions: ['https://*/*', 'http://*/*'],
    permissions: [],
  };

  // TEST BUILD ONLY (never packaged): grants bookmarks up front so automated tests can skip the permission prompt.
  if (test) { manifest.permissions.push('bookmarks'); }

  if (target === 'chrome') {
    manifest.minimum_chrome_version = '110';
    // Local favicon cache API (no network). Chrome only.
    manifest.permissions.push('favicon');
  }

  if (target === 'firefox') {
    manifest.content_security_policy = { extension_pages: "script-src 'self'; object-src 'self'" };
    manifest.browser_specific_settings = {
      // 128 = first Firefox with optional_host_permissions (web-ext lint confirmed). Change the id before publishing.
      gecko: {
        id: 'tilenest-bookmarks@example.local',
        strict_min_version: '128.0',
        // Declares to Mozilla that the add-on collects/transmits no user data.
        data_collection_permissions: { required: ['none'] },
      },
      gecko_android: { strict_min_version: '128.0' },
    };
  }
  return manifest;
}
