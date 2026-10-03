import type { MessageClass, Mode } from '@pomoc/core';

export const modeColors: Record<Mode, string> = {
  PEACE: '#4dabf7',
  L1: '#ffd43b',
  L2: '#ff6b6b',
  L3: '#c084fc',
};

export const classColors: Record<MessageClass, string> = {
  LIFE_CRITICAL: '#ff4757',
  SAFETY: '#ffa502',
  CHECK_IN: '#20c997',
  INFO: '#22b8cf',
  LEND: '#a3e635',
  BORROW: '#a3e635',
  GIVE: '#a3e635',
  SELL: '#a3e635',
  OFFICIAL_ALERT: '#da77f2',
  MODE_DECLARATION: '#da77f2',
  TOPOLOGY: '#868e96',
  PORTAL_SUMMARY: '#868e96',
};

export const kindIcons: Record<string, string> = {
  mobile: 'device-mobile',
  router: 'wifi',
  gateway: 'antenna-2',
};

export function resolvePalette(scheme: 'light' | 'dark') {
  return scheme === 'dark' ? darkPalette : lightPalette;
}

const darkPalette = {
  grid: 'rgba(255, 255, 255, 0.05)',
  edge: 'rgba(255, 255, 255, 0.1)',
  drop: '#ff6b6b',
  store: '#ffd43b',
  backhaul: '#51cf66',
};

const lightPalette = {
  grid: 'rgba(0, 0, 0, 0.1)',
  edge: 'rgba(0, 0, 0, 0.2)',
  drop: '#ff5252',
  store: '#ffc107',
  backhaul: '#4caf50',
};
