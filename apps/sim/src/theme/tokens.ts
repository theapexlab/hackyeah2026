import type { MantineTheme } from '@mantine/core';
import type { MessageClass, Mode, NodeKind } from '@pomoc/core';

export type Scheme = 'light' | 'dark';

export const modeColorName: Record<Mode, string> = {
  PEACE: 'blue',
  L1: 'yellow',
  L2: 'red',
  L3: 'grape',
};

export const classColorName: Record<MessageClass, string> = {
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

export const MODE_ORDER: readonly Mode[] = ['PEACE', 'L1', 'L2', 'L3'];

export const cssColor = (name: string): string =>
  `light-dark(var(--mantine-color-${name}-6), var(--mantine-color-${name}-4))`;

export const modeCss = (mode: Mode): string => cssColor(modeColorName[mode]);
export const classCss = (cls: string): string =>
  cssColor(classColorName[cls as MessageClass] ?? 'gray');

export const kindLabel: Record<NodeKind, string> = {
  mobile: 'Phone',
  router: 'ISP router',
  gateway: 'Gateway',
};

export interface Palette {
  scheme: Scheme;
  bg: string;
  world: string;
  street: string;
  edge: Record<'near' | 'medium' | 'far', string>;
  mode: Record<Mode, string>;
  cls: Record<MessageClass, string>;
  drop: string;
  store: string;
  backhaul: string;
  range: string;
  blend: GlobalCompositeOperation;
}

const shade = (theme: MantineTheme, name: string, idx: number): string =>
  theme.colors[name]?.[idx] ?? '#868e96';

export function resolvePalette(theme: MantineTheme, scheme: Scheme): Palette {
  const idx = scheme === 'dark' ? 4 : 6;
  const dark = scheme === 'dark';
  return {
    scheme,
    bg: dark ? shade(theme, 'dark', 8) : shade(theme, 'gray', 0),
    world: dark ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.035)',
    street: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.09)',
    edge: dark
      ? {
          near: 'rgba(190,210,255,0.55)',
          medium: 'rgba(190,210,255,0.32)',
          far: 'rgba(190,210,255,0.16)',
        }
      : { near: 'rgba(30,50,90,0.6)', medium: 'rgba(30,50,90,0.38)', far: 'rgba(30,50,90,0.2)' },
    mode: Object.fromEntries(
      (Object.keys(modeColorName) as Mode[]).map((m) => [m, shade(theme, modeColorName[m], idx)]),
    ) as Record<Mode, string>,
    cls: Object.fromEntries(
      (Object.keys(classColorName) as MessageClass[]).map((c) => [
        c,
        shade(theme, classColorName[c], idx),
      ]),
    ) as Record<MessageClass, string>,
    drop: shade(theme, 'red', idx),
    store: shade(theme, 'yellow', idx),
    backhaul: shade(theme, 'green', idx),
    range: dark ? 'rgba(120,200,255,0.35)' : 'rgba(20,90,160,0.4)',
    blend: dark ? 'lighter' : 'source-over',
  };
}
