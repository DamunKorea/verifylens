import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { login } from '../src/auth.ts';
import { users } from '../src/users.ts';

beforeEach(() => {
  users.reset();
  users.seed({ id: 'u1', email: 'a@x.com', passwordHash: 'h:right', failures: 0, locked: false });
});

test('login succeeds with the right password', async () => {
  const r = await login('a@x.com', 'right');
  assert.equal(r.userId, 'u1');
});

test('locks the account after 5 consecutive failures', async () => {
  for (let i = 0; i < 5; i++) {
    await assert.rejects(login('a@x.com', 'wrong'));
  }
  // the next attempt is refused and the account is locked
  await assert.rejects(login('a@x.com', 'wrong'));
  const u = await users.findByEmail('a@x.com');
  assert.equal(u?.locked, true);
});
