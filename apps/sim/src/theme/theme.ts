import { createTheme as createMantineTheme } from '@mantine/core';
import type { MessageClass, Mode } from '@pomoc/core';
import { classColorName, modeColorName } from './tokens';

declare module '@mantine/core' {
  export interface MantineThemeOther {
    modeColor: Record<Mode, string>;
    classColor: Record<MessageClass, string>;
  }
}

export function createTheme() {
  return createMantineTheme({
    fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    fontFamilyMonospace: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSizes: { xs: '0.8125rem', sm: '0.9375rem', md: '1.0625rem', lg: '1.25rem', xl: '1.5rem' },
    other: { modeColor: modeColorName, classColor: classColorName },
  });
}
