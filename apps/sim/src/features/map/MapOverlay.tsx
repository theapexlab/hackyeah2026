import { ActionIcon, Box, Group, Paper, Stack, Text, Tooltip } from '@mantine/core';
import type { Mode } from '@pomoc/core';
import {
  IconAffiliate,
  IconCircleDotted,
  IconFocusCentered,
  IconZoomIn,
  IconZoomOut,
} from '@tabler/icons-react';
import { memo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { formatSeed } from '../../lib/format';
import { countNodes } from '../../sim/selectors';
import { useSimStore } from '../../sim/store';
import { KIND_ICON } from '../../theme/icons';
import { MODE_COLOR, MODE_LABEL, MODE_VIGNETTE, modeColorVar } from '../../theme/tokens';
import { useUiStore } from '../../ui/store';
import { AuthorityBadge } from './AuthorityBadge';
import type { ZoomController } from './useZoom';

interface MapOverlayProps {
  readonly zoom: ZoomController;
}

const MODES: readonly Mode[] = ['PEACE', 'L1', 'L2', 'L3'];

/** Static; memoised so a parent render never cascades into it. */
const Legend = memo(function Legend() {
  return (
    <Paper shadow="sm" radius="md" p="xs" withBorder style={{ pointerEvents: 'auto' }}>
      <Stack gap={4}>
        <Group gap="sm">
          {(['mobile', 'router', 'gateway'] as const).map((kind) => {
            const Icon = KIND_ICON[kind];
            return (
              <Group key={kind} gap={4} wrap="nowrap">
                <Icon size={16} stroke={1.75} />
                <Text size="xs">{kind}</Text>
              </Group>
            );
          })}
        </Group>
        <Group gap="sm">
          {MODES.map((mode) => (
            <Group key={mode} gap={4} wrap="nowrap">
              <Box
                w={10}
                h={10}
                style={{
                  borderRadius: '50%',
                  border: `2.5px solid var(--mantine-color-${MODE_COLOR[mode]}-filled)`,
                }}
              />
              <Text size="xs">{MODE_LABEL[mode]}</Text>
            </Group>
          ))}
        </Group>
        <Text size="xs" c="dimmed">
          green ring = backhaul · dashed = unregistered · amber badge = stored · lime badge = open
          request · dim = off · drag a phone to move it
        </Text>
      </Stack>
    </Paper>
  );
});

/** Top layer: HTML chrome over the map. Only its controls take pointer events. */
export function MapOverlay({ zoom }: MapOverlayProps) {
  const mode = useSimStore((s) => s.snapshot.globalMode);
  const requestFit = useUiStore((s) => s.requestFit);
  const showRanges = useUiStore((s) => s.showRanges);
  const toggleRanges = useUiStore((s) => s.toggleRanges);
  const showTopologyPackets = useUiStore((s) => s.showTopologyPackets);
  const toggleTopologyPackets = useUiStore((s) => s.toggleTopologyPackets);
  // Primitives only: countNodes() returns a fresh object per snapshot, which would defeat useShallow.
  const { seed, edges, components, total, mobiles, routers, gateways, alive } = useSimStore(
    useShallow((s) => {
      const c = countNodes(s.snapshot.nodes);
      return {
        seed: s.snapshot.world.seed,
        edges: s.snapshot.edges.length,
        components: s.snapshot.metrics.componentCount,
        total: c.total,
        mobiles: c.mobiles,
        routers: c.routers,
        gateways: c.gateways,
        alive: c.alive,
      };
    }),
  );
  const vignette = `color-mix(in srgb, ${modeColorVar(mode)} ${Math.round(MODE_VIGNETTE[mode] * 100)}%, transparent)`;

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          boxShadow: `inset 0 0 160px ${vignette}`,
          transition: 'box-shadow 600ms ease',
        }}
      />

      <Box style={{ position: 'absolute', top: 12, left: 12 }}>
        <Paper shadow="sm" radius="md" px="sm" py={6} withBorder>
          <Text size="xs" ff="monospace" c="dimmed">
            seed {formatSeed(seed)} · {total} nodes ({mobiles}/{routers}/{gateways}) · {alive} alive
            · {edges} edges · {components} components
          </Text>
        </Paper>
      </Box>

      <Box style={{ position: 'absolute', top: 12, right: 12 }}>
        <AuthorityBadge />
      </Box>

      {total === 0 ? (
        <Box
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text c="dimmed" size="lg">
            No nodes in this world yet — press Generate.
          </Text>
        </Box>
      ) : null}

      <Box style={{ position: 'absolute', bottom: 12, left: 12 }}>
        <Legend />
      </Box>

      <Stack gap={4} style={{ position: 'absolute', bottom: 12, right: 12, pointerEvents: 'auto' }}>
        <Tooltip label="Range circles (v)" position="left">
          <ActionIcon
            variant={showRanges ? 'filled' : 'default'}
            size="lg"
            aria-pressed={showRanges}
            aria-label="Range circles"
            onClick={toggleRanges}
          >
            <IconCircleDotted size={18} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Topology packets (t)" position="left">
          <ActionIcon
            variant={showTopologyPackets ? 'filled' : 'default'}
            size="lg"
            aria-pressed={showTopologyPackets}
            aria-label="Topology packets"
            onClick={toggleTopologyPackets}
          >
            <IconAffiliate size={18} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Zoom in" position="left">
          <ActionIcon
            variant="default"
            size="lg"
            onClick={() => zoom.zoomBy(1.4)}
            aria-label="Zoom in"
          >
            <IconZoomIn size={18} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Zoom out" position="left">
          <ActionIcon
            variant="default"
            size="lg"
            onClick={() => zoom.zoomBy(1 / 1.4)}
            aria-label="Zoom out"
          >
            <IconZoomOut size={18} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Fit view (h)" position="left">
          <ActionIcon variant="default" size="lg" onClick={requestFit} aria-label="Fit view">
            <IconFocusCentered size={18} />
          </ActionIcon>
        </Tooltip>
      </Stack>
    </div>
  );
}
