import { users } from './users.ts';
import { verify } from './crypto.ts';
import { AuthError } from './errors.ts';

export async function login(email: string, pw: string) {
  const user = await users.findByEmail(email);
  if (!user) throw new AuthError('BAD_LOGIN');

  const ok = await verify(pw, user.passwordHash);
  if (!ok) throw new AuthError('BAD_LOGIN');

  return { userId: user.id };
}
