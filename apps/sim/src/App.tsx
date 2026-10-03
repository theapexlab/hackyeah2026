import { AppShell, ScrollArea, useMantineColorScheme } from '@mantine/core';
import { useEffect } from 'react';
import { BottomStrip } from './features/bottom/BottomStrip';
import { ConfigPanel } from './features/config/ConfigPanel';
import { EventsPanel } from './features/events/EventsPanel';
import { ShortcutsModal } from './features/events/ShortcutsModal';
import { InspectorDrawer } from './features/inspector/InspectorDrawer';
import { MapView } from './features/map/MapView';
import { TopBar } from './features/topbar/TopBar';
import { startPlayback } from './sim/playback';
import { useSimStore } from './sim/store';
import { useHotkeys } from './ui/hotkeys';
import { useUIStore, worldFromDraft } from './ui/store';

export default function App() {
  const selected = useUIStore((s) => s.selectedNodeId);
  const navOpen = useUIStore((s) => s.navOpen);
  const { toggleColorScheme } = useMantineColorScheme();

  useHotkeys({ toggleScheme: toggleColorScheme });

  // Create the first world before children read the snapshot; idempotent under StrictMode.
  if (!useSimStore.getState().engine) {
    const { configDraft } = useUIStore.getState();
    useSimStore.getState().setTickIntervalMs(configDraft.tickMs);
    useSimStore.getState().createWorld(worldFromDraft(configDraft), configDraft.mobility);
  }

  useEffect(() => startPlayback(), []);

  return (
    <AppShell
      header={{ height: 64 }}
      navbar={{ width: 300, breakpoint: 'sm', collapsed: { mobile: !navOpen, desktop: !navOpen } }}
      aside={{ width: 380, breakpoint: 'sm', collapsed: { mobile: !selected, desktop: !selected } }}
      footer={{ height: 200 }}
      padding={0}
    >
      <AppShell.Header>
        <TopBar />
      </AppShell.Header>

      <AppShell.Navbar>
        <ScrollArea h="100%" type="auto">
          <EventsPanel />
          <ConfigPanel />
        </ScrollArea>
      </AppShell.Navbar>

      <AppShell.Main style={{ display: 'flex', height: '100dvh' }}>
        <MapView />
      </AppShell.Main>

      <AppShell.Aside>
        <InspectorDrawer />
      </AppShell.Aside>

      <AppShell.Footer>
        <BottomStrip />
      </AppShell.Footer>

      <ShortcutsModal />
    </AppShell>
  );
}
