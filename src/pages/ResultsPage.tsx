import { useEffect, useState } from 'react';
import { AlertTriangle, Box, FileDown, GitBranch, MessageSquareCode, Scale, ShieldAlert } from 'lucide-react';
import { ConfidencePanel } from '../components/ConfidencePanel';
import { FindingReviewCard } from '../components/FindingReviewCard';
import { DebateRoomPanel } from '../components/DebateRoomPanel';
import { EvidenceDnaMap } from '../components/EvidenceDnaMap';
import { ForensicPrism3D } from '../components/ForensicPrism3D';
import type { InvestigationReport, ReviewStatus } from '../types/forensics';

interface ResultsPageProps {
  report: InvestigationReport | null;
  onUpdateReview: (findingId: string, status: ReviewStatus, notes: string) => Promise<void>;
  onJumpToReplay: (sec: number, findingId: string) => void;
  onOpenReports: () => void;
  onStartNew: () => void;
}

type ResultTab = 'findings' | 'debate' | 'dna' | 'prism3d' | 'cross_modal';

const RESULTS_TAB_KEY = 'truthlens_results_tab';
const RESULTS_MODALITY_KEY = 'truthlens_results_modality';
const VALID_TABS: ResultTab[] = ['findings', 'debate', 'dna', 'prism3d', 'cross_modal'];
const VALID_MODALITIES = ['all', 'visual', 'audio', 'text', 'cross_modal', 'metadata'];

function readStoredTab(): ResultTab {
  try {
    const val = window.localStorage.getItem(RESULTS_TAB_KEY) as ResultTab | null;
    return val && VALID_TABS.includes(val) ? val : 'findings';
  } catch {
    return 'findings';
  }
}

function readStoredModality(): string {
  try {
    const val = window.localStorage.getItem(RESULTS_MODALITY_KEY);
    return val && VALID_MODALITIES.includes(val) ? val : 'all';
  } catch {
    return 'all';
  }
}

