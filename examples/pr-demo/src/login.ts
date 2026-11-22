export type Account = { failures: number; locked: boolean; passwordHash: string };

export function login(account: Account, password: string, matches: (password: string, hash: string) => boolean): 'ok' {
  if (account.locked) throw new Error('LOCKED');
  if (!matches(password, account.passwordHash)) {
    account.failures += 1;
    if (account.failures > 5) account.locked = true;
    throw new Error('BAD_LOGIN');
  }
  account.failures = 0;
  return 'ok';
}
