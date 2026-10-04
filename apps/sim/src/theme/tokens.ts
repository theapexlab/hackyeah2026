/**
 * Colour and label tokens shared by React chrome and the canvas renderer. Pure TypeScript:
 * no React, no icons, no DOM, so the renderer and lib/ can import it freely. Icons live in
 * theme/icons.ts.
 */
import type { MantineTheme } from '@mantine/core';
import type { DropReason, EdgeQuality, MessageClass, Mode, TravelMode } from '@pomoc/core';

/** Mantine palette names used by the simulation (subset of DefaultMantineColor). */
export type MantineColorName =
  | 'blue'
  | 'yellow'
  | 'red'
  | 'grape'
  | 'orange'
  | 'teal'
  | 'cyan'
  | 'lime'
  | 'violet'
  | 'gray'
  | 'green'
  | 'pink'
  | 'indigo'
  | 'dark';

export type ColorScheme = 'light' | 'dark';

/** Marker colour of a phone on the move. */
export const TRAVEL_COLOR: Readonly<Record<TravelMode, MantineColorName>> = {
  foot: 'cyan',
  bike: 'indigo',
  car: 'pink',
};

export const TRAVEL_LABEL: Readonly<Record<TravelMode, string>> = {
  foot: 'walking',
  bike: 'cycling',
  car: 'driving',
};

/** Legend and HUD order. */
export const TRAVEL_MODES: readonly TravelMode[] = ['foot', 'bike', 'car'];

/** Ambient colours: banner, node rings, region tints, vignette. */
export const MODE_COLOR: Readonly<Record<Mode, MantineColorName>> = {
  PEACE: 'blue',
  L1: 'yellow',
  L2: 'red',
  L3: 'grape',
};

/** Text colour that reads on the mode's filled background. */
export const MODE_ON_COLOR: Readonly<Record<Mode, string>> = {
  PEACE: 'var(--mantine-color-white)',
  L1: 'var(--mantine-color-black)',
  L2: 'var(--mantine-color-white)',
  L3: 'var(--mantine-color-white)',
};

export const MODE_LABEL: Readonly<Record<Mode, string>> = {
  PEACE: 'PEACE',
  L1: 'L1 DISRUPTION',
  L2: 'L2 DISASTER',
  L3: 'L3 SECURITY',
};

/** Vignette strength per mode (0..1), used as the alpha of the inset shadow. */
export const MODE_VIGNETTE: Readonly<Record<Mode, number>> = {
  PEACE: 0.22,
  L1: 0.45,
  L2: 0.6,
  L3: 0.6,
};

/** Foreground colours: pulses, badges, chips. */
export const CLASS_COLOR: Readonly<Record<MessageClass, MantineColorName>> = {
  LIFE_CRITICAL: 'red',
  SAFETY: 'orange',
  CHECK_IN: 'teal',
  INFO: 'cyan',
  LEND: 'lime',
  BORROW: 'lime',
  GIVE: 'lime',
  SELL: 'lime',
  OFFICIAL_ALERT: 'violet',
  MODE_DECLARATION: 'violet',
  TOPOLOGY: 'gray',
  PORTAL_SUMMARY: 'gray',
};

/** Badge on a node that sees open requests: the lime of the commerce classes. */
export const OPEN_REQUEST_COLOR: MantineColorName = CLASS_COLOR.LEND;

export const DROP_REASON_LABEL: Readonly<Record<DropReason, string>> = {
  UNVERIFIABLE: 'Unverifiable signature',
  DUPLICATE: 'Duplicate',
  RELAY_CANNOT_ACT: 'Relay cannot act',
  CLASS_NOT_ALLOWED: 'Class not allowed in mode',
  PRICED_IN_EMERGENCY: 'Priced in emergency',
  TTL_EXPIRED: 'TTL expired',
  HOP_LIMIT: 'Hop limit reached',
  OUT_OF_REGION: 'Outside region',
  NO_ROUTE: 'No route',
  CONGESTION: 'Congestion',
  NODE_DOWN: 'Node down',
};

/**
 * Presentation split of the drop reasons: "rejected by policy" draws in the danger colour
 * (bursts, badges, log rows); everything else is a packet that ran out (TTL, hops, route,
 * capacity, power) or the normal cost of flooding (DUPLICATE) and draws dim. The reasons
 * themselves come from core; only the colouring is decided here.
 */
export const REJECTION_REASONS: ReadonlySet<DropReason> = new Set<DropReason>([
  'UNVERIFIABLE',
  'RELAY_CANNOT_ACT',
  'CLASS_NOT_ALLOWED',
  'PRICED_IN_EMERGENCY',
  'OUT_OF_REGION',
]);

export function isRejection(reason: DropReason): boolean {
  return REJECTION_REASONS.has(reason);
}

