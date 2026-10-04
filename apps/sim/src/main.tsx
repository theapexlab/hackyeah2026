import '@mantine/core/styles.css';
import './app.css';
import { MantineProvider } from '@mantine/core';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { theme } from './theme/theme';
import { useUiStore } from './ui/store';

async function bootstrap(): Promise<void> {
  // Dev-only visual check while the engine is a stub: ?fixture=1 serves a fabricated world.
  // The whole block is dead code in production builds, so dev/fixture.ts is never bundled.
  const fixture =
    import.meta.env.DEV && new URLSearchParams(window.location.search).get('fixture') === '1';
  if (fixture) {
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
  // The demo opens already running (the frozen fixture has nothing to play).
  if (!fixture) useUiStore.getState().setPlaying(true);
}

void bootstrap();
