import {
  Badge,
  Button,
  Group,
  Menu,
  Paper,
  Select,
  Stack,
  Switch,
  Text,
  Textarea,
} from '@mantine/core';
import type { DeclaredLevel } from '@pomoc/core';
import { IconBroadcast, IconChevronDown, IconCircleCheck } from '@tabler/icons-react';
import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { formatClass, formatTick } from '../../../lib/format';
import { formatRegion, REGION_LABEL, type RegionPreset, regionFor } from '../../../lib/regions';
import { allClear, broadcastAlert, declareMode } from '../../../sim/commands';
import { CANNED_ALERT_TEXT } from '../../../sim/events';
import { selectNodeById } from '../../../sim/selectors';
import { useSimStore } from '../../../sim/store';
import { CLASS_COLOR, MODE_COLOR, MODE_LABEL } from '../../../theme/tokens';
import { useUiStore } from '../../../ui/store';

const LEVELS: readonly DeclaredLevel[] = ['L1', 'L2', 'L3'];
const PRESETS: readonly RegionPreset[] = ['city', 'west', 'east', 'around'];
const MAX_RECEIVED = 25;

function isPreset(value: string | null): value is RegionPreset {
  return value !== null && (PRESETS as readonly string[]).includes(value);
}

interface RegionMenuProps {
  readonly label: string;
  readonly color: string;
  readonly variant?: 'filled' | 'light';
  readonly aroundLabel: string;
  readonly aroundEnabled: boolean;
  readonly onPick: (preset: RegionPreset) => void;
}

