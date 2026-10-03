import { Container, Text, Title } from '@mantine/core';
import { createEngine, DEFAULT_WORLD_CONFIG } from '@pomoc/core';

const engine = createEngine(DEFAULT_WORLD_CONFIG);

export function App() {
  const snapshot = engine.getSnapshot();
  return (
    <Container py="xl">
      <Title order={2}>Pomóc simulation</Title>
      <Text c="dimmed">
        engine stub · tick {snapshot.tick} · seed {snapshot.world.seed} · {snapshot.nodes.length}{' '}
        nodes
      </Text>
    </Container>
  );
}
