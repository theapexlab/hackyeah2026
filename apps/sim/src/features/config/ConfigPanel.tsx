import {
  ActionIcon,
  Button,
  Group,
  NumberInput,
  Slider,
  Stack,
  Switch,
  Text,
  Tooltip,
} from '@mantine/core';
import {
  DEFAULT_ENGINE_CONFIG,
  KRAKOW_HEIGHT,
  KRAKOW_SEED,
  KRAKOW_TERRAIN_ID,
  KRAKOW_WIDTH,
} from '@pomoc/core';
import { IconDice5 } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { isKrakowSeed, terrainTitle } from '../../lib/terrain';
import { setMobility, setTickSeconds } from '../../sim/commands';
import { createWorld, resetWorld, setTickInterval } from '../../sim/store';
import { type ConfigDraft, draftToWorldConfig, useUiStore } from '../../ui/store';

const MAX_NODES = 10_000;
const { shares, speedKmh } = DEFAULT_ENGINE_CONFIG.mobility;
const pct = (share: number): string => `${Math.round(share * 100)}%`;
const kmh = ([min, max]: readonly [number, number]): string =>
  min === max ? `${min}` : `${min}-${max}`;
const TRAFFIC_LABEL = `Phones on the move: ${pct(shares.foot)} walk, ${pct(shares.bike)} cycle, ${pct(shares.car)} drive`;
const TRAFFIC_SPEEDS = `${kmh(speedKmh.foot)} / ${kmh(speedKmh.bike)} / ${kmh(speedKmh.car)} km/h; at 1× a tick of simulated time takes as long on the clock.`;

function toInt(value: number | string, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback;
}

/** UI-only randomness for the dice; simulation randomness stays inside core's Prng. */
function randomSeed(): number {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return buffer[0] ?? 1;
}

interface SectionProps {
  readonly title: string;
  readonly children: ReactNode;
}

function Section({ title, children }: SectionProps) {
  return (
    <Stack gap="xs">
      <Text size="xs" fw={700} c="dimmed" tt="uppercase" style={{ letterSpacing: '0.08em' }}>
        {title}
      </Text>
      {children}
    </Stack>
  );
}

interface RangeSliderProps {
  readonly label: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step?: number;
  readonly format?: (value: number) => string;
  readonly onChange: (value: number) => void;
  readonly onChangeEnd?: (value: number) => void;
  readonly disabled?: boolean;
}

function LabelledSlider({
  label,
  value,
  min,
  max,
  step = 1,
  format = (v) => String(v),
  onChange,
  onChangeEnd,
  disabled = false,
}: RangeSliderProps) {
  return (
    <div>
      <Group justify="space-between" mb={2}>
        <Text size="xs">{label}</Text>
        <Text size="xs" ff="monospace" c="dimmed">
          {format(value)}
        </Text>
      </Group>
      <Slider
        size="sm"
        value={value}
        min={min}
        max={max}
        step={step}
        label={format}
        onChange={onChange}
        onChangeEnd={onChangeEnd}
        disabled={disabled}
        aria-label={label}
      />
    </div>
  );
}

const metres = (v: number): string => `${v} m`;
const percent = (v: number): string => `${Math.round(v * 100)}%`;

