import { MODE_LABELS, type Mode } from '@pomoc/core';

export const formatNodeId = (id: string): string => id.toUpperCase();

export const formatClass = (cls: string): string => cls.replace(/_/g, ' ');

export const formatMode = (mode: Mode): string => MODE_LABELS[mode].toUpperCase();

export const formatCredential = (kind: string): string =>
  kind === 'none' ? 'Unregistered' : kind.charAt(0).toUpperCase() + kind.slice(1);

export const formatBackhaul = (kind: string): string =>
  kind === 'none' ? 'None' : kind.charAt(0).toUpperCase() + kind.slice(1);

export const formatHopLimit = (n: number): string => (Number.isFinite(n) ? String(n) : '∞');
