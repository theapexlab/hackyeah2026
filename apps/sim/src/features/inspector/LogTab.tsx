import { Stack, Text } from '@mantine/core';
import type { NodeDetail } from '@pomoc/core';
import { eventKey } from '../../lib/eventText';
import { EventRow } from '../bottom/EventRow';

interface LogTabProps {
  readonly detail: NodeDetail;
}

const MAX_ROWS = 150;

/** This node's own events, newest last. */
export function LogTab({ detail }: LogTabProps) {
  if (detail.log.length === 0) {
    return (
      <Text size="sm" c="dimmed" py="sm">
        No events for this node yet.
      </Text>
    );
  }
  const rows = detail.log.slice(-MAX_ROWS);
  return (
    <Stack gap={0} py="xs">
      {detail.log.length > MAX_ROWS ? (
        <Text size="xs" c="dimmed" px={6}>
          … {detail.log.length - MAX_ROWS} older events hidden
        </Text>
      ) : null}
      {rows.map((event) => (
        <EventRow key={eventKey(event)} event={event} />
      ))}
    </Stack>
  );
}
