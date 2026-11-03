// Simple / Advanced mode. Simple shows the plain dashboard and only the basic controls; Advanced is everything.
// Switching to Simple hides the advanced features but deletes nothing: `effectiveSettings` is the view of the settings
// that the screens use, while the real settings (tabs, numbers, tags on tiles…) stay stored and come back in Advanced.
import type { Settings } from './types';
import { DEFAULT_SETTINGS } from './types';

export const isAdvanced = (s: Pick<Settings, 'mode'>) => s.mode === 'advanced';

export function effectiveSettings(s: Settings): Settings {
  if (s.mode === 'advanced') return s;
  return {
    ...s,
    tabs: [], activeTabId: null, preferredScale: DEFAULT_SETTINGS.preferredScale,
    showNumbers: false, showTags: false, showOften: false, showHidden: false, showGroupHeaders: true,
    groupsPerRow: s.groupsPerRow === 'raw' ? 'one' : s.groupsPerRow,
  };
}
