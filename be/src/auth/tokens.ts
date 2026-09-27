import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import { SignJWT, jwtVerify, importPKCS8, importSPKI } from 'jose';
import type { UserRole } from './auth.types.ts';

export const ACCESS_TTL_SECONDS = 900;
const ISSUER = 'gocode';
const AUDIENCE = 'gocode-api';

function normPem(raw: string): string {
  return raw.includes('BEGIN') ? raw.replace(/\\n/g, '\n') : raw;
}

// Khoá đọc lười (lazy) + nhớ theo chuỗi PEM gốc: module nạp được dù chưa có
// biến môi trường, và đổi khoá trong test vẫn nạp lại đúng khoá mới.
type KeyCache = { raw: string; key: Promise<CryptoKey> };
let privCache: KeyCache | null = null;
let pubCache: KeyCache | null = null;

function getPrivKey(): Promise<CryptoKey> | null {
  const raw = process.env.ADMIN_JWT_PRIVATE_KEY ?? process.env.ADMIN_PRIVATE_KEY ?? '';
  if (!raw) return null;
  if (privCache?.raw === raw) return privCache.key;
  privCache = { raw, key: importPKCS8(normPem(raw), 'RS256') };
  return privCache.key;
}

function getPubKey(): Promise<CryptoKey> | null {
  const raw =
    process.env.ADMIN_JWT_PUBLIC_KEY ?? process.env.ADMIN_JWT_PRIVATE_KEY ?? '';
  if (!raw) return null;
  if (pubCache?.raw === raw) return pubCache.key;
  pubCache = { raw, key: importSPKI(normPem(raw), 'RS256') };
  return pubCache.key;
}

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/** 32 byte ngẫu nhiên ở dạng hex, chỉ dùng để sinh — không bao giờ lưu bản này. */
export function newToken(): string {
  return randomBytes(32).toString('hex');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function signAccessToken(userId: number, role: UserRole): Promise<string> {
  const privKey = getPrivKey();
  if (!privKey) throw new Error('Thiếu ADMIN_JWT_PRIVATE_KEY');
  return new SignJWT({ role })
    .setProtectedHeader({ alg: 'RS256' })
    .setSubject(String(userId))
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TTL_SECONDS}s`)
    .sign(await privKey);
}

export async function verifyAccessToken(
  token: string,
): Promise<{ sub: string; role: UserRole } | null> {
  try {
    const pubKey = getPubKey();
    if (!pubKey) return null;
    const { payload } = await jwtVerify(token, await pubKey, {
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    const role = payload.role;
    if (typeof payload.sub !== 'string') return null;
    if (role !== 'user' && role !== 'vip' && role !== 'admin') return null;
    return { sub: payload.sub, role };
  } catch {
    return null;
  }
}
