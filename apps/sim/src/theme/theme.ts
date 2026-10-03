import type { MantineThemeOverride } from '@mantine/core';
import { classColors, modeColors } from './tokens';

declare module '@mantine/core' {
  export interface MantineThemeColorsOverride {
    other: {
      modeColor: Record<string, string>;
      classColor: Record<string, string>;
    };
  }
}

export function createTheme(): MantineThemeOverride {
  return {
    fontFamily: 'system-ui, -apple-system, sans-serif',
    fontFamilyMonospace: 'source-code-pro, menlo, monospace',
    headings: {
      fontFamily: 'system-ui, -apple-system, sans-serif',
    },
    spacing: {
      xs: '0.5rem',
      sm: '0.75rem',
      md: '1rem',
      lg: '1.5rem',
      xl: '2rem',
    },
    components: {
      AppShell: {
        defaultProps: {
          header: { height: 56 },
          navbar: { width: 300, breakpoint: 'sm' },
          aside: { width: 380, breakpoint: 'md' },
          footer: { height: 200 },
        },
      },
    },
    other: {
      modeColor: modeColors,
      classColor: classColors,
    },
  };
}
