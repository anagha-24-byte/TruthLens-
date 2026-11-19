import { motion } from 'motion/react';
import { ArrowRight, FileSearch, History, ShieldAlert } from 'lucide-react';
import { ForensicPrism3D } from '../components/ForensicPrism3D';
import { formatDateTime, getAssessmentAccent } from '../lib/formatters';
import type { ConfidenceEngineResult, DashboardStats } from '../types/forensics';

interface DashboardPageProps {
  stats: DashboardStats | null;
  loading: boolean;
  activeConfidence?: ConfidenceEngineResult | null;
  activeWaveform?: number[];
  onStartNew: () => void;
  onOpenResults?: () => void;
  onOpenHistory: () => void;
  onOpenInvestigation: (id: string) => void;
}

export function DashboardPage({
  stats,
  loading,
  activeConfidence = null,
  activeWaveform,
  onStartNew,
  onOpenResults,
  onOpenHistory,
  onOpenInvestigation,
}: DashboardPageProps) {
  const kpis = [
    {
      label: 'Total Files Analysed',
      value: stats?.total_files_analyzed ?? 0,
      note: 'Images, video, audio & text sources',
    },
    {
      label: 'Suspicious Files Flagged',
      value: stats?.suspicious_files_flagged ?? 0,
      note: 'Investigations with high/moderate indicators',
    },
    {
      label: 'Requiring Human Review',
      value: stats?.analyses_requiring_review ?? 0,
      note: 'Unreviewed or secondary-review items',
    },
    {
      label: 'Completed Investigations',
      value: stats?.completed_investigations ?? 0,
      note: 'Persisted in local SQLite registry',
    },
  ];

  return (
    <div className="space-y-8">
      {/* Hero / 3D Optical Instrument Anchor */}
      <section className="forensic-bezel rounded-xl p-6 lg:p-7">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="lg:col-span-6 space-y-4"
          >
            <p className="text-xs font-medium text-blue-700">
              Multimodal Digital Forensics &amp; Deepfake Verification
            </p>
            <h1 className="text-3xl lg:text-4xl font-display font-bold tracking-tight text-slate-900">
              See Beyond the Surface. Verify What You Trust.
            </h1>
            <p className="text-sm sm:text-base text-slate-600 max-w-xl leading-relaxed">
              TruthLens inspects visual compression artifacts, acoustic spectral signatures, speech transcripts, and contextual claims in parallel—pairing every finding with benign counter-hypotheses and cryptographic Trust Passports.
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="button"
                onClick={onStartNew}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium bg-slate-900 hover:bg-slate-800 text-white rounded-md transition-colors whitespace-nowrap shrink-0"
              >
                <FileSearch className="w-4 h-4" />
                New Forensic Analysis
              </button>
              {onOpenResults && (
                <button
                  type="button"
                  onClick={onOpenResults}
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-800 rounded-md transition-colors whitespace-nowrap shrink-0"
                >
                  <ShieldAlert className="w-4 h-4 text-blue-700" />
                  Open Active Results
                </button>
              )}
              <button
                type="button"
                onClick={onOpenHistory}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-md transition-colors whitespace-nowrap shrink-0"
              >
                <History className="w-4 h-4 text-slate-500" />
                Analysis History
              </button>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            className="lg:col-span-6"
          >
            <ForensicPrism3D
              confidence={activeConfidence}
              waveformBins={activeWaveform}
              heightClass="h-[340px]"
              compact
            />
          </motion.div>
        </div>
      </section>

      {/* Real SQLite KPI Strip */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi, idx) => (
          <motion.div
            key={kpi.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, delay: idx * 0.05, ease: [0.16, 1, 0.3, 1] }}
            className="forensic-kpi-3d rounded-xl p-5 space-y-2"
          >
            <p className="text-xs font-medium text-slate-500">{kpi.label}</p>
            <p className="text-3xl font-display font-bold tabular-nums text-slate-900">
              {loading ? '—' : kpi.value}
            </p>
            <p className="text-xs text-slate-500">{kpi.note}</p>
          </motion.div>
        ))}
      </section>

      {/* Recent Analysis History */}
      <section className="forensic-bezel rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div>
            <h2 className="text-base font-display font-semibold text-slate-900">Recent Forensic Investigations</h2>
            <p className="text-xs text-slate-500">Live records loaded from local SQLite history</p>
          </div>
          <button
            type="button"
            onClick={onStartNew}
            className="text-xs font-medium text-blue-700 hover:text-blue-800 inline-flex items-center gap-1 whitespace-nowrap shrink-0"
          >
            Analyze New Media <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {loading ? (
          <div className="p-6 text-sm text-slate-500">Loading investigation records...</div>
        ) : !stats || stats.recent_investigations.length === 0 ? (
          <div className="p-10 text-center space-y-3">
            <ShieldAlert className="w-8 h-8 text-slate-400 mx-auto" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-slate-800">No investigations recorded yet</p>
              <p className="text-xs text-slate-500">
                Upload images, video, audio, or contextual documents to start a multimodal investigation.
              </p>
            </div>
            <div className="flex justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={onStartNew}
                className="px-4 py-2 text-xs font-medium bg-slate-900 hover:bg-slate-800 text-white rounded-md transition-colors"
              >
                Start First Analysis
              </button>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-medium text-slate-500 bg-slate-50/80">
                  <th className="py-3 px-4">Investigation ID</th>
                  <th className="py-3 px-4">Title / Primary File</th>
                  <th className="py-3 px-4">Mode</th>
                  <th className="py-3 px-4">Assessment</th>
                  <th className="py-3 px-4 text-right">Index</th>
                  <th className="py-3 px-4 text-right">Date</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/80">
                {stats.recent_investigations.map((inv) => (
                  <tr key={inv.investigation_id} className="hover:bg-slate-50/90 transition-colors">
                    <td className="py-3 px-4 font-mono text-xs text-blue-700 whitespace-nowrap">
                      {inv.investigation_id}
                    </td>
                    <td className="py-3 px-4 max-w-[260px]">
                      <p className="font-medium text-slate-900 truncate">{inv.title}</p>
                      <p className="text-xs text-slate-500 truncate">{inv.primary_filename} · {inv.source_count} file(s)</p>
                    </td>
                    <td className="py-3 px-4 text-xs font-mono uppercase text-slate-600 whitespace-nowrap">
                      {inv.mode === 'demo' ? 'Reference' : 'Live'}
                    </td>
                    <td className="py-3 px-4">
                      <span className={`inline-block text-xs px-2 py-0.5 rounded border ${getAssessmentAccent(inv.assessment_category)}`}>
                        {inv.assessment_category}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-800 whitespace-nowrap">
                      {inv.overall_indicator_index !== null ? `${inv.overall_indicator_index}/100` : 'N/A'}
                    </td>
                    <td className="py-3 px-4 text-right text-xs text-slate-500 whitespace-nowrap tabular-nums">
                      {formatDateTime(inv.created_at)}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => onOpenInvestigation(inv.investigation_id)}
                        className="text-xs font-medium text-blue-700 hover:text-blue-800"
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
