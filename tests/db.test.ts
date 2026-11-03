import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { applyDiff, loadAll, openDb, saveSettings } from '../src/data/db';
import { addBookmark, addGroup, deleteBookmark, diffState } from '../src/core/ops';
import { emptyState, DEFAULT_SETTINGS } from '../src/core/types';

describe('IndexedDB repository', () => {
  it('round-trips state through diffs and reloads it', async () => {
    const db = await openDb('t1');
    let s = addGroup(emptyState(), 'Work', 'g', 1);
    s = addBookmark(s, { url: 'https://a.com/', title: 'A', groupId: 'g' }, 'a', 1);
    s = addBookmark(s, { url: 'https://b.com/', title: 'B', groupId: null }, 'b', 1);
    await applyDiff(db, diffState(emptyState(), s));
    const s2 = deleteBookmark(s, 'b');
    await applyDiff(db, diffState(s, s2));
    const { state, settings } = await loadAll(db);
    expect(Object.keys(state.bookmarks)).toEqual(['a']);
    expect(state.groups.g.name).toBe('Work');
    expect(settings).toEqual({ ...DEFAULT_SETTINGS, mode: 'advanced' }); // existing data from before modes = Advanced
  });

  it('persists settings', async () => {
    const db = await openDb('t2');
    await saveSettings(db, { ...DEFAULT_SETTINGS, theme: 'dark' });
    expect((await loadAll(db)).settings.theme).toBe('dark');
  });
});
