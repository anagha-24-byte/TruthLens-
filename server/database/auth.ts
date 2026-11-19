import { DatabaseSync } from 'node:sqlite';
import crypto from 'crypto';
import { DB_PATH } from '../config.ts';
import type { AuthSession, InvestigatorUser, LoginSubmittedContext } from '../../src/types/forensics.ts';

const db = new DatabaseSync(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS investigators (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    organization TEXT NOT NULL,
    role_title TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS auth_sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    submitted_context_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );
`);

function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function verifyPassword(password: string, salt: string, storedHex: string): boolean {
  const derived = crypto.scryptSync(password, salt, 64);
  const stored = Buffer.from(storedHex, 'hex');
  if (derived.length !== stored.length) return false;
  return crypto.timingSafeEqual(derived, stored);
}

// Seed a default verified forensic examiner account if empty
function ensureSeedInvestigator() {
  const defaultEmail = 'examiner@truthlens.lab';
  const existing = db.prepare('SELECT id FROM investigators WHERE email = ?').get(defaultEmail);
  if (!existing) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = hashPassword('TruthLens2026!', salt);
    db.prepare(`
      INSERT INTO investigators (id, email, full_name, organization, role_title, password_salt, password_hash, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'INV-LEAD-01',
      defaultEmail,
      'Dr. Elena Vance',
      'Independent Media Forensics Lab',
      'Lead Forensic Examiner',
      salt,
      hash,
      new Date().toISOString()
    );
  }
}

ensureSeedInvestigator();

function createSessionForUser(user: InvestigatorUser, submittedContext: LoginSubmittedContext): AuthSession {
  const token = crypto.randomBytes(32).toString('hex');
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  db.prepare(`
    INSERT INTO auth_sessions (token, user_id, submitted_context_json, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(token, user.id, JSON.stringify(submittedContext), createdAt, expiresAt);

  return {
    token,
    user,
    submittedContext,
    expiresAt,
  };
}

export function registerInvestigator(input: {
  email: string;
  password: string;
  fullName: string;
  organization: string;
  roleTitle: string;
  submittedContext: LoginSubmittedContext;
}): { ok: true; session: AuthSession } | { ok: false; error: string } {
  const email = input.email.trim().toLowerCase();
  if (!email || !email.includes('@')) {
    return { ok: false, error: 'Please provide a valid investigator email address.' };
  }
  if (!input.password || input.password.length < 6) {
    return { ok: false, error: 'Password must be at least 6 characters.' };
  }
  const fullName = input.fullName.trim();
  if (!fullName) {
    return { ok: false, error: 'Please provide your full name.' };
  }

  const existing = db.prepare('SELECT id FROM investigators WHERE email = ?').get(email);
  if (existing) {
    return { ok: false, error: 'An account with that email already exists. Please sign in.' };
  }

  const id = `INV-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = hashPassword(input.password, salt);
  const organization = input.organization.trim() || 'Independent Verification Unit';
  const roleTitle = input.roleTitle.trim() || 'Forensic Investigator';

  db.prepare(`
    INSERT INTO investigators (id, email, full_name, organization, role_title, password_salt, password_hash, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, email, fullName, organization, roleTitle, salt, hash, new Date().toISOString());

  const user: InvestigatorUser = {
    id,
    email,
    fullName,
    organization,
    roleTitle,
  };

  return {
    ok: true,
    session: createSessionForUser(user, input.submittedContext),
  };
}

export function loginInvestigator(input: {
  email: string;
  password: string;
  submittedContext: LoginSubmittedContext;
}): { ok: true; session: AuthSession } | { ok: false; error: string } {
  const email = input.email.trim().toLowerCase();
  const row = db
    .prepare(
      'SELECT id, email, full_name, organization, role_title, password_salt, password_hash FROM investigators WHERE email = ?'
    )
    .get(email) as Record<string, unknown> | undefined;

  if (!row) {
    return { ok: false, error: 'Invalid email or password.' };
  }

  const valid = verifyPassword(input.password, String(row.password_salt), String(row.password_hash));
  if (!valid) {
    return { ok: false, error: 'Invalid email or password.' };
  }

  const user: InvestigatorUser = {
    id: String(row.id),
    email: String(row.email),
    fullName: String(row.full_name),
    organization: String(row.organization),
    roleTitle: String(row.role_title),
  };

  return {
    ok: true,
    session: createSessionForUser(user, input.submittedContext),
  };
}

export function getSessionByToken(token: string): AuthSession | null {
  if (!token) return null;
  const row = db
    .prepare(`
      SELECT s.token, s.submitted_context_json, s.expires_at,
             u.id, u.email, u.full_name, u.organization, u.role_title
      FROM auth_sessions s
      JOIN investigators u ON u.id = s.user_id
      WHERE s.token = ?
    `)
    .get(token) as Record<string, unknown> | undefined;

  if (!row) return null;

  const expiresAt = String(row.expires_at);
  if (Date.parse(expiresAt) < Date.now()) {
    db.prepare('DELETE FROM auth_sessions WHERE token = ?').run(token);
    return null;
  }

  let submittedContext: LoginSubmittedContext = {
    caseUnit: '',
    caseReference: '',
    intakeNote: '',
  };
  try {
    submittedContext = JSON.parse(String(row.submitted_context_json)) as LoginSubmittedContext;
  } catch {
    // keep default
  }

  return {
    token: String(row.token),
    expiresAt,
    submittedContext,
    user: {
      id: String(row.id),
      email: String(row.email),
      fullName: String(row.full_name),
      organization: String(row.organization),
      roleTitle: String(row.role_title),
    },
  };
}

export function logoutSession(token: string): void {
  if (!token) return;
  db.prepare('DELETE FROM auth_sessions WHERE token = ?').run(token);
}
