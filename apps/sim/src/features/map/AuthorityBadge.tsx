import { Group, Paper, Text, ThemeIcon, UnstyledButton } from '@mantine/core';
import { memo, useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { countNodes } from '../../sim/selectors';
import { useSimStore } from '../../sim/store';
import { AUTHORITY_ICON } from '../../theme/icons';
import { useUiStore } from '../../ui/store';
import { fxBus } from './renderer/fxBus';

/**
 * Virtual Authority console, pinned top-right. Click selects 'authority'. Flashes violet when
 * the renderer ingests an injection and teal when an uplink reaches the Authority.
 * Memoised (no props) so MapOverlay's renders never bypass its own selectors.
 */
export const AuthorityBadge = memo(function AuthorityBadge() {
  const selected = useUiStore((s) => s.selectedNodeId === 'authority');
  const select = useUiStore((s) => s.select);
  const { injected, received, uplinks, declarations } = useSimStore(
    useShallow((s) => ({
      injected: s.snapshot.authority.injected,
      received: s.snapshot.authority.received.length,
      uplinks: countNodes(s.snapshot.nodes).backhaul,
      declarations: s.snapshot.declarations.length,
    })),
  );
  const [flash, setFlash] = useState<{ seq: number; kind: 'inject' | 'uplink' } | null>(null);

  useEffect(() => {
    const offInject = fxBus.on('inject', () =>
      setFlash((f) => ({ seq: (f?.seq ?? 0) + 1, kind: 'inject' })),
    );
    const offUplink = fxBus.on('uplink', () =>
      setFlash((f) => ({ seq: (f?.seq ?? 0) + 1, kind: 'uplink' })),
    );
    return () => {
      offInject();
      offUplink();
    };
  }, []);

  const Icon = AUTHORITY_ICON;

  return (
    <UnstyledButton
      onClick={() => select('authority')}
      aria-label="Open the Authority console"
      aria-pressed={selected}
      style={{ pointerEvents: 'auto' }}
    >
      <Paper
        key={flash?.seq ?? 0}
        className={
          flash ? (flash.kind === 'inject' ? 'pomoc-flash' : 'pomoc-flash-uplink') : undefined
        }
        shadow="md"
        radius="md"
        p="xs"
        withBorder
        style={{
          borderColor: selected ? 'var(--mantine-color-violet-filled)' : undefined,
          minWidth: 220,
        }}
      >
        <Group gap="sm" wrap="nowrap">
          <ThemeIcon color="violet" variant="filled" size="lg" radius="md">
            <Icon size={20} />
          </ThemeIcon>
          <div>
            <Text fw={700} size="sm" lh={1.2}>
              Authority
            </Text>
            <Text size="xs" c="dimmed" lh={1.2}>
              {uplinks} uplinks · {received} received · {injected} sent
              {declarations > 0 ? ` · ${declarations} active` : ''}
            </Text>
          </div>
        </Group>
      </Paper>
    </UnstyledButton>
  );
});
