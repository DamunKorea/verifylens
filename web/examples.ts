// 페이지에 미리 넣어 두는 예제. 모두 꾸민 코드이고, 결과는 엔진이 그때그때 계산한다(미리 적어 둔 답이 아니다).
import type { TryTest } from './check.ts';

export type Example = {
  id: string;
  label: { en: string; ko: string };
  requirements: { en: string; ko: string };
  fileName: string;
  code: string;
  tests: { en: TryTest[]; ko: TryTest[] };
};

const login = `export async function login(email: string, password: string) {
  const user = await users.findByEmail(email);
  if (!user) throw new AuthError('BAD_LOGIN');
  if (user.locked) throw new AuthError('LOCKED');

  const ok = await verify(password, user.passwordHash);
  if (!ok) {
    user.failures += 1;
    // lock after repeated failures
    if (user.failures > 5) {
      user.locked = true;
    }
    await users.save(user);
    throw new AuthError('BAD_LOGIN');
  }

  user.failures = 0;
  await users.save(user);
  return { userId: user.id };
}
`;

const shipping = `export function shippingFee(orderTotal: number): number {
  // free shipping for large orders
  if (orderTotal > 50000) return 0;
  return 3000;
}
`;

const upload = `const MAX_FILE_SIZE = 8 * 1024 * 1024;

export function acceptUpload(file: { name: string; size: number }) {
  if (file.size >= MAX_FILE_SIZE) {
    throw new Error('File is too large');
  }
  return storage.put(file.name, file);
}
`;

const signup = `export function validateSignup(input: { email: string; password: string; age: number }) {
  if (!input.email.includes('@')) throw new Error('Invalid email');
  if (input.password.length < 8) throw new Error('Password is too short');
  if (input.age < 14) throw new Error('Guardian consent is required');
  return true;
}
`;

export const EXAMPLES: Example[] = [
  {
    id: 'login',
    label: { en: 'Account lock', ko: '계정 잠금' },
    requirements: {
      en: 'Lock the account after 5 consecutive failures\nA locked account cannot log in even with the right password | keywords: locked, password',
      ko: '연속 5회 실패하면 계정을 잠근다\n잠긴 계정은 비밀번호가 맞아도 로그인되지 않는다 | keywords: locked, password',
    },
    fileName: 'src/auth.ts',
    code: login,
    tests: {
      en: [
        { name: 'locks the account after 5 consecutive failures', status: 'pass' },
        { name: 'a locked account cannot log in with the right password', status: 'pass' },
      ],
      ko: [
        { name: 'locks the account after 5 consecutive failures', status: 'pass' },
        { name: 'a locked account cannot log in with the right password', status: 'pass' },
      ],
    },
  },
  {
    id: 'shipping',
    label: { en: 'Free shipping', ko: '무료 배송' },
    requirements: { en: 'Orders of 50,000 or more ship for free', ko: '주문 금액이 50,000원 이상이면 배송비는 무료다' },
    fileName: 'src/shipping.ts',
    code: shipping,
    tests: {
      en: [{ name: 'shipping is free for an order total of 60000', status: 'pass' }],
      ko: [{ name: 'shipping is free for an order total of 60000', status: 'pass' }],
    },
  },
  {
    id: 'upload',
    label: { en: 'Upload size', ko: '파일 크기' },
    requirements: { en: 'Files up to and including 8 MB are accepted', ko: '8MB 이하 파일은 올릴 수 있다' },
    fileName: 'src/upload.ts',
    code: upload,
    tests: {
      en: [{ name: 'accepts a small file', status: 'pass' }],
      ko: [{ name: 'accepts a small file', status: 'pass' }],
    },
  },
  {
    id: 'signup',
    label: { en: 'Sign-up rules', ko: '가입 규칙' },
    requirements: {
      en: 'Passwords must be at least 8 characters\nUsers under 14 need guardian consent',
      ko: '비밀번호는 8자 이상이어야 한다\n14세 미만은 보호자 동의가 필요하다',
    },
    fileName: 'src/signup.ts',
    code: signup,
    tests: {
      en: [
        { name: 'a password of 8 characters is accepted', status: 'pass' },
        { name: 'age 13 needs guardian consent', status: 'pass' },
      ],
      ko: [
        { name: 'a password of 8 characters is accepted', status: 'pass' },
        { name: 'age 13 needs guardian consent', status: 'pass' },
      ],
    },
  },
];
