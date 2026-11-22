import { test } from 'node:test';
import assert from 'node:assert/strict';
import { login, type Account } from '../src/login.ts';

const same = (password: string, hash: string) => password === hash;

test('locks the account after repeated failed logins', () => {
  const account: Account = { failures: 0, locked: false, passwordHash: 'right' };
  for (let i = 0; i < 6; i++) assert.throws(() => login(account, 'wrong', same), /BAD_LOGIN/);
  assert.equal(account.locked, true);
});

test('a locked account cannot log in, even with the right password', () => {
  const account: Account = { failures: 0, locked: true, passwordHash: 'right' };
  assert.throws(() => login(account, 'right', same), /LOCKED/);
});
