import { AlertOctagon, AlertTriangle, CheckCircle2, Eye } from 'lucide-react';
import { SEVERITY_META } from '../lib/formatters';
import type { SeverityLevel } from '../types/forensics';

export function SeverityIndicator({ severity, compact = false }: { severity: SeverityLevel; compact?: boolean }) {
  const meta = SEVERITY_META[severity] || SEVERITY_META.review;
  const Icon =
    severity === 'high'
      ? AlertOctagon
      : severity === 'moderate'
        ? AlertTriangle
        : severity === 'nominal'
          ? CheckCircle2
          : Eye;

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap shrink-0 ${meta.textClass}`}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>{compact ? meta.shortLabel : meta.label}</span>
    </span>
  );
}
