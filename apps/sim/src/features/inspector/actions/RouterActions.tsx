import { Badge, Button, Group, Stack, Switch, Text } from '@mantine/core';
import type { NodeView } from '@pomoc/core';
import { setNodePowered } from '../../../sim/commands';
import { useSimStore } from '../../../sim/store';

interface RouterActionsProps {
  readonly node: NodeView;
}

/** Power control for routers and gateways, plus their backhaul status. Liveness itself is the engine's call. */
export function RouterActions({ node }: RouterActionsProps) {
  const gridUp = useSimStore((s) => s.snapshot.world.gridUp);
  const overridden = node.poweredOverride !== null;
  return (
    <Stack gap="xs">
      <Switch
        size="sm"
        label={node.alive ? 'Powered on' : 'Powered off'}
        description={
          overridden
            ? `Manual override; the grid is ${gridUp ? 'up' : 'down'}`
            : node.kind === 'gateway'
              ? 'Gateways have their own power'
              : node.batteryBacked
                ? 'Battery backed: survives a grid outage'
                : `Follows the power grid (${gridUp ? 'up' : 'down'})`
        }
        checked={node.alive}
        onChange={(event) => setNodePowered(node.id, event.currentTarget.checked)}
      />
      {overridden ? (
        <Button size="xs" variant="default" onClick={() => setNodePowered(node.id, null)}>
          Follow the grid again
        </Button>
      ) : null}
      <Group gap="xs">
        <Text size="xs" c="dimmed">
          Backhaul
        </Text>
        <Badge variant="light" color="gray" size="sm">
          {node.backhaul}
        </Badge>
        <Badge variant="light" color={node.hasBackhaul ? 'green' : 'red'} size="sm">
          {node.hasBackhaul ? 'reaches Authority' : 'no uplink'}
        </Badge>
        <Badge variant="light" color={node.wanUp ? 'green' : 'yellow'} size="sm">
          WAN {node.wanUp ? 'up' : 'down'}
        </Badge>
      </Group>
      {node.kind === 'gateway' ? (
        <Text size="xs" c="dimmed">
          {node.backhaul === 'satellite'
            ? 'Satellite uplink keeps working when cells are down; alerts enter the mesh here.'
            : 'Fibre uplink depends on the terrestrial network.'}
        </Text>
      ) : (
        <Text size="xs" c="dimmed">
          Relay credential: forwards and gossips, never originates citizen traffic.
        </Text>
      )}
    </Stack>
  );
}
