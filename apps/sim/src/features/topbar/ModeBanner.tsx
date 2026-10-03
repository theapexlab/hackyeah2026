import { Group, Text } from '@mantine/core';
import { formatMode } from '../../lib/format';
import { useModeCounts } from '../../sim/selectors';
import { MODE_ORDER, modeCss } from '../../theme/tokens';

export function ModeBanner() {
  const counts = useModeCounts();
  const total = MODE_ORDER.reduce((s, m) => s + counts[m], 0);
  const present = MODE_ORDER.filter((m) => counts[m] > 0);
  if (total === 0) return null;

  let acc = 0;
  const stops = present
    .map((m) => {
      const from = acc;
      acc += (counts[m] / total) * 100;
      return `${modeCss(m)} ${from}% ${acc}%`;
    })
    .join(', ');

  return (
    <Group
      role="status"
      aria-live="polite"
      justify="center"
      gap="lg"
      h={24}
      style={{ background: `linear-gradient(90deg, ${stops})`, transition: 'background 600ms' }}
    >
      {present.map((m) => (
        <Text
          key={m}
          size="xs"
          fw={800}
          c="white"
          style={{ letterSpacing: 1, textShadow: '0 1px 3px rgba(0,0,0,0.7)' }}
        >
          {formatMode(m)}
          {present.length > 1 ? ` · ${Math.round((counts[m] / total) * 100)}%` : ''}
        </Text>
      ))}
    </Group>
  );
}