/** CSS variable for a mode colour; usable in SVG `style` and inline styles. */
export function modeColorVar(mode: Mode, shade: number | 'filled' | 'light' = 'filled'): string {
  return `var(--mantine-color-${MODE_COLOR[mode]}-${shade})`;
}

/** CSS variable for a class colour. */
export function classColorVar(
  cls: MessageClass,
  shade: number | 'filled' | 'light' = 'filled',
): string {
  return `var(--mantine-color-${CLASS_COLOR[cls]}-${shade})`;
}

/** Concrete colours for the canvas, which cannot read CSS variables cheaply per frame. */
export interface Palette {
  readonly scheme: ColorScheme;
  /** Canvas clear colour; keep in sync with `.pomoc-map` in map.css. */
  readonly background: string;
  readonly worldFill: string;
  readonly worldStroke: string;
  readonly edge: Readonly<Record<EdgeQuality, string>>;
  readonly edgeWidth: number;
  readonly range: string;
  /** Basemap: street strokes, park and water fills, district and river captions. */
  readonly streetMinor: string;
  readonly streetMajor: string;
  readonly park: string;
  readonly water: string;
  readonly label: string;
  readonly waterLabel: string;
  /** Rejection bursts. */
  readonly danger: string;
  /** Exhaustion bursts (TTL, hop limit, no route). */
  readonly muted: string;
  /** Highest-contrast ink: white-hot pulse core in dark, near-black in light; trail fallback. */
  readonly highlight: string;
  readonly mode: Readonly<Record<Mode, string>>;
  readonly cls: Readonly<Record<MessageClass, string>>;
  /** Pulse compositing: additive glow in dark, plain in light. */
  readonly blend: GlobalCompositeOperation;
}

/** '#rrggbb' + alpha -> 'rgba(r,g,b,a)'. Non-hex input is returned untouched. */
export function withAlpha(hex: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m || m[1] === undefined) return hex;
  const n = Number.parseInt(m[1], 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  return `rgba(${r},${g},${b},${alpha})`;
}

function mapRecord<K extends string, V>(
  keys: readonly K[],
  fn: (key: K) => V,
): Readonly<Record<K, V>> {
  const out = {} as Record<K, V>;
  for (const key of keys) out[key] = fn(key);
  return out;
}

const MODES: readonly Mode[] = ['PEACE', 'L1', 'L2', 'L3'];
const CLASSES = Object.keys(CLASS_COLOR) as MessageClass[];

/**
 * Resolve hex values from the Mantine theme. Class and mode colours use shade 4 in dark
 * (bright on #0d1117) and shade 6 in light (saturated enough to read on white); greys are
 * picked per scheme so edges, streets and bursts keep similar contrast in both.
 */
export function resolvePalette(theme: MantineTheme, scheme: ColorScheme): Palette {
  const dark = scheme === 'dark';
  const shade = dark ? 4 : 6;
  const hex = (name: MantineColorName): string => theme.colors[name][shade];
  const gray = theme.colors.gray;
  return {
    scheme,
    background: dark ? '#0d1117' : '#f3f5f9',
    worldFill: dark ? '#111722' : '#ffffff',
    worldStroke: dark ? withAlpha(gray[6], 0.6) : withAlpha(gray[5], 0.8),
    edge: {
      near: dark ? withAlpha(gray[4], 0.55) : withAlpha(gray[7], 0.55),
      medium: dark ? withAlpha(gray[5], 0.4) : withAlpha(gray[6], 0.45),
      far: dark ? withAlpha(gray[6], 0.28) : withAlpha(gray[5], 0.4),
    },
    edgeWidth: 1.25,
    range: dark ? withAlpha(theme.colors.blue[4], 0.1) : withAlpha(theme.colors.blue[6], 0.08),
    streetMinor: dark ? withAlpha(gray[6], 0.4) : withAlpha(gray[4], 0.6),
    streetMajor: dark ? withAlpha(gray[5], 0.5) : withAlpha(gray[5], 0.75),
    park: dark ? withAlpha(theme.colors.teal[7], 0.14) : withAlpha(theme.colors.teal[3], 0.22),
    // Light: a pale map blue over the white plane; dark: a muted navy that stays readable.
    water: dark ? withAlpha(theme.colors.blue[8], 0.3) : withAlpha(theme.colors.blue[2], 0.85),
    label: dark ? withAlpha(gray[5], 0.75) : withAlpha(gray[7], 0.7),
    waterLabel: dark ? withAlpha(theme.colors.blue[4], 0.7) : withAlpha(theme.colors.blue[7], 0.75),
    danger: theme.colors.red[dark ? 5 : 7],
    muted: dark ? gray[5] : gray[6],
    highlight: dark ? '#ffffff' : gray[9],
    mode: mapRecord(MODES, (mode) => hex(MODE_COLOR[mode])),
    cls: mapRecord(CLASSES, (cls) => hex(CLASS_COLOR[cls])),
    blend: dark ? 'lighter' : 'source-over',
  };
}
