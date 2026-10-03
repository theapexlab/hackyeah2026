import { Badge, Tooltip } from '@mantine/core';
import { useUIStore } from '../../ui/store';

export function AuthorityBadge() {
  const setSelectedNodeId = useUIStore((s) => s.setSelectedNodeId);

  return (
    <Tooltip label="Click to inspect Authority" position="bottom-start">
      <Badge
        onClick={() => setSelectedNodeId('authority')}
        style={{ cursor: 'pointer' }}
        variant="light"
        size="lg"
      >
        Authority Console
      </Badge>
    </Tooltip>
  );
}
