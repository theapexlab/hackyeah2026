import {
  Alert,
  Badge,
  Button,
  Group,
  NumberInput,
  SegmentedControl,
  Select,
  Stack,
  Switch,
  Text,
  Textarea,
} from '@mantine/core';
import type {
  CheckInStatus,
  MessageClass,
  MessageView,
  NodeDetail,
  NodeView,
  RequestPayload,
} from '@pomoc/core';
import {
  CITIZEN_REQUEST_CLASSES,
  COMMERCE_CLASSES,
  canOriginate,
  classAllowedToOriginate,
  isPriced,
  MODE_POLICIES,
} from '@pomoc/core';
import { IconSend } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { formatCheckIn, formatClass, formatRequestStatus } from '../../../lib/format';
import { acceptRequest, sendCheckIn, sendRequest, setNodePowered } from '../../../sim/commands';
import { useSimStore } from '../../../sim/store';
import { CLASS_COLOR, MODE_LABEL } from '../../../theme/tokens';
import { MessageCard } from '../MessageCard';

interface MobileActionsProps {
  readonly node: NodeView;
  readonly detail: NodeDetail;
  readonly tick: number;
}

const CHECK_IN_OPTIONS: readonly CheckInStatus[] = ['OK', 'NEED_EVACUATION', 'TRAPPED'];
function isCheckInStatus(value: string): value is CheckInStatus {
  return (CHECK_IN_OPTIONS as readonly string[]).includes(value);
}
const CHECK_IN_COLOR: Readonly<Record<CheckInStatus, string>> = {
  OK: 'green',
  NEED_EVACUATION: 'orange',
  TRAPPED: 'red',
};

function isRequestClass(value: string | null): value is MessageClass {
  return value !== null && (CITIZEN_REQUEST_CLASSES as readonly string[]).includes(value);
}