export function ConfigPanel() {
  const draft = useUiStore((s) => s.configDraft);
  const patch = useUiStore((s) => s.patchConfigDraft);
  const deselect = useUiStore((s) => s.deselect);
  const highlightMessage = useUiStore((s) => s.highlightMessage);
  const totalNodes = draft.mobiles + draft.routers + draft.gateways;
  // Seed 42 brings its own map and size; the sliders show it and wait for another seed.
  const krakow = isKrakowSeed(draft.seed);
  const tooMany = totalNodes > MAX_NODES;

  const patchRange = (key: keyof ConfigDraft['range'], value: number): void =>
    patch({ range: { ...draft.range, [key]: value } });

  // New world: selection, highlighted message and path all belong to the old one.
  const generate = (): void => {
    createWorld(draftToWorldConfig(draft), { tickMs: draft.tickMs, mobility: draft.mobility });
    deselect();
  };

  // Same seed, fresh engine: node ids survive, message ids do not, so only the highlight goes.
  const reset = (): void => {
    resetWorld();
    highlightMessage(null);
  };

  return (
    <Stack gap="md" p="md">
      <Section title="Nodes">
        <Group grow gap="xs">
          <NumberInput
            label="Phones"
            size="xs"
            min={0}
            max={MAX_NODES}
            step={5}
            value={draft.mobiles}
            onChange={(v) => patch({ mobiles: toInt(v, draft.mobiles) })}
          />
          <NumberInput
            label="Routers"
            size="xs"
            min={0}
            max={MAX_NODES}
            step={5}
            value={draft.routers}
            onChange={(v) => patch({ routers: toInt(v, draft.routers) })}
          />
          <NumberInput
            label="Gateways"
            size="xs"
            min={0}
            max={20}
            value={draft.gateways}
            onChange={(v) => patch({ gateways: toInt(v, draft.gateways) })}
          />
        </Group>
        {tooMany ? (
          <Text size="xs" c="red">
            {totalNodes} nodes exceeds the {MAX_NODES} limit.
          </Text>
        ) : null}
        <LabelledSlider
          label="Unregistered phones"
          value={draft.unregisteredFraction}
          min={0}
          max={0.5}
          step={0.05}
          format={percent}
          onChange={(v) => patch({ unregisteredFraction: v })}
        />
      </Section>

      <Section title="Radio range">
        <LabelledSlider
          label="Phone"
          value={draft.range.mobile}
          min={20}
          max={300}
          step={5}
          format={metres}
          onChange={(v) => patchRange('mobile', v)}
        />
        <LabelledSlider
          label="Router"
          value={draft.range.router}
          min={20}
          max={400}
          step={5}
          format={metres}
          onChange={(v) => patchRange('router', v)}
        />
        <LabelledSlider
          label="Gateway"
          value={draft.range.gateway}
          min={20}
          max={500}
          step={5}
          format={metres}
          onChange={(v) => patchRange('gateway', v)}
        />
      </Section>

      <Section title="Area">
        <LabelledSlider
          label="Width"
          value={krakow ? KRAKOW_WIDTH : draft.width}
          min={300}
          max={3000}
          step={50}
          format={metres}
          disabled={krakow}
          onChange={(v) => patch({ width: v })}
        />
        <LabelledSlider
          label="Height"
          value={krakow ? KRAKOW_HEIGHT : draft.height}
          min={300}
          max={3000}
          step={50}
          format={metres}
          disabled={krakow}
          onChange={(v) => patch({ height: v })}
        />
        {krakow ? (
          <Text size="xs" c="dimmed">
            Seed {KRAKOW_SEED} loads the {terrainTitle(KRAKOW_TERRAIN_ID)} map ({KRAKOW_WIDTH} ×{' '}
            {KRAKOW_HEIGHT} m); no node stands in the Vistula. Other seeds draw a procedural
            district.
          </Text>
        ) : null}
      </Section>

      <Section title="Time">
        <LabelledSlider
          label="Tick length (simulated time)"
          value={draft.tickMs}
          min={50}
          max={1000}
          step={50}
          format={(v) => `${v} ms`}
          onChange={(v) => patch({ tickMs: v })}
          onChangeEnd={(v) => {
            setTickInterval(v);
            setTickSeconds(v / 1000);
          }}
        />
        <Switch
          label={TRAFFIC_LABEL}
          description={TRAFFIC_SPEEDS}
          size="sm"
          checked={draft.mobility}
          onChange={(event) => {
            const enabled = event.currentTarget.checked;
            patch({ mobility: enabled });
            setMobility(enabled);
          }}
        />
      </Section>

      <Section title="Seed">
        <NumberInput
          size="xs"
          value={draft.seed}
          onChange={(v) => {
            if (typeof v === 'number' && Number.isFinite(v)) patch({ seed: Math.round(v) });
          }}
          allowDecimal={false}
          allowNegative={false}
          hideControls
          aria-label="Seed"
          rightSection={
            <Tooltip label="Random seed">
              <ActionIcon
                variant="subtle"
                size="sm"
                onClick={() => patch({ seed: randomSeed() })}
                aria-label="Random seed"
              >
                <IconDice5 size={16} />
              </ActionIcon>
            </Tooltip>
          }
        />
      </Section>

      <Stack gap="xs" mt="xs">
        <Button size="md" fullWidth onClick={generate} disabled={tooMany}>
          Generate world
        </Button>
        <Button size="sm" variant="default" fullWidth onClick={reset}>
          Reset (same seed)
        </Button>
      </Stack>
    </Stack>
  );
}
