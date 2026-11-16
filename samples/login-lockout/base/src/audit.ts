export const audit = {
  events: [] as string[],
  async log(kind: string, id: string) {
    audit.events.push(`${kind}:${id}`);
  },
};
