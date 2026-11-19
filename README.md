# TruthLens AI

**See Beyond the Surface. Verify What You Trust.**  
Multimodal Digital Forensics & Deepfake Detection System — INNOVEDGE Hackathon 2026 (Track 4)

## Overview

TruthLens AI is a full-stack multimodal digital forensics platform that analyzes images, videos, audio recordings, and accompanying contextual text to surface grounded manipulation indicators, benign counter-explanations, cross-modal correlations, and cryptographically signed PDF/JSON forensic reports.

### Core Forensic Pipeline
1. **Visual Forensic Engine (`server/forensics/videoProcessing.ts`)**: Extracts keyframes via FFmpeg, computes frame-to-frame pixel deltas and luminance shifts, and generates Error Level Analysis (ELA) compression difference heatmaps.
2. **Audio Forensic DSP Engine (`server/forensics/audioForensics.ts`)**: Decodes audio streams to 16kHz mono PCM and computes waveform envelopes, RMS energy, zero-crossing rate, Radix-2 FFT spectral centroid & bandwidth, 13-band log spectral energy, autocorrelation pitch (F0), abrupt noise-floor drops, and timestamped transcription.
3. **Metadata & Provenance (`server/forensics/metadataAnalysis.ts`)**: Extracts stream/container metadata via `ffprobe` and computes SHA-256 source digests.
4. **Multimodal Reasoning, Counter-Evidence & AI Debate Room (`server/forensics/multimodalReasoner.ts`)**: Server-side Gemini synthesis (`gemini-3.8-flash` primary with configurable fallbacks and exponential backoff with jitter) producing grounded findings, benign counter-hypotheses, and Investigator/Skeptic/Adjudicator perspectives.
5. **Strict Grounding & Deterministic Confidence (`server/forensics/groundingValidator.ts`, `server/forensics/confidenceEngine.ts`)**: Validates source IDs, media durations, and normalized `box_2d` coordinates, and aggregates scores deterministically across available modalities only.
6. **Trust Passport & PDF Export (`server/forensics/reportGenerator.ts`)**: Generates PDFKit reports with embedded thumbnails, color-coded review statuses, SHA-256 digests, scannable QR verification codes, and mandatory forensic disclaimers.
7. **SQLite Persistence (`server/database/history.ts`)**: Stores investigation history, investigator review states, and supports purging retained media files.

## Requirements
- Node.js 22+ (uses built-in `node:sqlite`)
- `ffmpeg` and `ffprobe` available on system `PATH`
- `GEMINI_API_KEY` set in environment / Secrets panel (for live AI inference; Offline Demo Preview works without an API key)

## Environment Variables
See `.env.example`:
- `GEMINI_API_KEY`: Server-side Gemini API key (never exposed to browser)
- `GEMINI_PRIMARY_MODEL`: Default `gemini-3.8-flash`
- `GEMINI_FALLBACK_MODELS`: Comma-separated fallbacks (default `gemini-4-hydrogen,gemini-3.1-flash-lite`)
- `GEMINI_TRANSCRIBE_MODEL`: Default `gemini-3.5-transcribe`

## Commands
```bash
npm install
npm run dev      # Runs Express + Vite dev server on port 3000
npm run build    # Builds production frontend bundle
npm run start    # Runs production server on port 3000
npm run lint     # Runs TypeScript type-checking
```

## Known Limitations
- Social-network re-encoding strips original camera EXIF/creation tags and alters quantization tables.
- Acoustic DSP metrics alone cannot distinguish AI voice cloning from studio noise gates or editorial cuts.
- Absence of detected indicators does not constitute proof of authenticity.

## Hackathon Judge Demonstration Workflow
1. Open **Home Dashboard** and click **Load Offline Demo Preview** for an instant deterministic walkthrough (Evidence DNA Map, Reality Replay, Counter-Evidence, Debate Room, Trust Passport PDF).
2. Open **New Forensic Analysis** and click **Load Synthetic Test Kit** (or upload your own image/video/audio/caption) to execute the live FFmpeg + Radix-2 FFT + Gemini pipeline.
3. Inspect **Analysis Results**, mark findings via **Investigator Review Controls**, scrub **Reality Replay**, inspect **Original vs. ELA Heatmap** in **Evidence Explorer**, and export the signed PDF from **Forensic Reports**.
