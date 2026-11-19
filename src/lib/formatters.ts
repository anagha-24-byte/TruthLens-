import type { AssessmentCategory, ReviewStatus, SeverityLevel } from '../types/forensics';

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function formatTimestamp(sec: number | null | undefined): string {
  if (sec === null || sec === undefined || Number.isNaN(sec)) return '—';
  const mins = Math.floor(sec / 60);
  const rem = sec % 60;
  return `${String(mins).padStart(2, '0')}:${rem.toFixed(2).padStart(5, '0')}`;
}

export function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export const SEVERITY_META: Record<
  SeverityLevel,
  { label: string; shortLabel: string; textClass: string; borderClass: string; bgClass: string; dotColor: string }
> = {
  high: {
    label: 'High-Priority Indicator',
    shortLabel: 'High',
    textClass: 'text-red-700',
    borderClass: 'border-red-200',
    bgClass: 'bg-red-50',
    dotColor: '#DC2626',
  },
  moderate: {
    label: 'Moderate Concern',
    shortLabel: 'Moderate',
    textClass: 'text-orange-700',
    borderClass: 'border-orange-200',
    bgClass: 'bg-orange-50',
    dotColor: '#EA580C',
  },
  review: {
    label: 'Needs Further Review',
    shortLabel: 'Review',
    textClass: 'text-amber-800',
    borderClass: 'border-amber-200',
    bgClass: 'bg-amber-50',
    dotColor: '#D97706',
  },
  nominal: {
    label: 'No Significant Indicator',
    shortLabel: 'Nominal',
    textClass: 'text-emerald-700',
    borderClass: 'border-emerald-200',
    bgClass: 'bg-emerald-50',
    dotColor: '#16A34A',
  },
};

export const REVIEW_STATUS_META: Record<ReviewStatus, { label: string; textClass: string }> = {
  unreviewed: { label: 'Unreviewed', textClass: 'text-slate-600' },
  confirmed: { label: 'Confirmed Indicator', textClass: 'text-red-700' },
  benign: { label: 'Marked Benign', textClass: 'text-emerald-700' },
  secondary_review: { label: 'Secondary Review Requested', textClass: 'text-amber-800' },
};

export function getAssessmentAccent(category: AssessmentCategory): string {
  if (category.startsWith('Multiple')) return 'text-red-800 border-red-200 bg-red-50';
  if (category.startsWith('Potential')) return 'text-orange-800 border-orange-200 bg-orange-50';
  if (category.startsWith('Inconclusive')) return 'text-amber-800 border-amber-200 bg-amber-50';
  return 'text-emerald-800 border-emerald-200 bg-emerald-50';
}

export function maskEmail(email: string | null | undefined): string {
  if (!email || !email.includes('@')) return '************@gmail.com';
  const parts = email.split('@');
  const domain = parts[1]?.trim() || 'gmail.com';
  return `************@${domain}`;
}

