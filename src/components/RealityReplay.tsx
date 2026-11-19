import { useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play, RotateCcw, Eye } from 'lucide-react';
import { formatTimestamp, SEVERITY_META } from '../lib/formatters';
import { SeverityIndicator } from './SeverityBadge';
import type { ForensicFinding, InvestigationReport } from '../types/forensics';

interface RealityReplayProps {
  report: InvestigationReport;
  initialTimestamp?: number | null;
  selectedFindingId?: string | null;
  onSelectFinding?: (finding: ForensicFinding) => void;
}

export function RealityReplay({
  report,
  initialTimestamp = null,
  selectedFindingId = null,
  onSelectFinding,
}: RealityReplayProps) {
  const videoSource = report.sources.find((s) => s.kind === 'video' && s.artifactUrl && s.artifactUrl.endsWith('.mp4'));
  const audioSource = report.sources.find((s) => s.kind === 'audio' && s.artifactUrl);
  const primaryAudioDsp = report.audio_analyses[0];

  const duration = useMemo(() => {
    const d1 = report.sources.find((s) => s.metadata.durationSec)?.metadata.durationSec || 0;
    const d2 = primaryAudioDsp?.durationSec || 0;
    const d3 = report.frames.length > 0 ? Math.max(...report.frames.map((f) => f.timestampSec)) + 1 : 0;
    return Math.max(1, d1, d2, d3);
  }, [report, primaryAudioDsp]);

  const [currentTime, setCurrentTime] = useState<number>(initialTimestamp ?? 0);
  const [playing, setPlaying] = useState(false);
  const [showBoundingBox, setShowBoundingBox] = useState(true);

  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement | null>(null);

  useEffect(() => {
    if (initialTimestamp !== null && initialTimestamp !== undefined) {
      seekTo(initialTimestamp);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTimestamp]);

  // Fallback timer when playing frame-sequence (e.g. reference case or purged video)
  useEffect(() => {
    if (!playing || videoSource || audioSource) return;
    const id = window.setInterval(() => {
      setCurrentTime((prev) => {
        const next = prev + 0.1;
        if (next >= duration) {
          setPlaying(false);
          return 0;
        }
        return Number(next.toFixed(2));
      });
    }, 100);
    return () => window.clearInterval(id);
  }, [playing, videoSource, audioSource, duration]);

  const seekTo = (sec: number) => {
    const clamped = Math.max(0, Math.min(duration, sec));
    setCurrentTime(clamped);
    if (mediaRef.current) {
      mediaRef.current.currentTime = clamped;
    }
  };

  const togglePlay = () => {
    if (mediaRef.current) {
      if (playing) {
        mediaRef.current.pause();
        setPlaying(false);
      } else {
        void mediaRef.current.play();
        setPlaying(true);
      }
    } else {
      setPlaying((p) => !p);
    }
  };

  const activeFrame = useMemo(() => {
    if (report.frames.length === 0) return null;
    let closest = report.frames[0];
    let minDiff = Math.abs(closest.timestampSec - currentTime);
    for (const fr of report.frames) {
      const diff = Math.abs(fr.timestampSec - currentTime);
      if (diff < minDiff) {
        closest = fr;
        minDiff = diff;
      }
    }
    return closest;
  }, [report.frames, currentTime]);

  const activeFindings = useMemo(() => {
    return report.findings.filter(
      (f) => f.timestamp !== null && Math.abs(f.timestamp - currentTime) <= 0.75
    );
  }, [report.findings, currentTime]);

  const highlightedFinding =
    report.findings.find((f) => f.finding_id === selectedFindingId) ||
    activeFindings.find((f) => f.box_2d) ||
    report.findings.find((f) => f.box_2d) ||
    null;

  const activeTranscript = primaryAudioDsp?.transcript.find(
    (seg) => currentTime >= seg.startSec && currentTime <= seg.endSec
  );

  const waveformBins = primaryAudioDsp?.waveformBins || Array.from({ length: 80 }, () => 0.2);

  return (
    <section className="forensic-bezel rounded-xl p-5 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-display font-semibold text-slate-900">Reality Replay Synchronized Player</h3>
          <p className="text-xs text-slate-500">
            Scrub across frames, audio waveform, and timestamped indicators simultaneously.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowBoundingBox((v) => !v)}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 ${
            showBoundingBox
              ? 'bg-blue-50 border-blue-200 text-blue-800'
              : 'bg-white border-slate-200 text-slate-600'
          }`}
        >
          <Eye className="w-3.5 h-3.5" />
          {showBoundingBox ? 'Bounding Overlay On' : 'Bounding Overlay Off'}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        {/* Visual Viewport */}
        <div className="lg:col-span-7 relative bg-slate-100 border border-slate-200 rounded-md overflow-hidden flex items-center justify-center min-h-[280px]">
          {videoSource && videoSource.artifactUrl ? (
            <video
              ref={(el) => {
                mediaRef.current = el;
              }}
              src={videoSource.artifactUrl}
              onTimeUpdate={(e) => setCurrentTime(Number(e.currentTarget.currentTime.toFixed(2)))}
              onEnded={() => setPlaying(false)}
              className="w-full max-h-[360px] object-contain"
              playsInline
            />
          ) : activeFrame?.imageUrl || report.sources.find((s) => s.kind === 'image')?.artifactUrl ? (
            <div className="relative w-full h-full flex items-center justify-center">
              <img
                src={activeFrame?.imageUrl || report.sources.find((s) => s.kind === 'image')?.artifactUrl || ''}
                alt={`Extracted forensic frame at ${formatTimestamp(currentTime)}`}
                referrerPolicy="no-referrer"
                className="w-full max-h-[360px] object-contain"
              />
            </div>
          ) : (
            <div className="p-8 text-center text-xs text-slate-500">
              Visual frame stream unavailable (audio/text investigation or media purged).
            </div>
          )}

          {/* Grounded box_2d Bounding Box Overlay */}
          {showBoundingBox && highlightedFinding?.box_2d && (
            <div
              className="absolute pointer-events-none border-2 border-red-600 bg-red-500/10"
              style={{
                top: `${highlightedFinding.box_2d[0] / 10}%`,
                left: `${highlightedFinding.box_2d[1] / 10}%`,
                height: `${(highlightedFinding.box_2d[2] - highlightedFinding.box_2d[0]) / 10}%`,
                width: `${(highlightedFinding.box_2d[3] - highlightedFinding.box_2d[1]) / 10}%`,
              }}
            >
              <span className="absolute -top-5 left-0 bg-red-600 text-white text-[10px] font-mono px-1.5 py-0.5 rounded-t whitespace-nowrap">
                {highlightedFinding.finding_id}
              </span>
            </div>
          )}

          <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between px-3 py-1.5 rounded bg-slate-900/80 text-xs font-mono tabular-nums text-white pointer-events-none">
            <span>
              {formatTimestamp(currentTime)} / {formatTimestamp(duration)}
            </span>
            {activeFrame && <span>Frame #{activeFrame.frameNumber} · Delta {activeFrame.frameDeltaScore}</span>}
          </div>
        </div>

        {/* Synchronized Active Telemetry Panel */}
        <div className="lg:col-span-5 flex flex-col justify-between border border-slate-200 bg-slate-50 rounded-md p-4 space-y-4">
          <div className="space-y-3">
            <p className="text-xs font-semibold text-slate-600">
              Active Window Observations
            </p>
            {activeFindings.length > 0 ? (
              <div className="space-y-2.5">
                {activeFindings.map((f) => (
                  <button
                    key={f.finding_id}
                    type="button"
                    onClick={() => onSelectFinding?.(f)}
                    className="w-full text-left border border-slate-200 hover:border-blue-400 bg-white rounded-md p-3 space-y-1 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-mono text-blue-700 font-semibold">{f.finding_id}</span>
                      <SeverityIndicator severity={f.severity} compact />
                    </div>
                    <p className="text-sm font-medium text-slate-900">{f.indicator_title}</p>
                    <p className="text-xs text-slate-600 line-clamp-2">{f.observed_signal}</p>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500 leading-relaxed">
                No flagged anomalies within ±0.75s of {formatTimestamp(currentTime)}. Click any marker on the waveform scrubber below to jump directly to a suspicious timestamp.
              </p>
            )}
          </div>

          <div className="border-t border-slate-200 pt-3 space-y-1.5">
            <p className="text-xs font-medium text-slate-500">Synchronized Speech Transcript</p>
            <p className="text-xs text-slate-800 italic leading-relaxed min-h-[38px]">
              {activeTranscript
                ? `"${activeTranscript.text}"`
                : primaryAudioDsp?.fullTranscriptText
                  ? 'Silence / non-speech interval at current playhead.'
                  : 'No audio transcript available for this investigation.'}
            </p>
          </div>

          {audioSource && audioSource.artifactUrl && !videoSource && (
            <audio
              ref={(el) => {
                mediaRef.current = el;
              }}
              src={audioSource.artifactUrl}
              onTimeUpdate={(e) => setCurrentTime(Number(e.currentTarget.currentTime.toFixed(2)))}
              onEnded={() => setPlaying(false)}
              className="hidden"
            />
          )}
        </div>
      </div>

      {/* Transport + Interactive Waveform & Finding Pins */}
      <div className="space-y-3 pt-1">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={togglePlay}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-slate-900 hover:bg-slate-800 text-white rounded-md transition-colors whitespace-nowrap shrink-0"
          >
            {playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            {playing ? 'Pause' : 'Play Replay'}
          </button>
          <button
            type="button"
            onClick={() => {
              setPlaying(false);
              seekTo(0);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-md transition-colors whitespace-nowrap shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset
          </button>

          <input
            type="range"
            min={0}
            max={duration}
            step={0.05}
            value={currentTime}
            onChange={(e) => seekTo(Number(e.target.value))}
            aria-label="Replay timeline scrubber"
            className="flex-1 accent-blue-600 cursor-pointer"
          />
          <span className="text-xs font-mono tabular-nums text-slate-700 shrink-0">
            {formatTimestamp(currentTime)}
          </span>
        </div>

        {/* Waveform + Finding Pins */}
        <div className="relative h-20 bg-slate-50 border border-slate-200 rounded-md px-2 py-2 flex items-end gap-[2px] overflow-hidden">
          {waveformBins.map((amp, idx) => {
            const binTime = (idx / waveformBins.length) * duration;
            const passed = binTime <= currentTime;
            return (
              <button
                key={idx}
                type="button"
                onClick={() => seekTo(binTime)}
                title={`Seek to ${formatTimestamp(binTime)}`}
                className={`flex-1 rounded-t-sm transition-colors ${
                  passed ? 'bg-blue-600' : 'bg-slate-300 hover:bg-slate-400'
                }`}
                style={{ height: `${Math.max(10, Math.min(100, amp * 100))}%` }}
              />
            );
          })}

          {/* Playhead line */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-slate-900 pointer-events-none"
            style={{ left: `${Math.min(99.5, (currentTime / duration) * 100)}%` }}
          />

          {/* Finding Timestamp Pins */}
          {report.findings
            .filter((f) => f.timestamp !== null)
            .map((f) => {
              const pct = Math.max(1, Math.min(98, ((f.timestamp ?? 0) / duration) * 100));
              const sev = SEVERITY_META[f.severity];
              return (
                <button
                  key={f.finding_id}
                  type="button"
                  onClick={() => {
                    seekTo(f.timestamp!);
                    onSelectFinding?.(f);
                  }}
                  title={`${f.finding_id} (${formatTimestamp(f.timestamp)}): ${f.indicator_title}`}
                  className="absolute top-1 -translate-x-1/2 px-1 py-0.5 text-[10px] font-mono font-semibold rounded text-white shadow cursor-pointer"
                  style={{ left: `${pct}%`, backgroundColor: sev.dotColor }}
                >
                  {f.finding_id}
                </button>
              );
            })}
        </div>
      </div>
    </section>
  );
}
