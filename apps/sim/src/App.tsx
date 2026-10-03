import { AppShell, Container, Text } from '@mantine/core';

export default function App() {
  return (
    <AppShell>
      <AppShell.Main>
        <Container>
          <Text size="xl" fw={700}>
            Pomóc sim
          </Text>
        </Container>
      </AppShell.Main>
    </AppShell>
  );
}
