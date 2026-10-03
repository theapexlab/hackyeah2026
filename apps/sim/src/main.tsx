import '@mantine/core/styles.css';
import './app.css';
import { MantineProvider } from '@mantine/core';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { theme } from './theme/theme';

async function bootstrap(): Promise<void> {
  // Dev-only visual check while the engine is a stub: ?fixture=1 serves a fabricated world.
  // The whole block is dead code in production builds, so dev/fixture.ts is never bundled.
  if (import.meta.env.DEV && new URLSearchParams(window.location.search).get('fixture') === '1') {
    const { installFixture } = await import('./dev/fixture');
    installFixture();
  }

  const root = document.getElementById('root');
  if (!root) throw new Error('Missing #root element');
  createRoot(root).render(
    <StrictMode>
      <MantineProvider theme={theme} defaultColorScheme="dark">
        <App />
      </MantineProvider>
    </StrictMode>,
  );
}

void bootstrap();
