import { useEffect, useMemo, useState } from 'react';
import {
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';
import { Clock } from 'lucide-react';
import { RealityReplay } from '../components/RealityReplay';
import { SeverityIndicator } from '../components/SeverityBadge';
import { formatTimestamp, SEVERITY_META } from '../lib/formatters';
import type { ForensicFinding, InvestigationReport } from '../types/forensics';

interface TimelinePageProps {
  report: InvestigationReport | null;
  focusTimestamp?: number | null;
  focusFindingId?: string | null;
  onStartNew: () => void;
}

const TIMELINE_MODALITY_KEY = 'truthlens_timeline_modality';
const VALID_TIMELINE_MODALITIES = ['all', 'visual', 'audio', 'text', 'cross_modal'];

export function TimelinePage({
  report,
  focusTimestamp = null,
  focusFindingId = null,
  onStartNew,
}: TimelinePageProps) {
  const [modalityFilter, setModalityFilter] = useState<string>(() => {
    try {
      const val = window.localStorage.getItem(TIMELINE_MODALITY_KEY);
      return val && VALID_TIMELINE_MODALITIES.includes(val) ? val : 'all';
    } catch {
      return 'all';
    }
  });
  const [seekTarget, setSeekTarget] = useState<number | null>(focusTimestamp);
  const [activeFinding, setActiveFinding] = useState<ForensicFinding | null>(
    report?.findings.find((f) => f.finding_id === focusFindingId) || null
  );

  useEffect(() => {
    try {
      window.localStorage.setItem(TIMELINE_MODALITY_KEY, modalityFilter);
    } catch {
      // ignore storage errors
    }
  }, [modalityFilter]);

  const timedFindings = useMemo(() => {
    if (!report) return [];
    return report.findings
      .filter((f) => f.timestamp !== null)
      .filter((f) => modalityFilter === 'all' || f.modality === modalityFilter)
      .sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));
  }, [report, modalityFilter]);

  const scatterData = useMemo(() => {
    return timedFindings.map((f) => ({
      x: f.timestamp ?? 0,
      y: Math.round(f.evidence_confidence * 100),
      z: f.severity === 'high' ? 260 : f.severity === 'moderate' ? 180 : 120,
      findingId: f.finding_id,
      title: f.indicator_title,
      modality: f.modality,
      severity: f.severity,
      fill: SEVERITY_META[f.severity].dotColor,
    }));
  }, [timedFindings]);

  if (!report) {
    return (
      <div className="forensic-bezel rounded-xl p-10 text-center space-y-3">
        <Clock className="w-8 h-8 text-slate-400 mx-auto" />
        <h2 className="text-lg font-display font-semibold text-slate-900">Suspicious Timeline Unavailable</h2>
        <p className="text-xs text-slate-500">Select or run an investigation to inspect synchronized timestamps.</p>
        <button
          type="button"
          onClick={onStartNew}
          className="px-4 py-2 text-xs font-medium bg-slate-900 hover:bg-slate-800 text-white rounded-md transition-colors"
        >
          Start New Analysis
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-slate-900">Suspicious Timeline &amp; Reality Replay</h1>
          <p className="text-sm text-slate-600">
            Click any observation or scatter marker to synchronize Reality Replay to that exact timestamp.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 border border-slate-200 rounded-lg">
          {['all', 'visual', 'audio', 'text', 'cross_modal'].map((mod) => (
            <button
              key={mod}
              type="button"
              onClick={() => setModalityFilter(mod)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors capitalize whitespace-nowrap shrink-0 ${
                modalityFilter === mod ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {mod.replace('_', '-')}
            </button>
          ))}
        </div>
      </div>

      {/* Synchronized Media Player */}
      <RealityReplay
        report={report}
        initialTimestamp={seekTarget}
        selectedFindingId={activeFinding?.finding_id || focusFindingId}
        onSelectFinding={(f) => {
          setActiveFinding(f);
          if (f.timestamp !== null) setSeekTarget(f.timestamp);
        }}
      />

      {/* Interactive Timeline Plot */}
      <section className="forensic-bezel rounded-xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-display font-semibold text-slate-900">
            Interactive Temporal Anomaly Distribution (Timestamp vs. Signal Confidence)
          </h2>
          <span className="text-xs font-mono text-slate-500 tabular-nums">
            {timedFindings.length} timestamped indicator(s)
          </span>
        </div>

        {scatterData.length === 0 ? (
          <p className="text-xs text-slate-500 py-6">
            No timestamp-bound findings match the current filter.
          </p>
        ) : (
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 12, right: 20, bottom: 10, left: 0 }}>
                <CartesianGrid stroke="#E2E8F0" strokeDasharray="3 3" />
                <XAxis
                  type="number"
                  dataKey="x"
                  name="Timestamp"
                  unit="s"
                  stroke="#64748B"
                  tick={{ fontSize: 11, fill: '#475569' }}
                />
                <YAxis
                  type="number"
                  dataKey="y"
                  name="Confidence"
                  unit="%"
                  domain={[0, 100]}
                  stroke="#64748B"
                  tick={{ fontSize: 11, fill: '#475569' }}
                />
                <ZAxis type="number" dataKey="z" range={[90, 260]} />
                <Tooltip
                  cursor={{ strokeDasharray: '3 3', stroke: '#2563EB' }}
                  contentStyle={{
                    backgroundColor: '#FFFFFF',
                    border: '1px solid #E2E8F0',
                    borderRadius: '6px',
                    fontSize: '12px',
                    color: '#0F172A',
                  }}
                  formatter={(value, name) => [name === 'Timestamp' ? `${value}s` : `${value}%`, name]}
                />
                <Scatter
                  data={scatterData}
                  onClick={(pt) => {
                    const item = pt as unknown as { findingId?: string; payload?: { findingId?: string } };
                    const fid = item.findingId || item.payload?.findingId;
                    const matched = report.findings.find((f) => f.finding_id === fid);
                    if (matched && matched.timestamp !== null) {
                      setActiveFinding(matched);
                      setSeekTarget(matched.timestamp);
                    }
                  }}
                />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      {/* Chronological Event Ledger */}
      <section className="forensic-bezel rounded-xl divide-y divide-slate-200 overflow-hidden">
        {timedFindings.map((f) => (
          <button
            key={f.finding_id}
            type="button"
            onClick={() => {
              setActiveFinding(f);
              setSeekTarget(f.timestamp!);
            }}
            className={`w-full text-left p-4 hover:bg-slate-50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
              activeFinding?.finding_id === f.finding_id ? 'bg-blue-50/70' : ''
            }`}
          >
            <div className="space-y-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-slate-500 tabular-nums">
                <span className="text-blue-700 font-semibold">{formatTimestamp(f.timestamp)}</span>
                <span aria-hidden="true">·</span>
                <span>{f.finding_id}</span>
                <span aria-hidden="true">·</span>
                <span className="uppercase">{f.modality}</span>
                <span aria-hidden="true">·</span>
                <span>Source {f.source_id}</span>
              </div>
              <p className="text-sm font-medium text-slate-900">{f.indicator_title}</p>
              <p className="text-xs text-slate-600">{f.observed_signal}</p>
            </div>
            <div className="shrink-0">
              <SeverityIndicator severity={f.severity} compact />
            </div>
          </button>
        ))}
      </section>
    </div>
  );
}
