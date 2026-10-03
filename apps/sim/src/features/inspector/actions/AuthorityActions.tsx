import { Badge, Button, Divider, Group, Select, Stack, Text, Textarea } from '@mantine/core';
import { useState } from 'react';
import { formatMode } from '../../../lib/format';
import { type RegionPreset, regionFor } from '../../../lib/regions';
import { simCommands } from '../../../sim/commands';
import {
  useNodeView,
  useSimDeclarations,
  useSimUplinks,
  useWorldSize,
} from '../../../sim/selectors';
import { modeColorName } from '../../../theme/tokens';
import { useUIStore } from '../../../ui/store';

export function AuthorityActions() {
  const world = useWorldSize();
  const lastNodeId = useUIStore((s) => s.lastNodeId);
  const around = useNodeView(lastNodeId);
  const declarations = useSimDeclarations();
  const uplinks = useSimUplinks();
  const [preset, setPreset] = useState<RegionPreset>('city');
  const [alertText, setAlertText] = useState(
    'Official alert: follow instructions from the Authority.',
  );
  const region = () => regionFor(preset, world, around);

  return (
    <Stack gap="md">
      <Stack gap="xs">
        <Text fw={600} size="sm">
          Declare emergency
        </Text>
        <Select
          label="Region"
          size="xs"
          allowDeselect={false}
          value={preset}
          onChange={(v) => setPreset((v as RegionPreset) ?? 'city')}
          data={[
            { value: 'city', label: 'Whole city' },
            { value: 'west', label: 'West zone' },
            { value: 'east', label: 'East zone' },
            {
              value: 'around',
              label: around
                ? `Around ${around.id.toUpperCase()}`
                : 'Around selected node (none yet)',
              disabled: !around,
            },
          ]}
        />
        <Group grow gap="xs">
          {(['L1', 'L2', 'L3'] as const).map((l) => (
            <Button
              key={l}
              size="xs"
              color={modeColorName[l]}
              onClick={() => simCommands.declareMode(l, region())}
            >
              Declare {l}
            </Button>
          ))}
        </Group>
        <Button size="xs" variant="light" onClick={() => simCommands.allClear(region())}>
          All-clear
        </Button>
      </Stack>

      <Stack gap="xs">
        <Text fw={600} size="sm">
          Broadcast alert
        </Text>
        <Textarea
          aria-label="Alert text"
          size="xs"
          autosize
          minRows={2}
          value={alertText}
          onChange={(e) => setAlertText(e.currentTarget.value)}
        />
        <Button
          size="xs"
          color="violet"
          onClick={() => simCommands.broadcastAlert(alertText, region())}
        >
          Broadcast
        </Button>
      </Stack>

      <Divider />
      <Stack gap={4}>
        <Text fw={600} size="sm">
          Active declarations
        </Text>
        {!declarations?.length && (
          <Text size="xs" c="dimmed">
            None
          </Text>
        )}
        {declarations?.map((d) => (
          <Group key={d.id} gap="xs">
            <Badge color={modeColorName[d.level]} variant="light">
              {formatMode(d.level)}
            </Badge>
            <Text size="xs">until T{d.untilTick}</Text>
          </Group>
        ))}
      </Stack>
      <Stack gap={4}>
        <Text fw={600} size="sm">
          Uplinks received ({uplinks?.length ?? 0})
        </Text>
        {uplinks
          ?.slice(-8)
          .reverse()
          .map((u) => (
            <Text key={`${u.msgId}:${u.tick}`} size="xs" ff="monospace">
              T{u.tick} {u.msgId} via {u.via}
            </Text>
          ))}
      </Stack>
    </Stack>
  );
}
