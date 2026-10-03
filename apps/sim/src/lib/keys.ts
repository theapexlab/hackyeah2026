/** Stable React keys for lists without ids: `base` plus the occurrence number of that base. */
export function withKeys<T>(
  items: readonly T[],
  base: (item: T) => string,
): { key: string; item: T }[] {
  const seen = new Map<string, number>();
  return items.map((item) => {
    const b = base(item);
    const n = (seen.get(b) ?? 0) + 1;
    seen.set(b, n);
    return { key: `${b}#${n}`, item };
  });
}
