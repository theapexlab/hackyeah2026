import { Badge, Group, Paper, Stack, Text } from '@mantine/core';
import type { MessageView, NodeId } from '@pomoc/core';
import type { ReactNode } from 'react';
import { formatClass, formatHops, formatPayload, formatTick, ttlRemaining } from '../../lib/format';
import { CLASS_COLOR, classColorVar } from '../../theme/tokens';
import { useUiStore } from '../../ui/store';

export interface MessageCardProps {
  readonly message: MessageView;
  readonly tick: number;
  /** Hop count of this copy (inbox / store entries). */
  readonly hop?: number;
  /** Recorded path of this copy; chips plus the highlight chain on the map. */
  readonly path?: readonly NodeId[];
  /** Extra badges (status, stored tick, ...). */
  readonly badges?: ReactNode;
  /** Extra controls under the body (Accept button, ...). */
  readonly actions?: ReactNode;
}

/**
 * One message as the inspector shows it. Clicking toggles the highlight on the map
 * (flood trail from the transit buffer plus this copy's recorded path).
 */
export function MessageCard({ message, tick, hop, path, badges, actions }: MessageCardProps) {
  const highlighted = useUiStore((s) => s.highlightedMessageId === message.id);
  const highlight = useUiStore((s) => s.highlightMessage);
  const ttl = ttlRemaining(message, tick);
  const color = CLASS_COLOR[message.class];
  const forged = !message.signer.valid;

  return (
    <Paper
      withBorder
      radius="md"
      p="xs"
      onClick={() => highlight(highlighted ? null : message.id, path ?? null)}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter') highlight(highlighted ? null : message.id, path ?? null);
      }}
      style={{
        cursor: 'pointer',
        borderLeft: `4px solid ${classColorVar(message.class)}`,
        outline: highlighted ? `2px solid ${classColorVar(message.class)}` : undefined,
      }}
    >
      <Stack gap={6}>
        <Group gap={6} justify="space-between" wrap="nowrap">
          <Group gap={6} wrap="nowrap">
            <Badge color={color} variant="filled" size="sm">
              {formatClass(message.class)}
            </Badge>
            {forged ? (
              <Badge color="red" variant="outline" size="sm">
                forged
              </Badge>
            ) : null}
            {badges}
          </Group>
          <Text size="xs" ff="monospace" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
            {message.id}
          </Text>
        </Group>
        <Text size="sm" lineClamp={3}>
          {formatPayload(message.payload)}
        </Text>
        <Group gap="xs" wrap="wrap">
          <Text size="xs" c="dimmed">
            from <b>{message.originId}</b>
          </Text>
          {hop !== undefined ? (
            <Text size="xs" c="dimmed">
              hop {message.unbounded ? `${hop} (unbounded)` : formatHops(hop, message.hopLimit)}
            </Text>
          ) : (
            <Text size="xs" c="dimmed">
              hop limit {message.unbounded ? 'unbounded' : (message.hopLimit ?? '–')}
            </Text>
          )}
          <Text size="xs" c={ttl < 0 ? 'red' : 'dimmed'}>
            ttl {ttl < 0 ? 'expired' : `${ttl} ticks`}
          </Text>
          <Text size="xs" c="dimmed">
            t{formatTick(message.createdTick)}
          </Text>
          {message.region ? (
            <Text size="xs" c="dimmed">
              regional
            </Text>
          ) : null}
        </Group>
        {path && path.length > 0 ? (
          <Group gap={4} wrap="wrap">
            {path.map((id) => (
              <Badge key={id} variant="default" size="xs" ff="monospace">
                {id}
              </Badge>
            ))}
          </Group>
        ) : null}
        {actions ? (
          <div
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          >
            {actions}
          </div>
        ) : null}
      </Stack>
    </Paper>
  );
}
