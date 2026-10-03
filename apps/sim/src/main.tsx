import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import './styles.css';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { useSimStore } from './sim/store';
import { createTheme } from './theme/theme';
import { useUIStore } from './ui/store';

const root = document.getElementById('root');
if (!root) throw new Error('#root missing');

createRoot(root).render(
  <StrictMode>
    <MantineProvider defaultColorScheme="dark" theme={createTheme()}>
      <Notifications
        position="top-center"
        limit={3}
        containerWidth={360}
        styles={{
          root: { top: 76, pointerEvents: 'none' },
          notification: { pointerEvents: 'auto' },
        }}
      />
      <App />
    </MantineProvider>
  </StrictMode>,
);

if (import.meta.env.DEV) Object.assign(window, { __pomoc: { sim: useSimStore, ui: useUIStore } });
