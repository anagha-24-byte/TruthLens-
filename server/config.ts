import path from 'path';
import fs from 'fs';

export const ROOT_DIR = process.cwd();
export const DATA_DIR = path.join(ROOT_DIR, 'data');
export const ARTIFACTS_DIR = path.join(DATA_DIR, 'artifacts');
export const TEMP_DIR = path.join(DATA_DIR, 'temp');
export const REPORTS_DIR = path.join(DATA_DIR, 'reports');
export const SAMPLE_DIR = path.join(DATA_DIR, 'sample-dataset');
export const DB_PATH = path.join(DATA_DIR, 'truthlens.db');

for (const dir of [DATA_DIR, ARTIFACTS_DIR, TEMP_DIR, REPORTS_DIR, SAMPLE_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

export const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB per file
export const MAX_FILES_PER_ANALYSIS = 6;

export const ALLOWED_EXTENSIONS: Record<string, 'image' | 'video' | 'audio' | 'text'> = {
  '.jpg': 'image',
  '.jpeg': 'image',
  '.png': 'image',
  '.webp': 'image',
  '.mp4': 'video',
  '.mov': 'video',
  '.avi': 'video',
  '.mkv': 'video',
  '.wav': 'audio',
  '.mp3': 'audio',
  '.m4a': 'audio',
  '.txt': 'text',
  '.pdf': 'text',
};

export const DETECTOR_VERSIONS: Record<string, string> = {
  metadata_inspector: 'ffprobe-cli/1.0',
  visual_ela_analyzer: 'ffmpeg-ela/2.1',
  audio_dsp_engine: 'radix2-fft-zcr-f0/1.8',
  confidence_aggregator: 'truthlens-deterministic/1.4',
  grounding_validator: 'truthlens-grounding/1.2',
  gemini_primary_model: process.env.GEMINI_PRIMARY_MODEL || 'gemini-3.8-flash',
};

export const GEMINI_CONFIG = {
  primaryModel: process.env.GEMINI_PRIMARY_MODEL || 'gemini-3.8-flash',
  fallbackModels: (process.env.GEMINI_FALLBACK_MODELS || 'gemini-4-hydrogen,gemini-3.1-flash-lite')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean),
  transcribeModel: process.env.GEMINI_TRANSCRIBE_MODEL || 'gemini-3.5-transcribe',
  maxRetriesPerModel: 2,
  baseBackoffMs: 900,
};

export const FORENSIC_DISCLAIMER =
  'This report contains automated forensic observations and AI-assisted analysis. It does not constitute definitive proof of authenticity or manipulation. All findings should be independently reviewed by a qualified human investigator.';

export function sanitizeFilename(name: string): string {
  const base = path.basename(name).replace(/[^a-zA-Z0-9._-]/g, '_');
  return base.slice(0, 120) || 'evidence_file';
}
