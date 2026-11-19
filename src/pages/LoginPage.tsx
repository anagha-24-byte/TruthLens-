import { useState, type FormEvent } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, ArrowRight, Lock, UserPlus } from 'lucide-react';
import type { AuthSession } from '../types/forensics';

interface LoginPageProps {
  onAuthenticated: (session: AuthSession) => void;
  onBack?: () => void;
}

export function LoginPage({ onAuthenticated, onBack }: LoginPageProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [organization, setOrganization] = useState('');
  const [roleTitle, setRoleTitle] = useState('Forensic Investigator');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submitAuth = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const emptyContext = {
      caseUnit: '',
      caseReference: '',
      intakeNote: '',
    };

    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const payload =
        mode === 'login'
          ? { email, password, submittedContext: emptyContext }
          : { email, password, fullName, organization, roleTitle, submittedContext: emptyContext };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Authentication failed.');
        return;
      }

      onAuthenticated(data as AuthSession);
    } catch {
      setError('Unable to reach the TruthLens verification server.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative z-10 min-h-screen flex items-center justify-center p-4 sm:p-8">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.38, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-md space-y-4"
      >
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 hover:text-slate-900 bg-white/80 backdrop-blur-md border border-white/90 ring-1 ring-slate-900/5 px-3.5 py-1.5 rounded-lg shadow-xs transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back
          </button>
        )}

        <div className="rounded-3xl p-6 sm:p-8 space-y-6 bg-white/75 backdrop-blur-xl border border-white/85 ring-1 ring-slate-900/5 shadow-[0_24px_64px_-16px_rgba(15,23,42,0.16),inset_0_1px_0_rgba(255,255,255,0.95)] text-slate-900">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <img
                src="/src/assets/images/truthlens_emblem_1795059431139.jpg"
                alt="TruthLens"
                referrerPolicy="no-referrer"
                className="w-10 h-10 rounded-xl object-cover border border-slate-200 shadow-xs shrink-0"
              />
              <div>
                <h1 className="text-lg font-display font-bold tracking-tight text-slate-900">
                  TruthLens Portal
                </h1>
                <p className="text-xs text-slate-500">
                  {mode === 'login' ? 'Investigator Sign In' : 'Register Investigator'}
                </p>
              </div>
            </div>

            <div className="flex items-center p-1 bg-slate-100/90 border border-slate-200 rounded-lg shrink-0">
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setError(null);
                }}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  mode === 'login' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('register');
                  setEmail('');
                  setPassword('');
                  setError(null);
                }}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  mode === 'register' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Register
              </button>
            </div>
          </div>

          <form onSubmit={submitAuth} className="space-y-4">
            {mode === 'register' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label htmlFor="auth-fullname" className="text-xs font-medium text-slate-700">
                    Full Name
                  </label>
                  <input
                    id="auth-fullname"
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Full name"
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-600"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="auth-org" className="text-xs font-medium text-slate-700">
                    Organization / Lab
                  </label>
                  <input
                    id="auth-org"
                    type="text"
                    value={organization}
                    onChange={(e) => setOrganization(e.target.value)}
                    placeholder="Digital Forensics Unit"
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-600"
                  />
                </div>
              </div>
            )}

            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="auth-email" className="text-xs font-medium text-slate-700">
                  Email ID
                </label>
                <span className="font-mono text-[11px] text-slate-400">
                  ************@gmail.com
                </span>
              </div>
              <input
                id="auth-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="************@gmail.com"
                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-600"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="auth-password" className="text-xs font-medium text-slate-700">
                Password
              </label>
              <input
                id="auth-password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-600"
              />
            </div>

            {mode === 'register' && (
              <div className="space-y-1">
                <label htmlFor="auth-role" className="text-xs font-medium text-slate-700">
                  Role Title
                </label>
                <input
                  id="auth-role"
                  type="text"
                  value={roleTitle}
                  onChange={(e) => setRoleTitle(e.target.value)}
                  placeholder="Forensic Investigator"
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-600"
                />
              </div>
            )}

            {error && (
              <div className="p-3 rounded-lg border border-red-200 bg-red-50 text-xs text-red-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white rounded-xl shadow-xs transition-colors"
            >
              {mode === 'login' ? (
                <>
                  <Lock className="w-4 h-4" />
                  {submitting ? 'Verifying Credentials...' : 'Sign In to Dashboard'}
                  <ArrowRight className="w-4 h-4" />
                </>
              ) : (
                <>
                  <UserPlus className="w-4 h-4" />
                  {submitting ? 'Creating Account...' : 'Create Account & Open Dashboard'}
                </>
              )}
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}
