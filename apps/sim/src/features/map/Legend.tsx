import { Collapse, Group, Paper, Stack, Text, UnstyledButton } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import type { MessageClass, Mode } from '@pomoc/core';
import { IconChevronDown, IconChevronUp } from '@tabler/icons-react';
import { formatClass, formatMode } from '../../lib/format';
import { classCss, MODE_ORDER, modeCss } from '../../theme/tokens';

const CLASS_GROUPS: { label: string; color: MessageClass }[] = [
  { label: 'Life critical', color: 'LIFE_CRITICAL' },
  { label: 'Safety', color: 'SAFETY' },
  { label: 'Check-in', color: 'CHECK_IN' },
  { label: 'Info', color: 'INFO' },
  { label: 'Lend / borrow / give / sell', color: 'LEND' },
  { label: 'Official alert / declaration', color: 'OFFICIAL_ALERT' },
  { label: 'Topology (hidden, t)', color: 'TOPOLOGY' },
];

const Dot = ({ color, ring = false }: { color: string; ring?: boolean }) => (
  <span
    style={{
      display: 'inline-block',
      width: 12,
      height: 12,
      borderRadius: '50%',
      flex: 'none',
      background: ring ? 'transparent' : color,
      border: ring ? `3px solid ${color}` : undefined,
      boxSizing: 'border-box',
    }}
  />
);

export function Legend() {
  const [open, { toggle }] = useDisclosure(false);
  return (
    <Paper
      withBorder
      p="xs"
      radius="md"
      style={{ pointerEvents: 'auto', maxWidth: 260 }}
      data-no-zoom
    >
      <UnstyledButton onClick={toggle} aria-expanded={open} aria-label="Toggle legend" w="100%">
        <Group justify="space-between" gap="xs">
          <Text size="xs" fw={700}>
            Legend
          </Text>
          {open ? <IconChevronDown size={14} /> : <IconChevronUp size={14} />}
        </Group>
      </UnstyledButton>
      <Collapse expanded={open}>
        <Stack gap={4} mt="xs">
          <Text size="xs" c="dimmed">
            Node ring = mode
          </Text>
          {MODE_ORDER.map((m: Mode) => (
            <Group key={m} gap="xs" wrap="nowrap">
              <Dot color={modeCss(m)} ring />
              <Text size="xs">{formatMode(m)}</Text>
            </Group>
          ))}
          <Text size="xs" c="dimmed" mt={4}>
            Pulse = message class
          </Text>
          {CLASS_GROUPS.map((c) => (
            <Group key={c.color} gap="xs" wrap="nowrap">
              <Dot color={classCss(c.color)} />
              <Text size="xs" title={formatClass(c.color)}>
                {c.label}
              </Text>
            </Group>
          ))}
          <Text size="xs" c="dimmed" mt={4}>
            Badges
          </Text>
          <Group gap="xs" wrap="nowrap">
            <Dot color="var(--mantine-color-green-5)" ring />
            <Text size="xs">Backhaul (reaches Authority)</Text>
          </Group>
          <Group gap="xs" wrap="nowrap">
            <Dot color="var(--mantine-color-yellow-5)" />
            <Text size="xs">Store-and-forward buffer</Text>
          </Group>
          <Text size="xs">Dashed ring: unregistered. Dim: powered off.</Text>
        </Stack>
      </Collapse>
    </Paper>
  );
}
