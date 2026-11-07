import { createHash, randomBytes, scrypt as callbackScrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { NextFunction, Request, Response } from 'express';
import type { AppDatabase, Queryable } from './db.ts';

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
  emailVerified: boolean;
  walletProvisioningStatus: 'pending' | 'provisioning' | 'provisioned' | 'failed';
  accountStatus: 'pending_email_verification' | 'email_verified' | 'wallet_provisioning' | 'wallet_provisioning_failed' | 'active' | 'suspended';
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
  email_verified_at: Date | string | null;
  wallet_provisioning_status: 'pending' | 'provisioning' | 'provisioned' | 'failed';
  account_status: 'pending_email_verification' | 'email_verified' | 'wallet_provisioning' | 'wallet_provisioning_failed' | 'active';
  status: string;
  role: string;
  verification_status: string;
  created_at: string | Date;
};

export function publicUser(row: UserRow): AuthenticatedUser {
  const walletProvisioningStatus = row.wallet_provisioning_status ?? 'pending';
  const accountStatus = row.status === 'active' ? row.account_status : 'suspended';
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    email: row.email,
    avatarUrl: row.avatar_url,
    bio: row.bio,
    walletAddress: row.wallet_address,
    emailVerified: Boolean(row.email_verified_at),
    walletProvisioningStatus,
    accountStatus,
    status: row.status,
    role: row.role,
    verificationStatus: row.verification_status,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
}

export async function loadPublicUser(database: AppDatabase, userId: string): Promise<AuthenticatedUser | null> {
  const { rows } = await database.withUser(userId, (client) => client.query<UserRow>(`
    SELECT users.*, wallet_accounts.smart_wallet_address AS wallet_address,
      wallet_accounts.provisioning_status AS wallet_provisioning_status
    FROM users
    LEFT JOIN wallet_accounts ON wallet_accounts.user_id = users.id
    WHERE users.id = $1
  `, [userId]));
  return rows[0] ? publicUser(rows[0]) : null;
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

export async function createSession(database: Queryable, userId: string): Promise<string> {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_LIFETIME_MS);
  await database.query('INSERT INTO sessions (id_hash, user_id, expires_at) VALUES ($1, $2, $3)', [
    hashSessionToken(token), userId, expiresAt,
  ]);
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

export async function removeSession(database: Queryable, request: Request): Promise<void> {
  const token = readCookie(request, SESSION_COOKIE);
  if (token) await database.query('DELETE FROM sessions WHERE id_hash = $1', [hashSessionToken(token)]);
}

export function optionalAuthentication(database: AppDatabase) {
  return async (request: Request, response: Response, next: NextFunction) => {
    const token = readCookie(request, SESSION_COOKIE);
    if (token) {
      try {
        const { rows } = await database.query<UserRow>(`
        SELECT users.* FROM sessions
        JOIN users ON users.id = sessions.user_id
        WHERE sessions.id_hash = $1 AND sessions.expires_at > $2
          AND users.status = 'active' AND users.email_verified_at IS NOT NULL
      `, [hashSessionToken(token), new Date()]);
        if (rows[0]) {
          response.locals.user = await loadPublicUser(database, rows[0].id);
        }
      } catch (error) {
        next(error);
        return;
      }
    }
    next();
  };
}

export function requireAuthentication(_request: Request, response: Response, next: NextFunction): void {
  if (!response.locals.user) {
    response.status(401).json({ error: 'Please sign in to continue.' });
    return;
  }
  next();
}

export function requireActiveAccount(_request: Request, response: Response, next: NextFunction): void {
  const user = response.locals.user as AuthenticatedUser | undefined;
  if (!user || user.accountStatus !== 'active') {
    response.status(403).json({
      error: 'Complete email verification and wallet provisioning before using Geemifi.',
      accountStatus: user?.accountStatus ?? 'pending_email_verification',
    });
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