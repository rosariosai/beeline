import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { applyDiff, loadAll, openDb, saveSettings } from '../src/data/db';
import { addGroup, diffState } from '../src/core/ops';
import { emptyState, DEFAULT_SETTINGS, type Settings } from '../src/core/types';
import { effectiveSettings } from '../src/core/mode';
import { buildExportFile, parseExportFile } from '../src/core/exporting';

const busy: Settings = { ...DEFAULT_SETTINGS, mode: 'advanced', tabs: [{ id: 't', name: 'Lab', groupIds: ['g'] }], preferredScale: 3, showNumbers: true,
  showTags: true, showOften: true, showHidden: true, showGroupHeaders: false, groupsPerRow: 'raw' };

describe('simple / advanced mode', () => {
  it('advanced uses the settings as they are', () => expect(effectiveSettings(busy)).toBe(busy));
  it('simple switches the advanced options off in the view, without touching the stored settings', () => {
    const e = effectiveSettings({ ...busy, mode: 'simple' });
    expect(e).toMatchObject({ tabs: [], preferredScale: DEFAULT_SETTINGS.preferredScale, showNumbers: false, showTags: false, showOften: false, showHidden: false, showGroupHeaders: true, groupsPerRow: 'one' });
    expect(busy.tabs).toHaveLength(1); // the original object is unchanged, so switching back restores everything
    expect(effectiveSettings({ ...busy, mode: 'simple', groupsPerRow: 'many' }).groupsPerRow).toBe('many');
  });
  it('a fresh install starts in Simple', async () => {
    expect((await loadAll(await openDb('m1'))).settings.mode).toBe('simple');
  });
  it('an install that already has data or settings starts in Advanced', async () => {
    const db = await openDb('m2');
    await applyDiff(db, diffState(emptyState(), addGroup(emptyState(), 'Work', 'g', 1)));
    expect((await loadAll(db)).settings.mode).toBe('advanced');
    const db2 = await openDb('m3');
    const { mode: _m, ...old } = DEFAULT_SETTINGS;
    await saveSettings(db2, old as Settings); // settings saved by a version before modes
    expect((await loadAll(db2)).settings.mode).toBe('advanced');
  });
  it('a chosen mode is kept', async () => {
    const db = await openDb('m4');
    await saveSettings(db, { ...DEFAULT_SETTINGS, mode: 'simple' });
    await applyDiff(db, diffState(emptyState(), addGroup(emptyState(), 'Work', 'g', 1)));
    expect((await loadAll(db)).settings.mode).toBe('simple');
  });
  it('a backup carries the mode but old backups without it parse fine', () => {
    const f = JSON.parse(JSON.stringify(buildExportFile(emptyState(), busy, [], new Date(1))));
    expect((parseExportFile(JSON.stringify(f)) as { ok: true; file: { settings: Settings } }).file.settings.mode).toBe('advanced');
    delete f.settings.mode;
    expect((parseExportFile(JSON.stringify(f)) as { ok: true; file: { settings: Settings } }).file.settings.mode).toBe('simple');
  });
});
