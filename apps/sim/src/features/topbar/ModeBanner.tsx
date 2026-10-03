import { Box } from '@mantine/core';
import type { Mode } from '@pomoc/core';
import type { ReactNode } from 'react';
import { MODE_LABEL, MODE_ON_COLOR, modeColorVar } from '../../theme/tokens';

interface ModeBannerProps {
  readonly mode: Mode;
  readonly children?: ReactNode;
}

/** Full-width header strip tinted by the global mode, with a solid mode label block on the left. */
export function ModeBanner({ mode, children }: ModeBannerProps) {
  const color = modeColorVar(mode);
  return (
    <Box
      h="100%"
      pr="sm"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--mantine-spacing-sm)',
        background: `color-mix(in srgb, ${color} 18%, var(--mantine-color-body))`,
        borderBottom: `3px solid ${color}`,
        transition: 'background-color 600ms ease, border-color 600ms ease',
      }}
    >
      <Box
        px="md"
        h="100%"
        aria-live="polite"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minWidth: 200,
          background: color,
          color: MODE_ON_COLOR[mode],
          fontWeight: 800,
          fontSize: 'var(--mantine-font-size-lg)',
          letterSpacing: '0.1em',
          transition: 'background-color 600ms ease, color 600ms ease',
        }}
      >
        {MODE_LABEL[mode]}
      </Box>
      {children}
    </Box>
  );
}
