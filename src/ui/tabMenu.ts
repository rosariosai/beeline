import type { MenuItem } from './components/ContextMenu';
import type { Settings } from '../core/types';
import { toggleGroupInTab } from '../core/tabs';

/** Group menu entry "Show in tab…": tick or untick the tabs this group appears in (nothing when there are no tabs). */
export function tabMenuItems(settings: Settings, update: (p: Partial<Settings>) => void, groupId: string): MenuItem[] {
  if (!settings.tabs.length) return [];
  return [{
    label: 'Show in tab…',
    children: settings.tabs.map((t) => ({
      label: `${t.groupIds.includes(groupId) ? '✓' : '＋'} ${t.name}`,
      onSelect: () => update({ tabs: toggleGroupInTab(settings.tabs, t.id, groupId) }),
    })),
  }];
}
