import { users } from './users.ts';
import { verify } from './crypto.ts';
import { audit } from './audit.ts';
import { hooks } from './hooks.ts';
import { metrics } from './metrics.ts';
import { AuthError } from './errors.ts';

export async function login(email: string, pw: string) {
  const started = Date.now();
  const user = await users.findByEmail(email);
  if (!user) throw new AuthError('BAD_LOGIN');
  if (user.locked) throw new AuthError('LOCKED');

  const ok = await verify(pw, user.passwordHash);
  if (!ok) {
    user.failures += 1;
    await audit.log('fail', user.id);
    metrics.count('login.failed');

    // lock after repeated failures
    if (user.failures > 5) {
      user.locked = true;
    }
    await users.save(user);
    throw new AuthError('BAD_LOGIN');
  }

  user.failures = 0;
  await users.save(user);
  const event = 'login_ok';
  await hooks[event]?.(user);
  metrics.count('login.ok.ms.' + (Date.now() - started));
  return { userId: user.id };
}
