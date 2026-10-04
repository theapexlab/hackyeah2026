import {
  ActionIcon,
  Box,
  Group,
  Paper,
  Stack,
  Text,
  Tooltip,
  useComputedColorScheme,
  useMantineTheme,
} from '@mantine/core';
import type { Mode } from '@pomoc/core';
import {
  IconAffiliate,
  IconCircleDotted,
  IconFocusCentered,
  IconZoomIn,
  IconZoomOut,
} from '@tabler/icons-react';
import { memo, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { formatSeed } from '../../lib/format';
import { terrainTitle } from '../../lib/terrain';
import { countNodes } from '../../sim/selectors';
import { useSimStore } from '../../sim/store';
import { KIND_ICON, TRAVEL_ICON } from '../../theme/icons';
import {
  MODE_COLOR,
  MODE_LABEL,
  resolvePalette,
  TRAVEL_COLOR,
  TRAVEL_LABEL,
  TRAVEL_MODES,
} from '../../theme/tokens';
import { useUiStore } from '../../ui/store';
import { AuthorityBadge } from './AuthorityBadge';
import type { ZoomController } from './useZoom';

interface MapOverlayProps {
  readonly zoom: ZoomController;
}

const MODES: readonly Mode[] = ['PEACE', 'L1', 'L2', 'L3'];

/** Static; memoised so a parent render never cascades into it. */
const Legend = memo(function Legend() {
  const theme = useMantineTheme();
  const scheme = useComputedColorScheme('dark');
  const palette = useMemo(() => resolvePalette(theme, scheme), [theme, scheme]);
  const swatches = [
    ['park', palette.park],
    ['river (no nodes)', palette.water],
  ] as const;
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
          {TRAVEL_MODES.map((mode) => {
            const Icon = TRAVEL_ICON[mode];
            return (
              <Group key={mode} gap={4} wrap="nowrap">
                <Icon
                  size={16}
                  stroke={1.75}
                  color={`var(--mantine-color-${TRAVEL_COLOR[mode]}-5)`}
                />
                <Text size="xs">{TRAVEL_LABEL[mode]}</Text>
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
        <Group gap="sm">
          {swatches.map(([label, color]) => (
            <Group key={label} gap={4} wrap="nowrap">
              <Box
                w={14}
                h={10}
                style={{
                  borderRadius: 2,
                  // the canvas paints these translucent tokens over the opaque world plane
                  background: `linear-gradient(${color}, ${color}), ${palette.worldFill}`,
                  border: '1px solid var(--mantine-color-default-border)',
                }}
              />
              <Text size="xs">{label}</Text>
            </Group>
          ))}
        </Group>
        <Text size="xs" c="dimmed">
          green ring = backhaul · dashed = unregistered · amber badge = stored · lime badge = open
          request · dim = off
        </Text>
      </Stack>
    </Paper>
  );
});

/** Top layer: HTML chrome over the map. Only its controls take pointer events. */
export function MapOverlay({ zoom }: MapOverlayProps) {
  const requestFit = useUiStore((s) => s.requestFit);
  const showRanges = useUiStore((s) => s.showRanges);
  const toggleRanges = useUiStore((s) => s.toggleRanges);
  const showTopologyPackets = useUiStore((s) => s.showTopologyPackets);
  const toggleTopologyPackets = useUiStore((s) => s.toggleTopologyPackets);
  // Primitives only: countNodes() returns a fresh object per snapshot, which would defeat useShallow.
  const {
    seed,
    terrainId,
    edges,
    components,
    total,
    mobiles,
    routers,
    gateways,
    alive,
    walking,
    cycling,
    driving,
  } = useSimStore(
    useShallow((s) => {
      const c = countNodes(s.snapshot.nodes);
      return {
        seed: s.snapshot.world.seed,
        terrainId: s.snapshot.terrain.id,
        edges: s.snapshot.edges.length,
        components: s.snapshot.metrics.componentCount,
        total: c.total,
        mobiles: c.mobiles,
        routers: c.routers,
        gateways: c.gateways,
        alive: c.alive,
        walking: c.walking,
        cycling: c.cycling,
        driving: c.driving,
      };
    }),
  );
  const title = terrainTitle(terrainId);

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      <Box style={{ position: 'absolute', top: 12, left: 12 }}>
        <Paper shadow="sm" radius="md" px="sm" py={6} withBorder>
          <Text size="xs" ff="monospace" c="dimmed">
            {title === null ? '' : `${title} · `}seed {formatSeed(seed)} · {total} nodes ({mobiles}/
            {routers}/{gateways}) · {alive} alive · {edges} edges · {components} components
            {walking + cycling + driving > 0
              ? ` · ${walking} walking · ${cycling} cycling · ${driving} driving`
              : ''}
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
