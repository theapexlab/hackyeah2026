import { Button, Kbd, Stack, Text, Tooltip } from '@mantine/core';
import {
  IconAlertTriangle,
  IconArrowsShuffle,
  IconBolt,
  IconBroadcast,
  IconCellSignalOff,
  IconCircleCheck,
  type IconProps,
  IconShieldCheck,
  IconSignature,
  IconUserCheck,
} from '@tabler/icons-react';
import type { ComponentType } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { type DemoEvent, type EventGroup, eventsInGroup } from '../../sim/events';
import { useSimStore } from '../../sim/store';
import type { MantineColorName } from '../../theme/tokens';
import { useEventRunner } from '../../ui/eventContext';

interface EventLook {
  readonly color: MantineColorName;
  readonly icon: ComponentType<IconProps>;
}

/** Presentation per event key; the behaviour lives in sim/events.ts. */
const LOOK: Readonly<Record<string, EventLook>> = {
  'toggle-cells': { color: 'green', icon: IconCellSignalOff },
  'toggle-grid': { color: 'green', icon: IconBolt },
  'declare-l1': { color: 'yellow', icon: IconAlertTriangle },
  'declare-l2': { color: 'red', icon: IconAlertTriangle },
  'declare-l3': { color: 'grape', icon: IconShieldCheck },
  'all-clear': { color: 'blue', icon: IconCircleCheck },
  'broadcast-alert': { color: 'violet', icon: IconBroadcast },
  'random-request': { color: 'lime', icon: IconArrowsShuffle },
  'auto-respond': { color: 'teal', icon: IconUserCheck },
  'forged-request': { color: 'red', icon: IconSignature },
};

const SECTIONS: readonly { readonly title: string; readonly group: EventGroup }[] = [
  { title: 'Network', group: 'infrastructure' },
  { title: 'Emergency', group: 'authority' },
  { title: 'Traffic', group: 'citizens' },
];

interface EventButtonProps {
  readonly event: DemoEvent;
  readonly run: (event: DemoEvent) => void;
  /** Live label override for toggles (cells / grid). */
  readonly label?: string;
  readonly active?: boolean;
}

function EventButton({ event, run, label, active }: EventButtonProps) {
  const look = LOOK[event.key] ?? { color: 'gray', icon: IconBolt };
  const Icon = look.icon;
  const isForged = event.key === 'forged-request';
  return (
    <Tooltip label={event.hint} position="right" openDelay={400} multiline w={260}>
      <Button
        variant={isForged ? 'outline' : active === false ? 'default' : 'light'}
        color={look.color}
        justify="space-between"
        fullWidth
        size="sm"
        leftSection={<Icon size={18} stroke={1.75} />}
        rightSection={<Kbd size="xs">{event.hotkey}</Kbd>}
        onClick={() => run(event)}
      >
        {label ?? event.label}
      </Button>
    </Tooltip>
  );
}

/** Demo events as buttons, grouped, each with its hotkey. Buttons and hotkeys share one runner. */
export function EventsPanel() {
  const run = useEventRunner();
  const { cellsUp, gridUp } = useSimStore(
    useShallow((s) => ({ cellsUp: s.snapshot.world.cellsUp, gridUp: s.snapshot.world.gridUp })),
  );

  const liveLabel = (event: DemoEvent): { label?: string; active?: boolean } => {
    if (event.key === 'toggle-cells') {
      return {
        label: cellsUp ? 'Cells: up — take down' : 'Cells: down — restore',
        active: cellsUp,
      };
    }
    if (event.key === 'toggle-grid') {
      return { label: gridUp ? 'Grid: on — switch off' : 'Grid: off — switch on', active: gridUp };
    }
    return {};
  };

  return (
    <Stack gap="md" p="md">
      {SECTIONS.map((section) => (
        <Stack key={section.group} gap={6}>
          <Text size="xs" fw={700} c="dimmed" tt="uppercase" style={{ letterSpacing: '0.08em' }}>
            {section.title}
          </Text>
          {eventsInGroup(section.group).map((event) => (
            <EventButton key={event.key} event={event} run={run} {...liveLabel(event)} />
          ))}
        </Stack>
      ))}
    </Stack>
  );
}
