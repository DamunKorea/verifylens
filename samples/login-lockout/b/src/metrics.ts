export const metrics = {
  counts: {} as Record<string, number>,
  count(name: string) {
    metrics.counts[name] = (metrics.counts[name] ?? 0) + 1;
  },
};
