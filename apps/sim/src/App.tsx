import { AppShell, Divider, ScrollArea } from '@mantine/core';
import { BottomStrip } from './features/bottom/BottomStrip';
import { ConfigPanel } from './features/config/ConfigPanel';
import { EventsPanel } from './features/events/EventsPanel';
import { ShortcutsModal } from './features/events/ShortcutsModal';
import { InspectorDrawer } from './features/inspector/InspectorDrawer';
import { MapView } from './features/map/MapView';
import { TopBar } from './features/topbar/TopBar';
import { useAppHotkeys } from './ui/hotkeys';
import { useUiStore } from './ui/store';

export function App() {
  useAppHotkeys();
  const navOpen = useUiStore((s) => s.navOpen);
  const hasSelection = useUiStore((s) => s.selectedNodeId !== null);

  return (
    <AppShell
      header={{ height: 56 }}
      navbar={{ width: 300, breakpoint: 'sm', collapsed: { desktop: !navOpen, mobile: !navOpen } }}
      aside={{
        width: 380,
        breakpoint: 'sm',
        collapsed: { desktop: !hasSelection, mobile: !hasSelection },
      }}
      footer={{ height: 200 }}
      padding={0}
      // Collapse navbar/aside in the same layout pass: MapView's fit-to-world effect then reads
      // the final container width, and the canvas backing store is resized once, not per frame.
      transitionDuration={0}
    >
      <AppShell.Header>
        <TopBar />
      </AppShell.Header>

      <AppShell.Navbar>
        <AppShell.Section grow component={ScrollArea}>
          <EventsPanel />
          <Divider />
          <ConfigPanel />
        </AppShell.Section>
      </AppShell.Navbar>

      <AppShell.Main
        style={{
          // Mantine pads Main by the header/footer offsets; with border-box the map band is what is left.
          boxSizing: 'border-box',
          height: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
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
