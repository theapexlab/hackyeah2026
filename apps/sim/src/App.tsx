import { AppShell } from '@mantine/core';
import { DEFAULT_WORLD_CONFIG } from '@pomoc/core';
import { useEffect } from 'react';
import { BottomStrip } from './features/bottom/BottomStrip';
import { ConfigPanel } from './features/config/ConfigPanel';
import { EventsPanel } from './features/events/EventsPanel';
import { ShortcutsModal } from './features/events/ShortcutsModal';
import { InspectorDrawer } from './features/inspector/InspectorDrawer';
import { MapView } from './features/map/MapView';
import { TopBar } from './features/topbar/TopBar';
import { playback } from './sim/playback';
import { useSimStore } from './sim/store';
import { useHotkeys } from './ui/hotkeys';
import { useUIStore } from './ui/store';

export default function App() {
  const selectedNodeId = useUIStore((s) => s.selectedNodeId);
  const navOpen = useUIStore((s) => s.navOpen);

  // Initialize hotkeys
  useHotkeys();

  // Generate initial world on mount
  useEffect(() => {
    const createWorld = useSimStore.getState().createWorld;
    createWorld(DEFAULT_WORLD_CONFIG);
  }, []);

  // Clean up playback on unmount
  useEffect(() => {
    return () => {
      playback.stop();
    };
  }, []);

  return (
    <AppShell
      header={{ height: 56 }}
      navbar={{ width: 300, breakpoint: 'sm', collapsed: { mobile: !navOpen } }}
      aside={{
        width: 380,
        breakpoint: 'md',
        collapsed: { mobile: !selectedNodeId, desktop: !selectedNodeId },
      }}
      footer={{ height: 200 }}
      padding={0}
    >
      <AppShell.Header>
        <TopBar />
      </AppShell.Header>

      <AppShell.Navbar p={0} style={{ display: 'flex', flexDirection: 'column' }}>
        <EventsPanel />
        <div style={{ flex: 1, overflowY: 'auto' }} />
        <ConfigPanel />
      </AppShell.Navbar>

      <AppShell.Main style={{ display: 'flex', height: '100dvh', minHeight: 0 }}>
        <MapView />
      </AppShell.Main>

      <AppShell.Aside>
        <InspectorDrawer />
      </AppShell.Aside>

      <AppShell.Footer p={0}>
        <BottomStrip />
      </AppShell.Footer>

      <ShortcutsModal />
    </AppShell>
  );
}
