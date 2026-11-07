import { createHash, randomBytes, scrypt as callbackScrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { NextFunction, Request, Response } from 'express';
import type { AppDatabase } from './db.ts';

const scrypt = promisify(callbackScrypt);
const SESSION_COOKIE = 'geemifi_session';
const SESSION_LIFETIME_MS = 1000 * 60 * 60 * 24 * 30;

export type AuthenticatedUser = {
  id: string;
  username: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
  bio: string;
  walletAddress: string | null;
  status: string;
  role: string;
  verificationStatus: string;
  createdAt: string;
};

type UserRow = {
  id: string;
  username: string;
  display_name: string;
  email: string;
  avatar_url: string | null;
  bio: string;
  wallet_address: string | null;
  status: string;
  role: string;
  verification_status: string;
  created_at: string;
};

export function publicUser(row: UserRow): AuthenticatedUser {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    email: row.email,
    avatarUrl: row.avatar_url,
    bio: row.bio,
    walletAddress: row.wallet_address,
    status: row.status,
    role: row.role,
    verificationStatus: row.verification_status,
    createdAt: row.created_at,
  };
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, 64) as Buffer;
  return `${salt.toString('hex')}:${derived.toString('hex')}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [saltHex, hashHex] = storedHash.split(':');
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length) as Buffer;
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function readCookie(request: Request, name: string): string | undefined {
  const cookie = request.headers.cookie?.split(';').map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  return cookie ? decodeURIComponent(cookie.slice(name.length + 1)) : undefined;
}

export function createSession(database: AppDatabase, userId: string): string {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_LIFETIME_MS).toISOString();
  database.prepare('INSERT INTO sessions (id_hash, user_id, expires_at) VALUES (?, ?, ?)')
    .run(hashSessionToken(token), userId, expiresAt);
  return token;
}

export function setSessionCookie(response: Response, token: string): void {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  response.setHeader('Set-Cookie', `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_LIFETIME_MS / 1000}${secure}`);
}

export function clearSessionCookie(response: Response): void {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  response.setHeader('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`);
}

export function removeSession(database: AppDatabase, request: Request): void {
  const token = readCookie(request, SESSION_COOKIE);
  if (token) database.prepare('DELETE FROM sessions WHERE id_hash = ?').run(hashSessionToken(token));
}

export function optionalAuthentication(database: AppDatabase) {
  return (request: Request, response: Response, next: NextFunction) => {
    const token = readCookie(request, SESSION_COOKIE);
    if (token) {
      const row = database.prepare(`
        SELECT users.* FROM sessions
        JOIN users ON users.id = sessions.user_id
        WHERE sessions.id_hash = ? AND sessions.expires_at > ? AND users.status = 'active'
      `).get(hashSessionToken(token), new Date().toISOString()) as UserRow | undefined;
      if (row) response.locals.user = publicUser(row);
    }
    next();
  };
}

export function requireAuthentication(request: Request, response: Response, next: NextFunction): void {
  if (!response.locals.user) {
    response.status(401).json({ error: 'Please sign in to continue.' });
    return;
  }
  next();
}

export function sameOrigin(request: Request, response: Response, next: NextFunction): void {
  const origin = request.get('origin');
  if (origin && new URL(origin).host !== request.get('host')) {
    response.status(403).json({ error: 'This request could not be verified.' });
    return;
  }
  next();
}

export function userFromResponse(response: Response): AuthenticatedUser {
  return response.locals.user as AuthenticatedUser;
}

export { SESSION_LIFETIME_MS };