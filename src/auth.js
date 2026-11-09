import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { cookies } from './http.js';

const COOKIE = 'dani_admin';
const HOURS = 12;

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  return `scrypt$${salt}$${scryptSync(password, salt, 32).toString('hex')}`;
}

export function verifyPassword(password, stored) {
  const [algo, salt, hash] = String(stored).split('$');
  if (algo !== 'scrypt' || !salt || hash?.length !== 64) return false;
  return timingSafeEqual(scryptSync(String(password), salt, 32), Buffer.from(hash, 'hex'));
}

const sig = (value, secret) => createHmac('sha256', secret).update(value).digest('hex');

// Un solo utente (Dani): la sessione è solo una scadenza firmata, niente tabella sessioni.
export function sessionCookie(secret, secure) {
  const exp = String(Date.now() + HOURS * 3600e3);
  return `${COOKIE}=${exp}.${sig(exp, secret)}; Path=/admin; HttpOnly; SameSite=Strict; Max-Age=${HOURS * 3600}${secure ? '; Secure' : ''}`;
}

export const clearCookie = () => `${COOKIE}=; Path=/admin; HttpOnly; SameSite=Strict; Max-Age=0`;

export function isAuthed(req, secret) {
  const [exp, mac] = (cookies(req)[COOKIE] ?? '').split('.');
  if (!exp || !mac || Number(exp) < Date.now()) return false;
  const expected = sig(exp, secret);
  return mac.length === expected.length && timingSafeEqual(Buffer.from(mac), Buffer.from(expected));
}
