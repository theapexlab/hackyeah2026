import {
  Button,
  Group,
  NumberInput,
  SegmentedControl,
  Select,
  Stack,
  Text,
  Textarea,
} from '@mantine/core';
import {
  CREDENTIAL_ORIGINS,
  canOriginate,
  hopLimitFor,
  type MessageClass,
  MODE_LABELS,
  MODE_POLICIES,
  type NodeDetail,
} from '@pomoc/core';
import { useState } from 'react';
import { formatClass } from '../../../lib/format';
import { simCommands } from '../../../sim/commands';

type CheckIn = 'OK' | 'NEED_EVACUATION' | 'TRAPPED';

export function MobileActions({ detail }: { detail: NodeDetail }) {
  const policy = MODE_POLICIES[detail.mode];
  const offLabel = `off in ${MODE_LABELS[detail.mode]}`;
  const classes = CREDENTIAL_ORIGINS[detail.credentialKind];
  const enabled = classes.filter((c) => policy.originClasses.includes(c));

  const [picked, setPicked] = useState<MessageClass | null>(null);
  const [text, setText] = useState('Need help nearby');
  const [hop, setHop] = useState<number | null>(null);
  const [price, setPrice] = useState<number | null>(null);
  const [status, setStatus] = useState<CheckIn>('OK');

  const cls = picked && enabled.includes(picked) ? picked : (enabled[0] ?? null);
  const maxHop = cls ? hopLimitFor(policy, cls) : policy.hopLimit;
  const checkInAllowed =
    canOriginate(detail.credentialKind, 'CHECK_IN') && policy.originClasses.includes('CHECK_IN');
  const open = detail.requestView.filter((r) => r.status === 'open');

  return (
    <Stack gap="md">
      <Stack gap="xs">
        <Text fw={600} size="sm">
          Send request
        </Text>
        {classes.length === 0 && (
          <Text size="xs" c="orange">
            {detail.credentialKind === 'none' ? 'Unregistered' : detail.credentialKind} credential
            cannot originate messages.
          </Text>
        )}
        <Select
          label="Class"
          size="xs"
          allowDeselect={false}
          data={classes.map((c) => ({
            value: c,
            label: policy.originClasses.includes(c)
              ? formatClass(c)
              : `${formatClass(c)} (${offLabel})`,
            disabled: !policy.originClasses.includes(c),
          }))}
          value={cls}
          onChange={(v) => setPicked(v as MessageClass | null)}
        />
        <Textarea
          label="Message"
          size="xs"
          autosize
          minRows={2}
          value={text}
          onChange={(e) => setText(e.currentTarget.value)}
        />
        <NumberInput
          label="Hop limit"
          size="xs"
          min={1}
          max={Number.isFinite(maxHop) ? maxHop : undefined}
          value={hop ?? policy.hopLimit}
          onChange={(v) => setHop(typeof v === 'number' ? v : null)}
        />
        {policy.paymentsAllowed && (
          <NumberInput
            label="Price (optional)"
            size="xs"
            min={0}
            value={price ?? ''}
            onChange={(v) => setPrice(typeof v === 'number' ? v : null)}
          />
        )}
        <Button
          size="xs"
          disabled={!cls}
          onClick={() =>
            cls &&
            simCommands.sendRequest(detail.id, cls, text, {
              hopLimit: hop ?? undefined,
              price: policy.paymentsAllowed ? (price ?? undefined) : undefined,
            })
          }
        >
          Send request
        </Button>
      </Stack>

      <Stack gap="xs">
        <Text fw={600} size="sm">
          Check in
        </Text>
        <SegmentedControl
          aria-label="Check-in status"
          size="xs"
          fullWidth
          value={status}
          onChange={(v) => setStatus(v as CheckIn)}
          data={[
            { label: "I'm OK", value: 'OK' },
            { label: 'Evacuate', value: 'NEED_EVACUATION' },
            { label: 'Trapped', value: 'TRAPPED' },
          ]}
        />
        <Button
          size="xs"
          variant="light"
          disabled={!checkInAllowed}
          onClick={() => simCommands.sendCheckIn(detail.id, status)}
        >
          {checkInAllowed ? 'Send check-in' : `Check-in ${offLabel}`}
        </Button>
      </Stack>

      <Stack gap="xs">
        <Text fw={600} size="sm">
          Open requests seen here ({open.length})
        </Text>
        {open.slice(0, 8).map((r) => (
          <Group key={r.msgId} justify="space-between" wrap="nowrap" gap="xs">
            <Text size="xs" truncate>
              {r.msgId} &middot; hop {r.hop}
            </Text>
            <Button
              size="compact-xs"
              aria-label={`Accept request ${r.msgId}`}
              onClick={() => simCommands.accept(detail.id, r.msgId)}
            >
              Accept
            </Button>
          </Group>
        ))}
      </Stack>
    </Stack>
  );
}
