import { Info, ShieldAlert } from 'lucide-react';
import type { ConfidenceEngineResult } from '../types/forensics';
import { getAssessmentAccent } from '../lib/formatters';

export function ConfidencePanel({ confidence }: { confidence: ConfidenceEngineResult }) {
  const rows = [
    { key: 'Visual Forensics', weight: '34%', data: confidence.visual },
    { key: 'Audio Forensics', weight: '28%', data: confidence.audio },
    { key: 'Text & Context', weight: '18%', data: confidence.textual },
    { key: 'Cross-Modal Sync', weight: '20%', data: confidence.cross_modal },
  ];

  return (
    <section className="forensic-bezel rounded-xl p-5 space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-slate-500">Deterministic Evidence Aggregation</p>
          <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md border text-sm font-semibold ${getAssessmentAccent(confidence.assessment_category)}`}>
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span>{confidence.assessment_category}</span>
          </div>
        </div>

        <div className="flex items-center gap-8 shrink-0">
          <div>
            <p className="text-xs text-slate-500">Indicator Index</p>
            <p className="text-2xl font-display font-bold tabular-nums text-slate-900">
              {confidence.overall_indicator_index !== null ? `${confidence.overall_indicator_index} / 100` : 'N/A'}
            </p>
          </div>
          <div className="h-9 w-px bg-slate-200" />
          <div>
            <p className="text-xs text-slate-500">Evidence Completeness</p>
            <p className="text-2xl font-display font-bold tabular-nums text-blue-700">
              {confidence.evidence_completeness_pct}%
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {rows.map((row) => {
          const available = row.data.score !== null && row.data.status !== 'unavailable';
          const score = row.data.score ?? 0;
          const barColor =
            score >= 60 ? 'bg-red-600' : score >= 35 ? 'bg-orange-600' : score >= 20 ? 'bg-amber-600' : 'bg-emerald-600';

          return (
            <div key={row.key} className="border border-slate-200 bg-slate-50 rounded-lg p-3.5 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-slate-800">{row.key}</span>
                <span className="text-xs font-mono tabular-nums text-slate-500">Wt {row.weight}</span>
              </div>

              <div className="flex items-baseline justify-between">
                <span className="text-xl font-mono font-semibold tabular-nums text-slate-900">
                  {available ? `${score}/100` : 'Unavailable'}
                </span>
                <span className="text-xs text-slate-500 capitalize">{row.data.status}</span>
              </div>

              <div className="h-1.5 w-full bg-slate-200 rounded-sm overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${available ? barColor : 'bg-slate-300'}`}
                  style={{ width: available ? `${Math.max(4, score)}%` : '0%' }}
                />
              </div>

              <p className="text-xs text-slate-600 leading-relaxed line-clamp-2">
                {row.data.contributing_signals.length > 0
                  ? row.data.contributing_signals[0]
                  : 'Modality not present in submitted files.'}
              </p>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2 text-xs text-slate-600">
        <div className="space-y-1.5">
          <p className="font-medium text-slate-800">Methodology &amp; Unavailable Signals</p>
          <p className="leading-relaxed">{confidence.methodology_notes}</p>
          {confidence.unavailable_signals.length > 0 && (
            <p className="text-amber-800">
              Unavailable: {confidence.unavailable_signals.join(' · ')}
            </p>
          )}
        </div>
        <div className="flex items-start gap-2.5 bg-slate-50 border border-slate-200 rounded-md p-3">
          <Info className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
          <p className="leading-relaxed text-slate-700">{confidence.epistemic_notice}</p>
        </div>
      </div>
    </section>
  );
}
