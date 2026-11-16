export type User = { id: string; email: string; passwordHash: string; failures: number; locked: boolean };

const db = new Map<string, User>();

export const users = {
  seed(u: User) {
    db.set(u.email, { ...u });
  },
  async findByEmail(email: string) {
    return db.get(email) ?? null;
  },
  async save(u: User) {
    db.set(u.email, u);
  },
  reset() {
    db.clear();
  },
};
