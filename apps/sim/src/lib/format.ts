export function formatNodeId(id: string): string {
  return id.toUpperCase();
}

export function formatMessageId(id: string): string {
  return id;
}

export function formatTick(tick: number): string {
  return `T${tick}`;
}

export function formatDistance(m: number): string {
  return `${Math.round(m)}m`;
}

export function formatClass(cls: string): string {
  return cls.replace(/_/g, ' ');
}

export function formatMode(mode: string): string {
  const modes: Record<string, string> = {
    PEACE: 'PEACE',
    L1: 'L1 DISRUPTION',
    L2: 'L2 DISASTER',
    L3: 'L3 SECURITY',
  };
  return modes[mode] || mode;
}

export function formatCredential(kind: string): string {
  return kind.charAt(0).toUpperCase() + kind.slice(1).toLowerCase();
}

export function formatBackhaul(kind: string | null): string {
  if (!kind || kind === 'none') return 'none';
  const labels: Record<string, string> = {
    cellular: 'Cellular',
    fibre: 'Fibre',
    satellite: 'Satellite',
  };
  return labels[kind] || kind;
}
