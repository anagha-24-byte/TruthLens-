import { useMemo, useState } from 'react';
import { FileDown, FileJson, FolderOpen, Search, ShieldOff, Trash2 } from 'lucide-react';
import { formatDateTime, getAssessmentAccent } from '../lib/formatters';
import type { InvestigationSummary } from '../types/forensics';

interface HistoryPageProps {
  investigations: InvestigationSummary[];
  loading: boolean;
  onOpenInvestigation: (id: string) => void;
  onPurgeMedia: (id: string) => Promise<void>;
  onDeleteInvestigation: (id: string) => Promise<void>;
  onStartNew: () => void;
}

export function HistoryPage({
  investigations,
  loading,
  onOpenInvestigation,
  onPurgeMedia,
  onDeleteInvestigation,
  onStartNew,
}: HistoryPageProps) {
  const [query, setQuery] = useState('');
  const [modeFilter, setModeFilter] = useState<'all' | 'live' | 'demo'>('all');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return investigations.filter((inv) => {
      if (modeFilter !== 'all' && inv.mode !== modeFilter) return false;
      if (!q) return true;
      return (
        inv.investigation_id.toLowerCase().includes(q) ||
        inv.title.toLowerCase().includes(q) ||
        inv.primary_filename.toLowerCase().includes(q) ||
        inv.assessment_category.toLowerCase().includes(q)
      );
    });
  }, [investigations, query, modeFilter]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-slate-900">Analysis History</h1>
          <p className="text-sm text-slate-600">
            SQLite-persisted investigation registry. Reopen past analyses, download reports, or purge retained media files.
          </p>
        </div>

        <button
          type="button"
          onClick={onStartNew}
          className="px-4 py-2 text-xs font-medium bg-slate-900 hover:bg-slate-800 text-white rounded-md transition-colors whitespace-nowrap shrink-0"
        >
          New Forensic Analysis
        </button>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by Investigation ID, filename, or assessment..."
            className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-slate-200 rounded-md text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-600"
          />
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 border border-slate-200 rounded-lg w-fit">
          {(['all', 'live', 'demo'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setModeFilter(m)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors capitalize ${
                modeFilter === m ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {m === 'all' ? 'All Records' : m === 'live' ? 'Live Analyses' : 'Reference Cases'}
            </button>
          ))}
        </div>
      </div>

      {/* Ledger Table */}
      <section className="forensic-bezel rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-6 text-sm text-slate-500">Loading SQLite investigation history...</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-xs text-slate-500 space-y-2">
            <p>No investigations match your filter.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-medium text-slate-500 bg-slate-50/80">
                  <th className="py-3 px-4">ID &amp; Mode</th>
                  <th className="py-3 px-4">Title &amp; Primary Source</th>
                  <th className="py-3 px-4">Assessment</th>
                  <th className="py-3 px-4 text-right">Flagged / Review</th>
                  <th className="py-3 px-4 text-right">Date</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/80">
                {filtered.map((inv) => (
                  <tr key={inv.investigation_id} className="hover:bg-slate-50/90 transition-colors">
                    <td className="py-3 px-4 whitespace-nowrap">
                      <p className="font-mono text-xs text-blue-700 font-semibold">{inv.investigation_id}</p>
                      <p className="text-[11px] font-mono text-slate-500 uppercase">
                        {inv.mode === 'demo' ? 'Reference' : 'Live'}
                        {inv.media_purged ? ' · Media Purged' : ''}
                      </p>
                    </td>
                    <td className="py-3 px-4 max-w-[260px]">
                      <p className="font-medium text-slate-900 truncate">{inv.title}</p>
                      <p className="text-xs text-slate-500 truncate">
                        {inv.primary_filename} · {inv.source_count} source(s)
                      </p>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`inline-block text-xs px-2 py-0.5 rounded border ${getAssessmentAccent(inv.assessment_category)}`}>
                        {inv.assessment_category}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-xs tabular-nums text-slate-700 whitespace-nowrap">
                      {inv.suspicious_count} flagged · {inv.needs_review_count} review
                    </td>
                    <td className="py-3 px-4 text-right text-xs text-slate-500 whitespace-nowrap tabular-nums">
                      {formatDateTime(inv.created_at)}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onOpenInvestigation(inv.investigation_id)}
                          title="Reopen investigation"
                          className="p-1.5 text-blue-700 hover:bg-blue-50 rounded transition-colors"
                        >
                          <FolderOpen className="w-4 h-4" />
                        </button>
                        <a
                          href={`/api/investigations/${inv.investigation_id}/export/pdf`}
                          title="Download PDF"
                          className="p-1.5 text-slate-600 hover:bg-slate-100 rounded transition-colors"
                        >
                          <FileDown className="w-4 h-4" />
                        </a>
                        <a
                          href={`/api/investigations/${inv.investigation_id}/export/json`}
                          title="Download JSON"
                          className="p-1.5 text-slate-600 hover:bg-slate-100 rounded transition-colors"
                        >
                          <FileJson className="w-4 h-4" />
                        </a>
                        {!inv.media_purged && inv.mode === 'live' && (
                          <button
                            type="button"
                            onClick={() => onPurgeMedia(inv.investigation_id)}
                            title="Purge retained media artifacts"
                            className="p-1.5 text-amber-700 hover:bg-amber-50 rounded transition-colors"
                          >
                            <ShieldOff className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onDeleteInvestigation(inv.investigation_id)}
                          title="Delete investigation record"
                          className="p-1.5 text-red-700 hover:bg-red-50 rounded transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
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
