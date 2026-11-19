import { useRef, useState } from 'react';
import {
  AlertCircle,
  FileAudio,
  FileImage,
  FileText,
  FileVideo,
  FolderPlus,
  Play,
  RefreshCw,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import { formatBytes } from '../lib/formatters';
import type { InvestigationReport } from '../types/forensics';

const ACCEPTED_EXT = ['.jpg', '.jpeg', '.png', '.webp', '.mp4', '.mov', '.avi', '.mkv', '.wav', '.mp3', '.m4a', '.txt', '.pdf'];
const MAX_SIZE_BYTES = 50 * 1024 * 1024;

interface QueuedFile {
  id: string;
  file: File;
  kind: 'image' | 'video' | 'audio' | 'text';
  previewUrl: string | null;
}

interface AnalyzePageProps {
  onAnalysisComplete: (report: InvestigationReport) => void;
}

function detectKind(filename: string): 'image' | 'video' | 'audio' | 'text' | null {
  const lower = filename.toLowerCase();
  if (/\.(jpg|jpeg|png|webp)$/.test(lower)) return 'image';
  if (/\.(mp4|mov|avi|mkv)$/.test(lower)) return 'video';
  if (/\.(wav|mp3|m4a)$/.test(lower)) return 'audio';
  if (/\.(txt|pdf)$/.test(lower)) return 'text';
  return null;
}

export function AnalyzePage({ onAnalysisComplete }: AnalyzePageProps) {
  const [queue, setQueue] = useState<QueuedFile[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const [caption, setCaption] = useState('');
  const [claimedSpeaker, setClaimedSpeaker] = useState('');
  const [claimedLocation, setClaimedLocation] = useState('');
  const [claimedEvent, setClaimedEvent] = useState('');
  const [sourceDescription, setSourceDescription] = useState('');

  const [consent, setConsent] = useState(false);
  const [retainMedia, setRetainMedia] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [stageLabel, setStageLabel] = useState('');
  const [apiError, setApiError] = useState<{ message: string; retryAfterSec?: number | null } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const addFiles = (incoming: FileList | File[]) => {
    setValidationError(null);
    const list = Array.from(incoming);
    const next: QueuedFile[] = [];

    for (const file of list) {
      if (queue.length + next.length >= 6) {
        setValidationError('Maximum 6 evidence files allowed per forensic investigation.');
        break;
      }
      const kind = detectKind(file.name);
      if (!kind) {
        setValidationError(
          `Unsupported file "${file.name}". Supported formats: ${ACCEPTED_EXT.join(', ')}`
        );
        continue;
      }
      if (file.size > MAX_SIZE_BYTES) {
        setValidationError(`"${file.name}" exceeds the 50 MB size limit.`);
        continue;
      }
      const previewUrl = kind === 'image' || kind === 'video' ? URL.createObjectURL(file) : null;
      next.push({
        id: `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        file,
        kind,
        previewUrl,
      });
    }

    if (next.length > 0) {
      setQueue((prev) => [...prev, ...next]);
    }
  };

  const removeFile = (id: string) => {
    setQueue((prev) => {
      const target = prev.find((q) => q.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((q) => q.id !== id);
    });
  };

  const attachReferenceSample = async () => {
    setValidationError(null);
    setApiError(null);
    try {
      const res = await fetch('/api/sample-dataset');
      const data = (await res.json()) as { files: Array<{ name: string; url: string }> };
      const fetchedFiles: File[] = [];
      for (const item of data.files.slice(0, 3)) {
        const fileRes = await fetch(item.url);
        const blob = await fileRes.blob();
        fetchedFiles.push(new File([blob], item.name, { type: blob.type || 'application/octet-stream' }));
      }
      addFiles(fetchedFiles);
      setCaption('Spokesperson announces immediate suspension of downtown transit grid.');
      setClaimedSpeaker('Municipal Transit Official');
      setClaimedLocation('Municipal Hall');
      setClaimedEvent('Reference Verification Case');
      setSourceDescription('Sample MP4, WAV, and TXT evidence package attached for verification.');
      setConsent(true);
    } catch (err) {
      setValidationError(`Could not attach reference sample: ${String((err as Error)?.message || err)}`);
    }
  };

  const runAnalysis = async () => {
    setValidationError(null);
    setApiError(null);

    if (!consent) {
      setValidationError('Please confirm processing consent before starting forensic analysis.');
      return;
    }

    const hasContext = [caption, claimedSpeaker, claimedLocation, claimedEvent, sourceDescription].some((s) => s.trim());
    if (queue.length === 0 && !hasContext) {
      setValidationError('Upload at least one evidence file or enter contextual claims to analyze.');
      return;
    }

    setSubmitting(true);
    setUploadPct(0);
    setStageLabel('Uploading evidence & computing SHA-256 source digests...');

    const formData = new FormData();
    for (const q of queue) {
      formData.append('files', q.file);
    }
    formData.append('caption', caption);
    formData.append('claimedSpeaker', claimedSpeaker);
    formData.append('claimedLocation', claimedLocation);
    formData.append('claimedEvent', claimedEvent);
    formData.append('sourceDescription', sourceDescription);
    formData.append('consent', String(consent));
    formData.append('retainMedia', String(retainMedia));

    try {
      const report = await new Promise<InvestigationReport>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/analyze');

        xhr.upload.onprogress = (ev) => {
          if (ev.lengthComputable) {
            const pct = Math.round((ev.loaded / ev.total) * 100);
            setUploadPct(pct);
            if (pct >= 100) {
              setStageLabel(
                'Running FFmpeg frame/ELA extraction, Radix-2 FFT audio DSP, and multimodal correlation...'
              );
            }
          }
        };

        xhr.onload = () => {
          try {
            const parsed = JSON.parse(xhr.responseText);
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve(parsed as InvestigationReport);
            } else {
              reject({
                message: parsed.error || `Server returned status ${xhr.status}`,
                retryAfterSec: parsed.retryAfterSec ?? null,
              });
            }
          } catch {
            reject({ message: `Unexpected server response (${xhr.status})` });
          }
        };

        xhr.onerror = () => reject({ message: 'Network error while communicating with forensic server.' });
        xhr.send(formData);
      });

      onAnalysisComplete(report);
    } catch (err) {
      const e = err as { message?: string; retryAfterSec?: number | null };
      setApiError({
        message: e.message || 'Analysis failed.',
        retryAfterSec: e.retryAfterSec,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-slate-900">New Forensic Analysis</h1>
          <p className="text-sm text-slate-600">
            Upload images, video clips, audio tracks, and contextual documents for multi-agent correlation.
          </p>
        </div>

        <button
          type="button"
          onClick={attachReferenceSample}
          disabled={submitting}
          className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-md transition-colors whitespace-nowrap shrink-0"
        >
          <FolderPlus className="w-4 h-4 text-blue-600" />
          Attach Sample Case
        </button>
      </div>

      {/* Dropzone */}
      <section className="forensic-bezel rounded-xl p-5 space-y-4">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
          }}
          onClick={() => fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click();
          }}
          className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
            dragOver
              ? 'border-blue-600 bg-blue-50/70'
              : 'border-slate-300 hover:border-blue-500 bg-slate-50/70'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ACCEPTED_EXT.join(',')}
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files);
              e.target.value = '';
            }}
            className="hidden"
          />
          <UploadCloud className="w-9 h-9 text-blue-600 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-900">
            Drag and drop evidence files here, or click to browse
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Image (JPG, PNG, WEBP) · Video (MP4, MOV, AVI, MKV) · Audio (WAV, MP3, M4A) · Text (TXT, PDF) · Max 50 MB / file
          </p>
        </div>

        {/* File Queue */}
        {queue.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {queue.map((item) => {
              const Icon =
                item.kind === 'image'
                  ? FileImage
                  : item.kind === 'video'
                    ? FileVideo
                    : item.kind === 'audio'
                      ? FileAudio
                      : FileText;

              return (
                <div
                  key={item.id}
                  className="flex items-center gap-3 p-3 border border-slate-200 bg-slate-50 rounded-md"
                >
                  {item.previewUrl && item.kind === 'image' ? (
                    <img
                      src={item.previewUrl}
                      alt={item.file.name}
                      className="w-14 h-14 object-cover rounded border border-slate-200 shrink-0"
                    />
                  ) : (
                    <div className="w-14 h-14 flex items-center justify-center rounded bg-white border border-slate-200 shrink-0">
                      <Icon className="w-6 h-6 text-blue-600" />
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-900 truncate">{item.file.name}</p>
                    <p className="text-xs font-mono text-slate-500 tabular-nums">
                      {item.kind.toUpperCase()} · {formatBytes(item.file.size)}
                    </p>
                  </div>

                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => removeFile(item.id)}
                    aria-label={`Remove ${item.file.name}`}
                    className="p-2 text-slate-400 hover:text-red-600 transition-colors shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Unverified Contextual Claims */}
      <section className="forensic-bezel rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-display font-semibold text-slate-900">
              Media Context &amp; Claims
            </h2>
            <p className="text-xs text-slate-500">
              Optional metadata supplied with the media. TruthLens treats all user claims as unverified hypotheses.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2 space-y-1">
            <label className="text-xs font-medium text-slate-700" htmlFor="ctx-caption">
              Video / Image Caption
            </label>
            <textarea
              id="ctx-caption"
              rows={2}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Paste the circulating headline, caption, or social post claim..."
              className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-md text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-600"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-700" htmlFor="ctx-speaker">
              Claimed Speaker Identity
            </label>
            <input
              id="ctx-speaker"
              type="text"
              value={claimedSpeaker}
              onChange={(e) => setClaimedSpeaker(e.target.value)}
              placeholder="e.g., Municipal Spokesperson"
              className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-md text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-600"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-700" htmlFor="ctx-location">
              Claimed Location
            </label>
            <input
              id="ctx-location"
              type="text"
              value={claimedLocation}
              onChange={(e) => setClaimedLocation(e.target.value)}
              placeholder="e.g., City Hall Plaza"
              className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-md text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-600"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-700" htmlFor="ctx-event">
              Claimed Event / Investigation Title
            </label>
            <input
              id="ctx-event"
              type="text"
              value={claimedEvent}
              onChange={(e) => setClaimedEvent(e.target.value)}
              placeholder="e.g., Nov 2026 Transit Briefing"
              className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-md text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-600"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-700" htmlFor="ctx-source">
              Original Source Description
            </label>
            <input
              id="ctx-source"
              type="text"
              value={sourceDescription}
              onChange={(e) => setSourceDescription(e.target.value)}
              placeholder="e.g., Forwarded MP4 from messaging group"
              className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-md text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-600"
            />
          </div>
        </div>
      </section>

      {/* Privacy Consent & Submit */}
      <section className="forensic-bezel rounded-xl p-5 space-y-4">
        <div className="space-y-3">
          <label className="flex items-start gap-3 text-xs text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-0.5 accent-blue-600"
            />
            <span>
              I confirm I have authorization to submit this media for automated digital forensic analysis. Uploaded evidence is processed strictly for this investigation and is never automatically published.
            </span>
          </label>

          <label className="flex items-start gap-3 text-xs text-slate-500 cursor-pointer">
            <input
              type="checkbox"
              checked={retainMedia}
              onChange={(e) => setRetainMedia(e.target.checked)}
              className="mt-0.5 accent-blue-600"
            />
            <span>
              Retain extracted frames and media locally for Reality Replay, Evidence Explorer, and PDF thumbnail export (can be purged anytime in Analysis History).
            </span>
          </label>
        </div>

        {validationError && (
          <div className="flex items-start gap-2.5 p-3 rounded border border-red-200 bg-red-50 text-xs text-red-700">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <span>{validationError}</span>
          </div>
        )}

        {apiError && (
          <div className="p-4 rounded border border-red-200 bg-red-50 space-y-3">
            <div className="flex items-start gap-2.5 text-xs text-red-700">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold">Forensic Analysis Interrupted</p>
                <p>{apiError.message}</p>
                {apiError.retryAfterSec && (
                  <p className="font-mono text-amber-800">
                    Server suggested retry delay: {apiError.retryAfterSec}s
                  </p>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={runAnalysis}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium bg-slate-900 hover:bg-slate-800 text-white rounded transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Retry Analysis
              </button>
            </div>
          </div>
        )}

        {submitting && (
          <div className="space-y-2 p-4 rounded border border-blue-200 bg-blue-50/70">
            <div className="flex items-center justify-between text-xs text-blue-900">
              <span>{stageLabel}</span>
              <span className="font-mono tabular-nums">{uploadPct}%</span>
            </div>
            <div className="h-1.5 w-full bg-slate-200 rounded overflow-hidden">
              <div
                className="h-full bg-blue-600 transition-all duration-200"
                style={{ width: `${Math.max(8, uploadPct)}%` }}
              />
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
          <button
            type="button"
            disabled={submitting}
            onClick={runAnalysis}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white rounded-md transition-colors whitespace-nowrap shrink-0"
          >
            <Play className="w-4 h-4" />
            {submitting ? 'Analysing Evidence...' : 'Start Forensic Analysis'}
          </button>
        </div>
      </section>
    </div>
  );
}
