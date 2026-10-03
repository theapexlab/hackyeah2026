import { Badge, Group, Text } from '@mantine/core';
import { formatMode } from '../../lib/format';
import { useSimSnapshot } from '../../sim/selectors';
import { modeColors } from '../../theme/tokens';

export function ModeBanner() {
  const snapshot = useSimSnapshot();

  if (!snapshot || snapshot.nodes.length === 0) {
    return null;
  }

  const modes = new Set(snapshot.nodes.map((n) => n.mode));
  const dominantMode = snapshot.nodes[0]?.mode ?? 'PEACE';
  const color = modeColors[dominantMode];

  return (
    <Group
      grow
      style={{
        backgroundColor: color,
        padding: '0.5rem 1rem',
        width: '100%',
      }}
    >
      <Text size="sm" fw={700} style={{ color: 'white' }}>
        {formatMode(dominantMode)}
      </Text>
      {modes.size > 1 && (
        <Text size="xs" style={{ color: 'white', opacity: 0.8 }}>
          {modes.size} zones
        </Text>
      )}
    </Group>
  );
}
