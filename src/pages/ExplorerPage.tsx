import { useEffect, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Eye, Layers, ScanEye } from 'lucide-react';
import { SpectralTerrain3D } from '../components/SpectralTerrain3D';
import { formatBytes, formatTimestamp } from '../lib/formatters';
import type { InvestigationReport } from '../types/forensics';

const EXPLORER_VIEW_KEY = 'truthlens_explorer_view_mode';
const EXPLORER_OVERLAY_KEY = 'truthlens_explorer_overlay';

export function ExplorerPage({
  report,
  onStartNew,
}: {
  report: InvestigationReport | null;
  onStartNew: () => void;
}) {
  const [selectedFrameIdx, setSelectedFrameIdx] = useState(0);
  const [viewMode, setViewMode] = useState<'original' | 'ela'>(() => {
    try {
      return window.localStorage.getItem(EXPLORER_VIEW_KEY) === 'ela' ? 'ela' : 'original';
    } catch {
      return 'original';
    }
  });
  const [showOverlay, setShowOverlay] = useState(() => {
    try {
      const stored = window.localStorage.getItem(EXPLORER_OVERLAY_KEY);
      return stored === null ? true : stored === 'true';
    } catch {
      return true;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(EXPLORER_VIEW_KEY, viewMode);
    } catch {
      // ignore storage errors
    }
  }, [viewMode]);

  useEffect(() => {
    try {
      window.localStorage.setItem(EXPLORER_OVERLAY_KEY, String(showOverlay));
    } catch {
      // ignore storage errors
    }
  }, [showOverlay]);

  if (!report) {
    return (
      <div className="forensic-bezel rounded-xl p-10 text-center space-y-3">
        <ScanEye className="w-8 h-8 text-slate-400 mx-auto" />
        <h2 className="text-lg font-display font-semibold text-slate-900">Evidence Explorer Empty</h2>
        <p className="text-xs text-slate-500">Run or reopen an investigation to inspect extracted frames, ELA heatmaps, audio DSP, and metadata.</p>
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

  const imageSource = report.sources.find((s) => s.kind === 'image');
  const safeFrameIdx = report.frames.length > 0 ? Math.min(selectedFrameIdx, report.frames.length - 1) : 0;
  const activeFrame = report.frames[safeFrameIdx] || null;
  const activeVisualUrl =
    viewMode === 'ela'
      ? activeFrame?.elaImageUrl || imageSource?.elaUrl || activeFrame?.imageUrl || imageSource?.artifactUrl
      : activeFrame?.imageUrl || imageSource?.artifactUrl;

  const matchingBoxes = report.findings.filter(
    (f) =>
      f.box_2d &&
      (!activeFrame || f.timestamp === null || Math.abs(f.timestamp - activeFrame.timestampSec) <= 1.5)
  );

  const primaryAudio = report.audio_analyses[0] || null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-slate-900">Evidence Explorer</h1>
        <p className="text-sm text-slate-600">
          Inspect original evidence frames, Error Level Analysis (ELA) compression heatmaps, DSP audio metrics, and container metadata without altering originals.
        </p>
      </div>

      {/* Visual & Frame Comparator */}
      <section className="forensic-bezel rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-display font-semibold text-slate-900">
            Visual Frame &amp; ELA Compression Comparator
          </h2>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 p-1 bg-slate-100 border border-slate-200 rounded-md">
              <button
                type="button"
                onClick={() => setViewMode('original')}
                className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                  viewMode === 'original' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Original Frame
              </button>
              <button
                type="button"
                onClick={() => setViewMode('ela')}
                className={`px-3 py-1 text-xs font-medium rounded transition-colors inline-flex items-center gap-1 ${
                  viewMode === 'ela' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Layers className="w-3.5 h-3.5" /> ELA Heatmap
              </button>
            </div>

            <button
              type="button"
              onClick={() => setShowOverlay((s) => !s)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                showOverlay
                  ? 'bg-blue-50 border-blue-200 text-blue-800'
                  : 'bg-white border-slate-200 text-slate-600'
              }`}
            >
              <Eye className="w-3.5 h-3.5" /> Region Overlays
            </button>
          </div>
        </div>

        {activeVisualUrl ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-8 relative bg-slate-100 border border-slate-200 rounded-md overflow-hidden flex items-center justify-center min-h-[300px]">
              <img
                src={activeVisualUrl}
                alt={viewMode === 'ela' ? 'Error Level Analysis Heatmap' : 'Original Extracted Frame'}
                referrerPolicy="no-referrer"
                className="w-full max-h-[420px] object-contain"
              />
              {showOverlay &&
                matchingBoxes.map((f) => (
                  <div
                    key={f.finding_id}
                    className="absolute pointer-events-none border-2 border-red-600 bg-red-500/10"
                    style={{
                      top: `${f.box_2d![0] / 10}%`,
                      left: `${f.box_2d![1] / 10}%`,
                      height: `${(f.box_2d![2] - f.box_2d![0]) / 10}%`,
                      width: `${(f.box_2d![3] - f.box_2d![1]) / 10}%`,
                    }}
                  >
                    <span className="absolute -top-5 left-0 bg-red-600 text-white text-[10px] font-mono px-1.5 py-0.5 rounded-t">
                      {f.finding_id}: {f.indicator_category}
                    </span>
                  </div>
                ))}
            </div>

            <div className="lg:col-span-4 space-y-2 max-h-[420px] overflow-y-auto pr-1">
              <p className="text-xs font-medium text-slate-500">
                {report.frames.length > 0
                  ? `Extracted Video Frames (${report.frames.length})`
                  : 'Uploaded Visual Assets'}
              </p>
              {report.frames.map((fr, idx) => (
                <button
                  key={fr.frameId}
                  type="button"
                  onClick={() => setSelectedFrameIdx(idx)}
                  className={`w-full flex items-center gap-3 p-2 rounded-md border text-left transition-colors ${
                    selectedFrameIdx === idx
                      ? 'border-blue-600 bg-blue-50/70'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  {fr.imageUrl ? (
                    <img
                      src={fr.imageUrl}
                      alt={`Frame ${fr.frameNumber}`}
                      referrerPolicy="no-referrer"
                      className="w-16 h-10 object-cover rounded shrink-0 border border-slate-200"
                    />
                  ) : (
                    <div className="w-16 h-10 bg-slate-100 rounded shrink-0" />
                  )}
                  <div className="text-xs font-mono tabular-nums">
                    <p className="text-slate-900 font-semibold">
                      Frame #{fr.frameNumber} · {formatTimestamp(fr.timestampSec)}
                    </p>
                    <p className="text-slate-500">
                      Delta {fr.frameDeltaScore} · Luma {fr.lumaMean}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-xs text-slate-500 py-4">
            {report.media_purged
              ? 'Original visual artifacts were purged per privacy settings.'
              : 'No image or video frames present in this investigation.'}
          </p>
        )}
      </section>

      {/* Audio DSP Charts & Transcript */}
      {primaryAudio && (
        <section className="forensic-bezel rounded-xl p-5 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-display font-semibold text-slate-900">
                Audio Signal DSP &amp; Speech Transcription
              </h2>
              <p className="text-xs text-slate-500">{primaryAudio.limitationsNote}</p>
            </div>
            <span className="text-xs font-mono text-slate-600 tabular-nums">
              {primaryAudio.sampleRate} Hz · {primaryAudio.durationSec}s
            </span>
          </div>

          <SpectralTerrain3D audio={primaryAudio} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="border border-slate-200 bg-slate-50 rounded-md p-3 space-y-2">
              <p className="text-xs font-medium text-slate-700">RMS Energy &amp; Zero-Crossing Rate</p>
              <div className="h-48 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={primaryAudio.timelineMetrics}>
                    <CartesianGrid stroke="#E2E8F0" strokeDasharray="3 3" />
                    <XAxis dataKey="timestampSec" unit="s" stroke="#64748B" tick={{ fontSize: 10, fill: '#475569' }} />
                    <YAxis stroke="#64748B" tick={{ fontSize: 10, fill: '#475569' }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#FFFFFF', border: '1px solid #E2E8F0', fontSize: '11px', color: '#0F172A' }}
                    />
                    <Area type="monotone" dataKey="rms" name="RMS Energy" stroke="#2563EB" fill="#2563EB" fillOpacity={0.15} />
                    <Area type="monotone" dataKey="zcr" name="ZCR" stroke="#4F46E5" fill="#4F46E5" fillOpacity={0.12} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="border border-slate-200 bg-slate-50 rounded-md p-3 space-y-2">
              <p className="text-xs font-medium text-slate-700">Spectral Centroid &amp; Bandwidth (Hz)</p>
              <div className="h-48 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={primaryAudio.timelineMetrics}>
                    <CartesianGrid stroke="#E2E8F0" strokeDasharray="3 3" />
                    <XAxis dataKey="timestampSec" unit="s" stroke="#64748B" tick={{ fontSize: 10, fill: '#475569' }} />
                    <YAxis stroke="#64748B" tick={{ fontSize: 10, fill: '#475569' }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#FFFFFF', border: '1px solid #E2E8F0', fontSize: '11px', color: '#0F172A' }}
                    />
                    <Line type="monotone" dataKey="spectralCentroidHz" name="Centroid Hz" stroke="#2563EB" dot={false} />
                    <Line type="monotone" dataKey="spectralBandwidthHz" name="Bandwidth Hz" stroke="#D97706" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="border border-slate-200 bg-slate-50 rounded-md p-4 space-y-2">
            <p className="text-xs font-semibold text-slate-800">Timestamped Speech Transcription</p>
            {primaryAudio.transcript.length > 0 ? (
              <div className="space-y-2 text-xs">
                {primaryAudio.transcript.map((seg, i) => (
                  <div key={i} className="flex gap-3">
                    <span className="font-mono text-blue-700 tabular-nums shrink-0">
                      {formatTimestamp(seg.startSec)} – {formatTimestamp(seg.endSec)}
                    </span>
                    <span className="text-slate-700">{seg.text}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-600">
                {primaryAudio.fullTranscriptText || 'No intelligible speech transcribed.'}
              </p>
            )}
          </div>
        </section>
      )}

      {/* Container Metadata Table */}
      <section className="forensic-bezel rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200">
          <h2 className="text-base font-display font-semibold text-slate-900">
            Media Container &amp; FFprobe Metadata Inspector
          </h2>
          <p className="text-xs text-slate-500">
            Editing software signatures and stripped timestamps are normal in social compression and are never proof of manipulation.
          </p>
        </div>

        <div className="divide-y divide-slate-200">
          {report.sources.map((src) => (
            <div key={src.source_id} className="p-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-900">
                  <span className="font-mono text-blue-700 mr-2">{src.source_id}</span>
                  {src.originalName}
                </p>
                <span className="text-xs font-mono text-slate-500 tabular-nums">
                  SHA-256: {src.sha256.slice(0, 20)}...
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 text-xs">
                <div>
                  <p className="text-slate-500">Format</p>
                  <p className="font-mono text-slate-900 truncate">{src.metadata.formatName}</p>
                </div>
                <div>
                  <p className="text-slate-500">Size</p>
                  <p className="font-mono tabular-nums text-slate-900">{formatBytes(src.sizeBytes)}</p>
                </div>
                <div>
                  <p className="text-slate-500">Resolution</p>
                  <p className="font-mono tabular-nums text-slate-900">
                    {src.metadata.width && src.metadata.height
                      ? `${src.metadata.width}×${src.metadata.height}`
                      : 'N/A'}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Frame Rate / Audio</p>
                  <p className="font-mono tabular-nums text-slate-900">
                    {src.metadata.frameRate ? `${src.metadata.frameRate} fps` : src.metadata.audioSampleRate ? `${src.metadata.audioSampleRate} Hz` : 'N/A'}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Codecs</p>
                  <p className="font-mono text-slate-900 truncate">
                    {[src.metadata.videoCodec, src.metadata.audioCodec].filter(Boolean).join(' / ') || 'N/A'}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Encoder / Creation</p>
                  <p className="font-mono text-slate-900 truncate">
                    {src.metadata.encoderTag || src.metadata.creationTime || 'Absent'}
                  </p>
                </div>
              </div>

              {src.metadata.anomalies.length > 0 && (
                <p className="text-xs text-amber-800">
                  Metadata Advisories: {src.metadata.anomalies.join(' ')}
                </p>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
