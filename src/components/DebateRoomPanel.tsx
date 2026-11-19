import { Scale, Search, ShieldQuestion } from 'lucide-react';
import type { DebateRoomPerspective } from '../types/forensics';

export function DebateRoomPanel({
  debate,
  onSelectFindingId,
}: {
  debate: DebateRoomPerspective;
  onSelectFindingId: (findingId: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-lg font-display font-semibold text-slate-900">Forensic Debate Room</h3>
          <p className="text-xs text-slate-500">
            Three analytical perspectives grounded strictly in the verified findings of this investigation.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Investigator */}
        <section className="forensic-bezel rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2 text-red-700">
            <Search className="w-4 h-4 shrink-0" />
            <h4 className="text-sm font-display font-semibold">Investigator Perspective</h4>
          </div>
          <p className="text-sm text-slate-800 leading-relaxed">{debate.investigator.summary}</p>
          <div className="space-y-3 pt-2 border-t border-slate-200">
            {debate.investigator.key_arguments.map((arg, idx) => (
              <div key={idx} className="space-y-1.5 text-xs">
                <p className="text-slate-700 leading-relaxed">{arg.claim}</p>
                <div className="flex flex-wrap gap-1.5">
                  {arg.cited_finding_ids.map((fid) => (
                    <button
                      key={fid}
                      type="button"
                      onClick={() => onSelectFindingId(fid)}
                      className="font-mono text-[11px] px-1.5 py-0.5 bg-red-50 hover:bg-red-100 text-red-800 border border-red-200 rounded transition-colors"
                    >
                      Cite {fid}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Skeptic */}
        <section className="forensic-bezel rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2 text-blue-700">
            <ShieldQuestion className="w-4 h-4 shrink-0" />
            <h4 className="text-sm font-display font-semibold">Skeptic Perspective</h4>
          </div>
          <p className="text-sm text-slate-800 leading-relaxed">{debate.skeptic.summary}</p>
          <div className="space-y-3 pt-2 border-t border-slate-200">
            {debate.skeptic.alternative_hypotheses.map((hyp, idx) => (
              <div key={idx} className="space-y-1.5 text-xs">
                <p className="text-slate-700 leading-relaxed">{hyp.hypothesis}</p>
                <div className="flex flex-wrap gap-1.5">
                  {hyp.cited_finding_ids.map((fid) => (
                    <button
                      key={fid}
                      type="button"
                      onClick={() => onSelectFindingId(fid)}
                      className="font-mono text-[11px] px-1.5 py-0.5 bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 rounded transition-colors"
                    >
                      Cite {fid}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Adjudicator */}
        <section className="forensic-bezel rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2 text-slate-900">
            <Scale className="w-4 h-4 shrink-0 text-slate-700" />
            <h4 className="text-sm font-display font-semibold">Adjudicator Synthesis</h4>
          </div>
          <p className="text-sm text-slate-800 leading-relaxed">{debate.adjudicator.balanced_summary}</p>

          <div className="space-y-3 pt-2 border-t border-slate-200 text-xs">
            {debate.adjudicator.verified_observations.length > 0 && (
              <div>
                <p className="font-semibold text-emerald-700 mb-1">Verified Telemetry</p>
                <ul className="list-disc pl-4 space-y-1 text-slate-700">
                  {debate.adjudicator.verified_observations.map((o, i) => (
                    <li key={i}>{o}</li>
                  ))}
                </ul>
              </div>
            )}
            {debate.adjudicator.unresolved_uncertainties.length > 0 && (
              <div>
                <p className="font-semibold text-amber-800 mb-1">Unresolved Uncertainties</p>
                <ul className="list-disc pl-4 space-y-1 text-slate-700">
                  {debate.adjudicator.unresolved_uncertainties.map((u, i) => (
                    <li key={i}>{u}</li>
                  ))}
                </ul>
              </div>
            )}
            {debate.adjudicator.recommended_next_steps.length > 0 && (
              <div>
                <p className="font-semibold text-blue-700 mb-1">Human Verification Steps</p>
                <ul className="list-disc pl-4 space-y-1 text-slate-700">
                  {debate.adjudicator.recommended_next_steps.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
