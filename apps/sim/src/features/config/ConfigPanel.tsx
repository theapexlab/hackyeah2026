import {
  ActionIcon,
  Button,
  Group,
  NumberInput,
  Slider,
  Stack,
  Switch,
  Text,
  TextInput,
} from '@mantine/core';
import { IconDice5 } from '@tabler/icons-react';
import { simCommands } from '../../sim/commands';
import { useSimStore } from '../../sim/store';
import { type ConfigDraft, useUIStore, worldFromDraft } from '../../ui/store';

const MAX_NODES = 300;

type NumKey = {
  [K in keyof ConfigDraft]: ConfigDraft[K] extends number ? K : never;
}[keyof ConfigDraft];

export function ConfigPanel() {
  const draft = useUIStore((s) => s.configDraft);
  const patch = useUIStore((s) => s.patchConfigDraft);

  const num = (key: NumKey, label: string, min: number, max: number) => (
    <NumberInput
      label={label}
      size="xs"
      min={min}
      max={max}
      value={draft[key]}
      onChange={(v) => typeof v === 'number' && patch({ [key]: v })}
    />
  );

  const slider = (key: NumKey, label: string, min: number, max: number, step = 1) => (
    <div>
      <Text size="xs">
        {label}: {draft[key]}
      </Text>
      <Slider
        aria-label={label}
        size="sm"
        min={min}
        max={max}
        step={step}
        value={draft[key]}
        onChange={(v) => patch({ [key]: v })}
      />
    </div>
  );

  const generate = (d: ConfigDraft) => {
    const ui = useUIStore.getState();
    ui.select(null);
    ui.setHighlightedMessageId(null);
    useSimStore.getState().setTickIntervalMs(d.tickMs);
    useSimStore.getState().createWorld(worldFromDraft(d), d.mobility);
  };
  const total = draft.mobiles + draft.routers + draft.gateways;

  return (
    <Stack gap="xs" p="sm">
      <Text fw={700} size="sm">
        Configuration
      </Text>
      <Group grow gap="xs">
        {num('width', 'Width (m)', 200, 5000)}
        {num('height', 'Height (m)', 200, 5000)}
      </Group>
      {num('mobiles', 'Phones', 0, MAX_NODES)}
      {slider('mobileRange', 'Phone range (m)', 20, 250)}
      {num('routers', 'ISP routers', 0, MAX_NODES)}
      {slider('routerRange', 'Router range (m)', 40, 400)}
      {num('gateways', 'Gateways', 0, 20)}
      {slider('gatewayRange', 'Gateway range (m)', 40, 400)}
      {slider('unregisteredFraction', 'Unregistered phones', 0, 1, 0.05)}
      {num('tickMs', 'Tick (ms)', 50, 2000)}
      <Switch
        label="Phones random-walk"
        checked={draft.mobility}
        onChange={(e) => {
          patch({ mobility: e.currentTarget.checked });
          simCommands.setMobility(e.currentTarget.checked);
        }}
      />
      <Group gap="xs" align="flex-end" wrap="nowrap">
        <TextInput
          label="Seed"
          size="xs"
          style={{ flex: 1 }}
          value={draft.seed}
          onChange={(e) => patch({ seed: e.currentTarget.value })}
        />
        <ActionIcon
          aria-label="Random seed"
          variant="default"
          size="lg"
          onClick={() => patch({ seed: String(Math.floor(Math.random() * 1_000_000)) })}
        >
          <IconDice5 size={16} />
        </ActionIcon>
      </Group>
      {total > MAX_NODES && (
        <Text size="xs" c="orange">
          {total} nodes: expect slowdown above {MAX_NODES}
        </Text>
      )}
      <Group grow gap="xs">
        <Button onClick={() => generate(draft)}>Generate</Button>
        <Button
          variant="light"
          onClick={() => {
            const { world, mobility, createWorld } = useSimStore.getState();
            if (world) createWorld(world, mobility);
          }}
        >
          Reset
        </Button>
      </Group>
    </Stack>
  );
}
