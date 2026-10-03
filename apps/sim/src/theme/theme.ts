import { createTheme } from '@mantine/core';
import { CLASS_COLOR, MODE_COLOR } from './tokens';

declare module '@mantine/core' {
  export interface MantineThemeOther {
    modeColor: typeof MODE_COLOR;
    classColor: typeof CLASS_COLOR;
  }
}

/** Offline-safe system font stack; sizes one step up for projection. */
export const theme = createTheme({
  primaryColor: 'blue',
  fontFamily:
    'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  fontFamilyMonospace:
    'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
  fontSizes: {
    xs: '0.8125rem',
    sm: '0.9375rem',
    md: '1.0625rem',
    lg: '1.25rem',
    xl: '1.5rem',
  },
  headings: { fontWeight: '700' },
  defaultRadius: 'md',
  other: { modeColor: MODE_COLOR, classColor: CLASS_COLOR },
});