/** Button whose dropdown picks the region a declaration applies to. */
function RegionMenu({
  label,
  color,
  variant = 'filled',
  aroundLabel,
  aroundEnabled,
  onPick,
}: RegionMenuProps) {
  return (
    <Menu position="bottom-start" withinPortal shadow="md">
      <Menu.Target>
        <Button
          size="xs"
          color={color}
          variant={variant}
          rightSection={<IconChevronDown size={14} />}
        >
          {label}
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>Region</Menu.Label>
        {PRESETS.map((preset) => (
          <Menu.Item
            key={preset}
            disabled={preset === 'around' && !aroundEnabled}
            onClick={() => onPick(preset)}
          >
            {preset === 'around' ? aroundLabel : REGION_LABEL[preset]}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}

/** The virtual Authority console: declarations with a region menu, all-clear, alerts, uplinks. */
export function AuthorityActions() {
  const lastSelectedNodeId = useUiStore((s) => s.lastSelectedNodeId);
  const select = useUiStore((s) => s.select);
  const world = useSimStore(
    useShallow((s) => ({ width: s.snapshot.world.width, height: s.snapshot.world.height })),
  );
  const declarations = useSimStore((s) => s.snapshot.declarations);
  const received = useSimStore((s) => s.snapshot.authority.received);
  const around = useSimStore(selectNodeById(lastSelectedNodeId)) ?? null;
  const [forged, setForged] = useState(false);
  const [alertText, setAlertText] = useState(CANNED_ALERT_TEXT);
  const [alertPreset, setAlertPreset] = useState<RegionPreset>('city');

  const region = (preset: RegionPreset) => regionFor(preset, world, around);
  const presetLabel = (preset: RegionPreset): string =>
    preset === 'around'
      ? around
        ? `Around ${around.id} (r 250 m)`
        : 'Around a node (select one first)'
      : REGION_LABEL[preset];

  return (
    <Stack gap="md">
      <Stack gap="xs">
        <Text size="xs" fw={600}>
          Declare emergency level
        </Text>
        <Group gap="xs">
          {LEVELS.map((level) => (
            <RegionMenu
              key={level}
              label={`Declare ${level}`}
              color={MODE_COLOR[level]}
              aroundLabel={presetLabel('around')}
              aroundEnabled={around !== null}
              onPick={(preset) => declareMode(level, { region: region(preset), forged })}
            />
          ))}
          <RegionMenu
            label="All-clear"
            color="blue"
            variant="light"
            aroundLabel={presetLabel('around')}
            aroundEnabled={around !== null}
            onPick={(preset) => allClear({ region: region(preset), forged })}
          />
        </Group>
        <Switch
          size="xs"
          label="Forge the signature (demo: every node must reject it)"
          checked={forged}
          onChange={(event) => setForged(event.currentTarget.checked)}
          color="red"
        />
      </Stack>

      <Stack gap="xs">
        <Text size="xs" fw={600}>
          Broadcast official alert
        </Text>
        <Textarea
          size="xs"
          autosize
          minRows={2}
          maxRows={5}
          value={alertText}
          onChange={(event) => setAlertText(event.currentTarget.value)}
        />
        <Group gap="xs" align="flex-end">
          <Select
            size="xs"
            label="Region"
            data={PRESETS.map((preset) => ({
              value: preset,
              label: presetLabel(preset),
              disabled: preset === 'around' && around === null,
            }))}
            value={alertPreset}
            onChange={(value) => setAlertPreset(isPreset(value) ? value : 'city')}
            allowDeselect={false}
            comboboxProps={{ withinPortal: true }}
            style={{ flex: 1 }}
          />
          <Button
            size="xs"
            color="violet"
            leftSection={<IconBroadcast size={14} />}
            onClick={() =>
              broadcastAlert(alertText.trim() || CANNED_ALERT_TEXT, {
                region: region(alertPreset),
                forged,
              })
            }
          >
            Send
          </Button>
        </Group>
      </Stack>

      <Stack gap="xs">
        <Text size="xs" fw={600}>
          Active declarations
        </Text>
        {declarations.length === 0 ? (
          <Text size="xs" c="dimmed">
            None. Nodes decide locally: WAN loss → L1, stable WAN → Peace.
          </Text>
        ) : (
          declarations.map((declaration) => (
            <Paper key={declaration.id} withBorder radius="md" p="xs">
              <Group gap="xs" justify="space-between" wrap="nowrap">
                <Group gap="xs">
                  <Badge color={MODE_COLOR[declaration.level]} variant="filled" size="sm">
                    {MODE_LABEL[declaration.level]}
                  </Badge>
                  <Text size="xs" c="dimmed">
                    {formatRegion(declaration.region)}
                  </Text>
                </Group>
                <Text size="xs" ff="monospace" c="dimmed">
                  t{formatTick(declaration.fromTick)} → t{formatTick(declaration.untilTick)}
                </Text>
              </Group>
            </Paper>
          ))
        )}
      </Stack>

      <Stack gap="xs">
        <Group gap="xs" justify="space-between">
          <Text size="xs" fw={600}>
            Received uplinks
          </Text>
          <Badge variant="light" color="violet" size="sm">
            {received.length}
          </Badge>
        </Group>
        {received.length === 0 ? (
          <Text size="xs" c="dimmed">
            Nothing yet. Check-ins and life-critical requests reaching a backhaul node land here.
          </Text>
        ) : (
          <Stack gap={4}>
            {received
              .slice(-MAX_RECEIVED)
              .reverse()
              .map((receipt) => (
                <Group
                  key={receipt.msgId}
                  gap="xs"
                  wrap="nowrap"
                  className="pomoc-log-row"
                  onClick={() => select(receipt.via)}
                  role="button"
                  tabIndex={-1}
                  px={4}
                  py={2}
                >
                  <Text size="xs" ff="monospace" c="dimmed" style={{ width: 40, flexShrink: 0 }}>
                    {formatTick(receipt.tick)}
                  </Text>
                  <Badge color={CLASS_COLOR[receipt.class]} variant="light" size="xs">
                    {formatClass(receipt.class)}
                  </Badge>
                  <Text size="xs" truncate>
                    from {receipt.originId} via {receipt.via}
                  </Text>
                  <IconCircleCheck size={14} style={{ marginLeft: 'auto', flexShrink: 0 }} />
                </Group>
              ))}
          </Stack>
        )}
      </Stack>
    </Stack>
  );
}
