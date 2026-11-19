import { useEffect, useState } from 'react';
import { CheckCircle2, FileDown, FileJson, Fingerprint, QrCode, ShieldCheck, XCircle } from 'lucide-react';
import { formatDateTime } from '../lib/formatters';
import type { InvestigationReport } from '../types/forensics';

interface VerificationResponse {
  verified: boolean;
  investigation_id?: string;
  title?: string;
  mode?: string;
  created_at?: string;
  report_sha256?: string;
  error?: string;
  integrity_vs_authenticity_note?: string;
}

export function ReportsPage({
  report,
  initialVerifyId = null,
  initialVerifyHash = null,
  onStartNew,
}: {
  report: InvestigationReport | null;
  initialVerifyId?: string | null;
  initialVerifyHash?: string | null;
  onStartNew: () => void;
}) {
  const [verifyId, setVerifyId] = useState(initialVerifyId || report?.investigation_id || '');
  const [verifyHash, setVerifyHash] = useState(initialVerifyHash || '');
  const [verifyResult, setVerifyResult] = useState<VerificationResponse | null>(null);
  const [verifying, setVerifying] = useState(false);

  const runVerification = async (idToVerify: string, hashPrefix: string) => {
    if (!idToVerify.trim()) return;
    setVerifying(true);
    try {
      const qs = hashPrefix.trim() ? `?hash=${encodeURIComponent(hashPrefix.trim())}` : '';
      const res = await fetch(`/api/verify/${encodeURIComponent(idToVerify.trim())}${qs}`);
      const data = (await res.json()) as VerificationResponse;
      setVerifyResult(data);
    } catch {
      setVerifyResult({ verified: false, error: 'Verification request failed.' });
    } finally {
      setVerifying(false);
    }
  };

  useEffect(() => {
    if (initialVerifyId) {
      setVerifyId(initialVerifyId);
      setVerifyHash(initialVerifyHash || '');
      void runVerification(initialVerifyId, initialVerifyHash || '');
    } else if (report) {
      setVerifyId(report.investigation_id);
    }
  }, [initialVerifyId, initialVerifyHash, report]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-slate-900">Forensic Reports &amp; Trust Passport</h1>
          <p className="text-sm text-slate-600">
            Export cryptographic PDF &amp; JSON forensic dossiers and verify report integrity via Trust Passport.
          </p>
        </div>

        {report && (
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <a
              href={`/api/investigations/${report.investigation_id}/export/pdf`}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium bg-slate-900 hover:bg-slate-800 text-white rounded-md transition-colors whitespace-nowrap shrink-0"
            >
              <FileDown className="w-4 h-4" /> Download Forensic PDF
            </a>
            <a
              href={`/api/investigations/${report.investigation_id}/export/json`}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-md transition-colors whitespace-nowrap shrink-0"
            >
              <FileJson className="w-4 h-4" /> Download Raw JSON
            </a>
          </div>
        )}
      </div>

      {report ? (
        <section className="forensic-bezel rounded-xl p-6 space-y-5">
          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
            <div className="space-y-4 flex-1 min-w-0">
              <div className="flex items-center gap-2 text-blue-700">
                <Fingerprint className="w-5 h-5 shrink-0" />
                <h2 className="text-base font-display font-semibold text-slate-900">
                  Trust Passport — Cryptographic Report Integrity
                </h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="space-y-1">
                  <p className="text-slate-500">Investigation ID</p>
                  <p className="font-mono text-slate-900 font-semibold">{report.trust_passport.investigation_id}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-slate-500">Analysis Timestamp</p>
                  <p className="font-mono tabular-nums text-slate-900">
                    {formatDateTime(report.trust_passport.analysis_timestamp)}
                  </p>
                </div>
                <div className="sm:col-span-2 space-y-1">
                  <p className="text-slate-500">Report SHA-256 Digest</p>
                  <p className="font-mono text-blue-800 break-all bg-slate-50 border border-slate-200 rounded px-3 py-2">
                    {report.trust_passport.report_sha256}
                  </p>
                </div>
              </div>

              <div className="space-y-2 text-xs">
                <p className="font-medium text-slate-700">Source File SHA-256 Digests</p>
                <div className="space-y-1.5">
                  {report.trust_passport.source_hashes.map((sh) => (
                    <div
                      key={sh.source_id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 bg-slate-50 border border-slate-200 rounded px-3 py-2 font-mono"
                    >
                      <span className="text-slate-900 truncate">
                        {sh.source_id} · {sh.filename}
                      </span>
                      <span className="text-slate-500 truncate">{sh.sha256}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2 text-xs">
                <p className="font-medium text-slate-700">Detector &amp; Model Versions</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 font-mono">
                  {Object.entries(report.trust_passport.detector_versions).map(([k, v]) => (
                    <div key={k} className="bg-slate-50 border border-slate-200 rounded px-2.5 py-1.5">
                      <span className="text-slate-500">{k}: </span>
                      <span className="text-slate-900">{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-col items-center justify-center border border-slate-200 bg-slate-50 rounded-lg p-4 space-y-2.5 shrink-0 lg:w-56">
              {report.trust_passport.qr_data_url ? (
                <img
                  src={report.trust_passport.qr_data_url}
                  alt="Trust Passport Verification QR Code"
                  className="w-40 h-40 rounded bg-white border border-slate-200 p-1"
                />
              ) : (
                <QrCode className="w-24 h-24 text-slate-400" />
              )}
              <p className="text-[11px] text-center text-slate-500 leading-snug">
                Scan to open local Trust Passport integrity check
              </p>
            </div>
          </div>

          <div className="border-t border-slate-200 pt-4 flex items-start gap-2.5 text-xs text-slate-600">
            <ShieldCheck className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              <strong className="text-slate-900">Report Integrity vs. Media Authenticity:</strong>{' '}
              {report.trust_passport.integrity_vs_authenticity_note}
            </p>
          </div>
        </section>
      ) : (
        <div className="forensic-bezel rounded-xl p-8 text-center space-y-3">
          <p className="text-sm text-slate-600">No investigation currently active for PDF export.</p>
          <button
            type="button"
            onClick={onStartNew}
            className="px-4 py-2 text-xs font-medium bg-slate-900 hover:bg-slate-800 text-white rounded-md"
          >
            Start New Forensic Analysis
          </button>
        </div>
      )}

      {/* Local Trust Passport Integrity Verifier */}
      <section className="forensic-bezel rounded-xl p-5 space-y-4">
        <div>
          <h2 className="text-base font-display font-semibold text-slate-900">
            Trust Passport Integrity Verifier
          </h2>
          <p className="text-xs text-slate-500">
            Verify any exported TruthLens Investigation ID and optional SHA-256 prefix against the local SQLite registry.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          <input
            type="text"
            value={verifyId}
            onChange={(e) => setVerifyId(e.target.value)}
            placeholder="Investigation ID (e.g. TL-...)"
            className="md:col-span-5 px-3 py-2 text-xs font-mono bg-white border border-slate-200 rounded-md text-slate-900 focus:outline-none focus:border-blue-600"
          />
          <input
            type="text"
            value={verifyHash}
            onChange={(e) => setVerifyHash(e.target.value)}
            placeholder="Optional SHA-256 hash prefix..."
            className="md:col-span-5 px-3 py-2 text-xs font-mono bg-white border border-slate-200 rounded-md text-slate-900 focus:outline-none focus:border-blue-600"
          />
          <button
            type="button"
            disabled={verifying || !verifyId.trim()}
            onClick={() => runVerification(verifyId, verifyHash)}
            className="md:col-span-2 px-4 py-2 text-xs font-medium bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white rounded-md transition-colors whitespace-nowrap"
          >
            {verifying ? 'Checking...' : 'Verify Digest'}
          </button>
        </div>

        {verifyResult && (
          <div
            className={`p-4 rounded-md border text-xs space-y-1.5 ${
              verifyResult.verified
                ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                : 'border-red-200 bg-red-50 text-red-900'
            }`}
          >
            <div className="flex items-center gap-2 font-semibold">
              {verifyResult.verified ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-700" />
              ) : (
                <XCircle className="w-4 h-4 text-red-700" />
              )}
              <span>
                {verifyResult.verified
                  ? 'Report Integrity Verified in Local Registry'
                  : verifyResult.error || 'Hash Mismatch or Record Not Found'}
              </span>
            </div>
            {verifyResult.report_sha256 && (
              <p className="font-mono text-slate-700 break-all">
                Registry SHA-256: {verifyResult.report_sha256}
              </p>
            )}
            {verifyResult.integrity_vs_authenticity_note && (
              <p className="text-slate-600">{verifyResult.integrity_vs_authenticity_note}</p>
            )}
          </div>
        )}
      </section>

      {report && (
        <section className="forensic-well rounded-xl p-4 text-xs text-slate-600">
          <p className="font-semibold text-slate-800 mb-1">Mandatory Forensic Disclaimer</p>
          <p>{report.disclaimer}</p>
        </section>
      )}
    </div>
  );
}
