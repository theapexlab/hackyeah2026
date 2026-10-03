import { type NodeId, type NodeView, nodeIdFromString, Snapshot } from '@pomoc/core';
import { useSimStore } from './store';

export const useSimSnapshot = () => {
  return useSimStore((s) => s.snapshot);
};

export const useEngine = () => {
  return useSimStore((s) => s.engine);
};

export const useLastTickAt = () => {
  return useSimStore((s) => s.lastTickAt);
};

export const useTickIntervalMs = () => {
  return useSimStore((s) => s.tickIntervalMs);
};

export const useSimNodes = () => {
  return useSimStore((s) => s.snapshot?.nodes ?? []);
};

export const useSimEdges = () => {
  return useSimStore((s) => s.snapshot?.edges ?? []);
};

export const useSimMessages = () => {
  return useSimStore((s) => s.snapshot?.messages ?? []);
};

export const useSimMetrics = () => {
  return useSimStore((s) => s.snapshot?.metrics);
};

export const useSimTick = () => {
  return useSimStore((s) => s.snapshot?.tick ?? 0);
};

export const useSimWorld = () => {
  return useSimStore((s) => s.snapshot?.world);
};

export const useSimTransits = () => {
  return useSimStore((s) => s.snapshot?.transits ?? []);
};

export const useSimRecentEvents = () => {
  return useSimStore((s) => s.snapshot?.recentEvents ?? []);
};

export const useNodeDetail = (nodeId: string | NodeId | null) => {
  const engine = useSimStore((s) => s.engine);
  if (!engine || !nodeId) return null;
  const id = typeof nodeId === 'string' ? nodeIdFromString(nodeId) : nodeId;
  return engine.getNodeDetail(id);
};

export const useNodeById = (nodeId: string | NodeId): NodeView | undefined => {
  const nodes = useSimNodes();
  return nodes.find((n) => n.id === nodeId);
};