export function ResultsPage({
  report,
  onUpdateReview,
  onJumpToReplay,
  onOpenReports,
  onStartNew,
}: ResultsPageProps) {
  const [activeTab, setActiveTab] = useState<ResultTab>(readStoredTab);
  const [highlightedFindingId, setHighlightedFindingId] = useState<string | null>(null);
  const [modalityFilter, setModalityFilter] = useState<string>(readStoredModality);

  useEffect(() => {
    try {
      window.localStorage.setItem(RESULTS_TAB_KEY, activeTab);
    } catch {
      // ignore storage errors
    }
  }, [activeTab]);

  useEffect(() => {
    try {
      window.localStorage.setItem(RESULTS_MODALITY_KEY, modalityFilter);
    } catch {
      // ignore storage errors
    }
  }, [modalityFilter]);

  if (!report) {
    return (
      <div className="forensic-bezel rounded-xl p-10 text-center space-y-3">
        <ShieldAlert className="w-8 h-8 text-slate-400 mx-auto" />
        <h2 className="text-lg font-display font-semibold text-slate-900">No Active Investigation Selected</h2>
        <p className="text-xs text-slate-500">
          Run a new forensic analysis or reopen a saved investigation from Analysis History.
        </p>
        <button
          type="button"
          onClick={onStartNew}
          className="px-4 py-2 text-xs font-medium bg-slate-900 hover:bg-slate-800 text-white rounded-md transition-colors"
        >
          Go to New Forensic Analysis
        </button>
      </div>
    );
  }

  const jumpToFindingCard = (findingId: string) => {
    setActiveTab('findings');
    setModalityFilter('all');
    setHighlightedFindingId(findingId);
    window.setTimeout(() => {
      document.getElementById(`finding-${findingId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 60);
  };

  const filteredFindings =
    modalityFilter === 'all'
      ? report.findings
      : report.findings.filter((f) => f.modality === modalityFilter);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-slate-500">
            <span className="text-blue-700 font-semibold">{report.investigation_id}</span>
            <span aria-hidden="true">·</span>
            <span className={report.mode === 'demo' ? 'text-amber-700' : 'text-emerald-700'}>
              {report.mode === 'demo' ? 'REFERENCE CASE' : 'LIVE FORENSIC ANALYSIS'}
            </span>
            <span aria-hidden="true">·</span>
            <span>Model: {report.model_telemetry.model_used}</span>
            {report.model_telemetry.fallback_used && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-amber-700">Fallback Active</span>
              </>
            )}
          </div>
          <h1 className="text-2xl font-display font-bold text-slate-900">{report.title}</h1>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <a
            href={`/api/investigations/${report.investigation_id}/export/pdf`}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-slate-900 hover:bg-slate-800 text-white rounded-md transition-colors whitespace-nowrap shrink-0"
          >
            <FileDown className="w-3.5 h-3.5" /> Download PDF
          </a>
          <button
            type="button"
            onClick={onOpenReports}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-md transition-colors whitespace-nowrap shrink-0"
          >
            Trust Passport &amp; JSON
          </button>
        </div>
      </div>

      {report.model_telemetry.warnings.length > 0 && (
        <div className="flex items-start gap-2.5 p-3.5 rounded-lg border border-amber-200 bg-amber-50 text-xs text-amber-900">
          <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            {report.model_telemetry.warnings.map((w, i) => (
              <p key={i}>{w}</p>
            ))}
          </div>
        </div>
      )}

      {/* Confidence & Uncertainty Engine */}
      <ConfidencePanel confidence={report.confidence} />

      {/* Explainable Executive Summary */}
      <section className="forensic-bezel rounded-xl p-5 space-y-2">
        <h2 className="text-sm font-display font-semibold text-slate-900">Explainable Executive Summary</h2>
        <p className="text-sm text-slate-700 leading-relaxed">{report.narrative.executive_summary}</p>
        <p className="text-xs text-slate-500 leading-relaxed">{report.narrative.remaining_uncertainties}</p>
      </section>

      {/* Sub-navigation Segmented Tabs */}
      <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 border border-slate-200 rounded-lg w-fit">
        <button
          type="button"
          onClick={() => setActiveTab('findings')}
          className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
            activeTab === 'findings' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <ShieldAlert className="w-3.5 h-3.5" />
          Findings &amp; Counter-Evidence ({report.findings.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('debate')}
          className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
            activeTab === 'debate' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Scale className="w-3.5 h-3.5" />
          Forensic Debate Room
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('dna')}
          className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
            activeTab === 'dna' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <GitBranch className="w-3.5 h-3.5" />
          Evidence DNA Map
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('prism3d')}
          className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
            activeTab === 'prism3d' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Box className="w-3.5 h-3.5" />
          3D Signal Core
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('cross_modal')}
          className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
            activeTab === 'cross_modal' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <MessageSquareCode className="w-3.5 h-3.5" />
          Cross-Modal &amp; Context
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'findings' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-500">
              Every finding includes grounded source/timestamp references, benign counter-hypotheses, and SQLite-persisted investigator review controls.
            </p>
            <div className="flex items-center gap-1 p-1 bg-slate-100 border border-slate-200 rounded-md">
              {['all', 'visual', 'audio', 'text', 'cross_modal', 'metadata'].map((mod) => (
                <button
                  key={mod}
                  type="button"
                  onClick={() => setModalityFilter(mod)}
                  className={`px-2.5 py-1 text-xs rounded transition-colors capitalize whitespace-nowrap shrink-0 ${
                    modalityFilter === mod ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {mod.replace('_', '-')}
                </button>
              ))}
            </div>
          </div>

          {filteredFindings.length === 0 ? (
            <div className="forensic-bezel rounded-xl p-6 text-sm text-slate-500">
              No findings recorded for the selected modality filter.
            </div>
          ) : (
            <div className="space-y-4">
              {filteredFindings.map((f) => (
                <FindingReviewCard
                  key={f.finding_id}
                  finding={f}
                  highlighted={highlightedFindingId === f.finding_id}
                  onUpdateReview={onUpdateReview}
                  onJumpToTimestamp={onJumpToReplay}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'debate' && (
        <DebateRoomPanel debate={report.debate_room} onSelectFindingId={jumpToFindingCard} />
      )}

      {activeTab === 'dna' && (
        <EvidenceDnaMap report={report} onJumpToFinding={jumpToFindingCard} />
      )}

      {activeTab === 'prism3d' && (
        <section className="forensic-bezel rounded-xl p-5 space-y-3">
          <div>
            <h3 className="text-base font-display font-semibold text-slate-900">
              3D Modality &amp; Signal Core Inspection
            </h3>
            <p className="text-xs text-slate-500">
              Click any of the four radial sensor pods to inspect modality scores, drag to orbit, or slide Explode to separate layers.
            </p>
          </div>
          <ForensicPrism3D
            confidence={report.confidence}
            waveformBins={report.audio_analyses[0]?.waveformBins}
            heightClass="h-[440px]"
          />
        </section>
      )}

      {activeTab === 'cross_modal' && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="forensic-bezel rounded-xl p-4 space-y-1">
              <p className="text-xs text-slate-500">Audio–Video Synchronization</p>
              <p className="text-base font-display font-semibold text-slate-900 capitalize">
                {report.cross_modal.av_sync_status.replace('_', ' ')}
              </p>
            </div>
            <div className="forensic-bezel rounded-xl p-4 space-y-1">
              <p className="text-xs text-slate-500">Caption–Speech Alignment</p>
              <p className="text-base font-display font-semibold text-slate-900 capitalize">
                {report.cross_modal.caption_audio_status.replace('_', ' ')}
              </p>
            </div>
            <div className="forensic-bezel rounded-xl p-4 space-y-1">
              <p className="text-xs text-slate-500">Temporal Continuity</p>
              <p className="text-base font-display font-semibold text-slate-900 capitalize">
                {report.cross_modal.temporal_continuity_status.replace('_', ' ')}
              </p>
            </div>
          </div>

          <section className="forensic-bezel rounded-xl p-5 space-y-3">
            <h3 className="text-sm font-display font-semibold text-slate-900">Modality Correlation Matrix</h3>
            <div className="divide-y divide-slate-200">
              {report.cross_modal.correlation_matrix.map((row, idx) => (
                <div key={idx} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                  <div className="space-y-0.5">
                    <p className="font-semibold text-slate-900">{row.pair}</p>
                    <p className="text-slate-600">{row.explanation}</p>
                  </div>
                  <span className="font-mono uppercase text-blue-700 font-medium shrink-0">{row.status}</span>
                </div>
              ))}
            </div>
          </section>

          {report.narrative.contextual_mismatches.length > 0 && (
            <section className="forensic-bezel rounded-xl p-5 space-y-3">
              <h3 className="text-sm font-display font-semibold text-slate-900">
                Contextual &amp; Caption Discrepancy Review
              </h3>
              <div className="space-y-3">
                {report.narrative.contextual_mismatches.map((m, idx) => (
                  <div key={idx} className="border border-slate-200 bg-slate-50 rounded-md p-4 space-y-1.5 text-xs">
                    <p className="text-amber-800 font-semibold">Claim: {m.claim}</p>
                    <p className="text-slate-800">Observed Evidence: {m.observed_evidence}</p>
                    <p className="text-slate-600">{m.explanation}</p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
