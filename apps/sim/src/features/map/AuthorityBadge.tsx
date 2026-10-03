import { Badge } from '@mantine/core';
import { IconBuildingBroadcastTower } from '@tabler/icons-react';
import { AUTHORITY, useUIStore } from '../../ui/store';

export function AuthorityBadge() {
  const flash = useUIStore((s) => s.authorityFlash);
  const selected = useUIStore((s) => s.selectedNodeId === AUTHORITY);
  return (
    <Badge
      key={flash}
      component="button"
      type="button"
      aria-label="Open Authority console"
      className={flash > 0 ? 'authority-flash' : undefined}
      onClick={() => useUIStore.getState().select(AUTHORITY)}
      variant={selected ? 'filled' : 'light'}
      color="violet"
      size="xl"
      leftSection={<IconBuildingBroadcastTower size={16} />}
      style={{ cursor: 'pointer', pointerEvents: 'auto' }}
      data-no-zoom
    >
      Authority console
    </Badge>
  );
}
