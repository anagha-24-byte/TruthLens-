import { useState } from 'react';
import { Check, ChevronDown, ChevronUp, Clock, FileCheck, HelpCircle, MessageSquare, ShieldCheck, X } from 'lucide-react';
import { REVIEW_STATUS_META, formatTimestamp } from '../lib/formatters';
import { SeverityIndicator } from './SeverityBadge';
import type { ForensicFinding, ReviewStatus } from '../types/forensics';

interface FindingReviewCardProps {
  finding: ForensicFinding;
  highlighted?: boolean;
  onUpdateReview: (findingId: string, status: ReviewStatus, notes: string) => Promise<void>;
  onJumpToTimestamp?: (sec: number, findingId: string) => void;
}

export function FindingReviewCard({
  finding,
  highlighted = false,
  onUpdateReview,
  onJumpToTimestamp,
}: FindingReviewCardProps) {
  const [expanded, setExpanded] = useState(true);
  const [notes, setNotes] = useState(finding.investigator_notes || '');
  const [saving, setSaving] = useState(false);

  const reviewMeta = REVIEW_STATUS_META[finding.review_status];

  const handleStatusClick = async (nextStatus: ReviewStatus) => {
    setSaving(true);
    try {
      await onUpdateReview(finding.finding_id, nextStatus, notes);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveNotes = async () => {
    setSaving(true);
    try {
      await onUpdateReview(finding.finding_id, finding.review_status, notes);
    } finally {
      setSaving(false);
    }
  };

  return (
    <article
      id={`finding-${finding.finding_id}`}
      className={`forensic-bezel rounded-xl transition-colors overflow-hidden ${
        highlighted ? 'border-blue-600 ring-1 ring-blue-600/30' : ''
      }`}
    >
      <div className="p-4 sm:p-5 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5 min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 font-mono tabular-nums">
              <span className="text-blue-700 font-semibold">{finding.finding_id}</span>
              <span aria-hidden="true">·</span>
              <span className="uppercase">{finding.modality}</span>
              <span aria-hidden="true">·</span>
              <span>{finding.source_id}</span>
              {finding.timestamp !== null && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{formatTimestamp(finding.timestamp)}</span>
                </>
              )}
              <span aria-hidden="true">·</span>
              <span>Confidence {Math.round(finding.evidence_confidence * 100)}%</span>
            </div>

            <h3 className="text-base font-display font-semibold text-slate-900 leading-snug">
              {finding.indicator_title}
            </h3>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <SeverityIndicator severity={finding.severity} />
            {finding.timestamp !== null && onJumpToTimestamp && (
              <button
                type="button"
                onClick={() => onJumpToTimestamp(finding.timestamp!, finding.finding_id)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-md transition-colors whitespace-nowrap shrink-0"
              >
                <Clock className="w-3.5 h-3.5" />
                Replay @ {formatTimestamp(finding.timestamp)}
              </button>
            )}
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              aria-label={expanded ? 'Collapse finding details' : 'Expand finding details'}
              className="p-1.5 text-slate-500 hover:text-slate-900 border border-slate-200 rounded-md transition-colors"
            >
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-sm">
          <div className="space-y-1">
            <p className="text-xs font-medium text-slate-500">Observed Signal</p>
            <p className="text-slate-800 leading-relaxed">{finding.observed_signal}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium text-slate-500">Forensic Explanation</p>
            <p className="text-slate-700 leading-relaxed">{finding.forensic_explanation}</p>
          </div>
        </div>

        {(finding.quote || finding.box_2d || finding.grounding_notes) && (
          <div className="flex flex-wrap items-center gap-4 pt-1 text-xs font-mono text-slate-500">
            {finding.quote && (
              <span className="text-slate-700 italic font-sans">
                Quote: &ldquo;{finding.quote}&rdquo;
              </span>
            )}
            {finding.box_2d && (
              <span>
                Region box_2d: [{finding.box_2d.join(', ')}]
              </span>
            )}
            {finding.grounding_notes && finding.grounding_notes.length > 0 && (
              <span className="text-amber-800 font-sans">
                Grounding check: {finding.grounding_notes.join(' ')}
              </span>
            )}
          </div>
        )}
      </div>

      {expanded && (
        <div className="border-t border-slate-200 bg-slate-50/90 p-4 sm:p-5 space-y-5">
          {/* Counter-Evidence Engine */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-slate-800">
                Counter-Evidence &amp; Alternative Hypotheses
              </h4>
              <span className="text-xs text-slate-500">An anomaly alone never proves manipulation</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div className="border border-slate-200 bg-white rounded-md p-3 space-y-1.5">
                <p className="font-semibold text-emerald-700 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5" /> Plausible Benign Explanations
                </p>
                <ul className="space-y-1 text-slate-700 list-disc pl-4">
                  {finding.counter_evidence.benign_explanations.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>

              <div className="border border-slate-200 bg-white rounded-md p-3 space-y-1.5">
                <p className="font-semibold text-blue-700 flex items-center gap-1.5">
                  <FileCheck className="w-3.5 h-3.5" /> Supporting Telemetry
                </p>
                <ul className="space-y-1 text-slate-700 list-disc pl-4">
                  {finding.counter_evidence.supporting_evidence.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>

              <div className="border border-slate-200 bg-white rounded-md p-3 space-y-1.5">
                <p className="font-semibold text-orange-700 flex items-center gap-1.5">
                  <X className="w-3.5 h-3.5" /> Contradicting / Mitigating Evidence
                </p>
                <ul className="space-y-1 text-slate-700 list-disc pl-4">
                  {finding.counter_evidence.contradicting_evidence.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>

              <div className="border border-slate-200 bg-white rounded-md p-3 space-y-1.5">
                <p className="font-semibold text-amber-800 flex items-center gap-1.5">
                  <HelpCircle className="w-3.5 h-3.5" /> Unresolved Questions
                </p>
                <ul className="space-y-1 text-slate-700 list-disc pl-4">
                  {finding.counter_evidence.unresolved_questions.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {/* Investigator Review Controls */}
          <div className="border-t border-slate-200 pt-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs">
                <span className="text-slate-500">Investigator Review Status: </span>
                <span className={`font-semibold ${reviewMeta.textClass}`}>{reviewMeta.label}</span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => handleStatusClick('confirmed')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 ${
                    finding.review_status === 'confirmed'
                      ? 'bg-red-50 border-red-300 text-red-800'
                      : 'bg-white border-slate-200 text-slate-700 hover:border-red-300'
                  }`}
                >
                  <Check className="w-3.5 h-3.5" /> Confirm Indicator
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => handleStatusClick('benign')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 ${
                    finding.review_status === 'benign'
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                      : 'bg-white border-slate-200 text-slate-700 hover:border-emerald-300'
                  }`}
                >
                  <ShieldCheck className="w-3.5 h-3.5" /> Mark as Benign
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => handleStatusClick('secondary_review')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 ${
                    finding.review_status === 'secondary_review'
                      ? 'bg-amber-50 border-amber-300 text-amber-900'
                      : 'bg-white border-slate-200 text-slate-700 hover:border-amber-300'
                  }`}
                >
                  <HelpCircle className="w-3.5 h-3.5" /> Request Secondary Review
                </button>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <MessageSquare className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add investigator verification notes (persisted to SQLite & exported reports)..."
                  className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-md text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-600"
                />
              </div>
              <button
                type="button"
                disabled={saving}
                onClick={handleSaveNotes}
                className="px-3.5 py-1.5 text-xs font-medium bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white rounded-md transition-colors whitespace-nowrap shrink-0"
              >
                {saving ? 'Saving...' : 'Save Note'}
              </button>
            </div>
          </div>
        </div>
      )}
    </article>
  );
}