function toNumber(value: number | string, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * Request composer. Every rule comes from core: the credential's origin rights (trust table),
 * the mode policy's origin classes and payment flag, and the policy's hop cap. The engine
 * validates again on dispatch; this form only avoids offering what it would reject.
 */
function SendRequestForm({ node }: { readonly node: NodeView }) {
  const policy = MODE_POLICIES[node.mode];
  const allowed = CITIZEN_REQUEST_CLASSES.filter(
    (cls) => canOriginate(node.credentialKind, cls) && classAllowedToOriginate(policy, cls),
  );
  const [chosen, setChosen] = useState<MessageClass | null>(null);
  const [text, setText] = useState('');
  const [hopLimit, setHopLimit] = useState<number | null>(null);
  const [price, setPrice] = useState<number | null>(null);

  // Derive the effective values so a mode change never leaves the form in a forbidden state.
  const cls = chosen !== null && allowed.includes(chosen) ? chosen : (allowed[0] ?? null);
  const hops = Math.min(policy.maxHopLimit, Math.max(1, hopLimit ?? policy.hopLimit));
  const priceable = cls !== null && policy.paymentsAllowed && COMMERCE_CLASSES.includes(cls);
  const body = text.trim() || (cls === null ? '' : `${formatClass(cls)} request from ${node.id}`);
  const payload: RequestPayload =
    priceable && price !== null && price > 0
      ? { kind: 'REQUEST', text: body, price }
      : { kind: 'REQUEST', text: body };
  const wouldBePricedInEmergency = isPriced({ payload }) && !policy.paymentsAllowed;

  const data = CITIZEN_REQUEST_CLASSES.map((c) => {
    const ok = allowed.includes(c);
    return {
      value: c,
      label: ok ? formatClass(c) : `${formatClass(c)} — off in ${MODE_LABEL[node.mode]}`,
      disabled: !ok,
    };
  });

  const send = (): void => {
    if (cls === null) return;
    sendRequest(node.id, cls, payload, { hopLimit: hops });
    setText('');
  };

  return (
    <Stack gap="xs">
      <Select
        label="Class"
        size="xs"
        data={data}
        value={cls}
        onChange={(value) => setChosen(isRequestClass(value) ? value : null)}
        allowDeselect={false}
        comboboxProps={{ withinPortal: true }}
      />
      <Textarea
        label="Message"
        size="xs"
        autosize
        minRows={2}
        maxRows={4}
        placeholder="What do you need or offer?"
        value={text}
        onChange={(event) => setText(event.currentTarget.value)}
      />
      <Group grow gap="xs" align="flex-end">
        <NumberInput
          label={`Hop limit (max ${policy.maxHopLimit})`}
          size="xs"
          min={1}
          max={policy.maxHopLimit}
          value={hops}
          onChange={(value) => setHopLimit(toNumber(value, policy.hopLimit))}
          allowDecimal={false}
        />
        {priceable ? (
          <NumberInput
            label="Price (zł)"
            size="xs"
            min={0}
            value={price ?? 0}
            onChange={(value) => setPrice(toNumber(value, 0))}
            allowNegative={false}
          />
        ) : null}
      </Group>
      {!policy.paymentsAllowed ? (
        <Text size="xs" c={wouldBePricedInEmergency ? 'red' : 'dimmed'}>
          Payments are off in {MODE_LABEL[node.mode]}; priced requests would be dropped.
        </Text>
      ) : null}
      <Button
        size="xs"
        leftSection={<IconSend size={14} />}
        onClick={send}
        disabled={cls === null || !node.alive || wouldBePricedInEmergency}
      >
        Send request
      </Button>
    </Stack>
  );
}

function CheckInForm({ node }: { readonly node: NodeView }) {
  const [status, setStatus] = useState<CheckInStatus>('OK');
  return (
    <Stack gap="xs">
      <Text size="xs" fw={600}>
        Check-in (reaches the Authority through any backhaul node)
      </Text>
      <SegmentedControl
        size="xs"
        fullWidth
        value={status}
        onChange={(value) => setStatus(isCheckInStatus(value) ? value : 'OK')}
        data={CHECK_IN_OPTIONS.map((s) => ({ value: s, label: formatCheckIn(s) }))}
        color={CHECK_IN_COLOR[status]}
      />
      <Button
        size="xs"
        variant="light"
        color={CHECK_IN_COLOR[status]}
        onClick={() => sendCheckIn(node.id, status)}
        disabled={!node.alive}
      >
        Send check-in
      </Button>
    </Stack>
  );
}

const STATUS_COLOR: Readonly<Record<NodeDetail['requests'][number]['status'], string>> = {
  open: 'lime',
  'accepted-by-me': 'teal',
  mine: 'blue',
  taken: 'gray',
};

/** Requests this phone has received, with Accept where its own view is still 'open' (the engine re-checks). */
function RequestsSeen({ node, detail, tick }: MobileActionsProps) {
  const messages = useSimStore((s) => s.snapshot.messages);
  const byId = useMemo(() => {
    const map = new Map<MessageView['id'], MessageView>();
    for (const message of messages) map.set(message.id, message);
    return map;
  }, [messages]);
  if (detail.requests.length === 0) return null;
  return (
    <Stack gap="xs">
      <Text size="xs" fw={600}>
        Requests this phone has seen
      </Text>
      {detail.requests.map((entry) => {
        const message = byId.get(entry.requestId);
        const statusBadge = (
          <Badge
            size="sm"
            variant={entry.status === 'open' ? 'filled' : 'light'}
            color={STATUS_COLOR[entry.status]}
          >
            {formatRequestStatus(entry.status)}
          </Badge>
        );
        if (!message) {
          return (
            <Group key={entry.requestId} gap="xs">
              <Text size="xs" ff="monospace">
                {entry.requestId}
              </Text>
              {statusBadge}
            </Group>
          );
        }
        return (
          <MessageCard
            key={entry.requestId}
            message={message}
            tick={tick}
            hop={entry.hop}
            path={entry.path}
            badges={statusBadge}
            actions={
              entry.status === 'open' ? (
                <Button
                  size="xs"
                  color={CLASS_COLOR[message.class]}
                  onClick={() => acceptRequest(node.id, entry.requestId)}
                  disabled={!node.alive}
                >
                  Accept and respond
                </Button>
              ) : null
            }
          />
        );
      })}
    </Stack>
  );
}

/**
 * Actions for a phone: request composer, accept buttons, emergency check-in, power.
 * What the phone may originate is read from core's trust table (ORIGIN_RIGHTS via
 * canOriginate), never decided here.
 */
export function MobileActions({ node, detail, tick }: MobileActionsProps) {
  const canRequest = CITIZEN_REQUEST_CLASSES.some((cls) => canOriginate(node.credentialKind, cls));
  // Same rule the engine applies on SendCheckIn: credential rights and the mode's origin classes.
  const canCheckIn =
    canOriginate(node.credentialKind, 'CHECK_IN') &&
    classAllowedToOriginate(MODE_POLICIES[node.mode], 'CHECK_IN');
  return (
    <Stack gap="md">
      {canRequest ? (
        <SendRequestForm node={node} />
      ) : (
        <Alert color="gray" variant="light" title="Unregistered: relay only">
          This phone has no credential that may originate requests. It forwards and stores other
          people's messages; anything it signs itself is dropped as unverifiable.
        </Alert>
      )}
      {canCheckIn ? <CheckInForm node={node} /> : null}
      {/* Eligibility stays with core: relay/none phones never get requestView entries. */}
      <RequestsSeen node={node} detail={detail} tick={tick} />
      <Switch
        size="sm"
        label={node.alive ? 'Powered on' : 'Powered off'}
        checked={node.alive}
        onChange={(event) => setNodePowered(node.id, event.currentTarget.checked)}
      />
    </Stack>
  );
}
