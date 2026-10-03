import { Container, Text, Title } from '@mantine/core';
import { CORE_VERSION } from '@pomoc/core';

export function App() {
  return (
    <Container py="xl">
      <Title order={2}>Pomóc simulation</Title>
      <Text c="dimmed">core {CORE_VERSION} — scaffold</Text>
    </Container>
  );
}
