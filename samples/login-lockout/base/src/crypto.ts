export async function verify(pw: string, hash: string) {
  return hash === 'h:' + pw;
}
