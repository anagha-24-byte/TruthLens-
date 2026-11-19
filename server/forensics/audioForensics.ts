import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { Type } from '@google/genai';
import { GEMINI_CONFIG } from '../config.ts';
import { generateContentWithFallback } from '../geminiClient.ts';
import type { AudioDspSummary, AudioTimelinePoint, TranscriptSegment } from '../../src/types/forensics.ts';

const execFileAsync = promisify(execFile);

/**
 * In-place Radix-2 Cooley-Tukey FFT on real+imag Float64Arrays (length N power of 2).
 */
function fftRadix2(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wlenRe = Math.cos(ang);
    const wlenIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let wRe = 1;
      let wIm = 0;
      for (let j = 0; j < len / 2; j++) {
        const uRe = re[i + j];
        const uIm = im[i + j];
        const vRe = re[i + j + len / 2] * wRe - im[i + j + len / 2] * wIm;
        const vIm = re[i + j + len / 2] * wIm + im[i + j + len / 2] * wRe;
        re[i + j] = uRe + vRe;
        im[i + j] = uIm + vIm;
        re[i + j + len / 2] = uRe - vRe;
        im[i + j + len / 2] = uIm - vIm;
        const nextWRe = wRe * wlenRe - wIm * wlenIm;
        wIm = wRe * wlenIm + wIm * wlenRe;
        wRe = nextWRe;
      }
    }
  }
}

function estimatePitchAutocorr(frame: Float32Array, sampleRate: number): number | null {
  let rms = 0;
  for (let i = 0; i < frame.length; i++) rms += frame[i] * frame[i];
  rms = Math.sqrt(rms / frame.length);
  if (rms < 0.012) return null; // too quiet for reliable pitch

  const minLag = Math.floor(sampleRate / 420); // ~420 Hz max F0
  const maxLag = Math.min(Math.floor(sampleRate / 65), Math.floor(frame.length / 2)); // ~65 Hz min F0

  let bestLag = -1;
  let bestCorr = 0;
  let energy0 = 0;
  for (let i = 0; i < frame.length - maxLag; i++) {
    energy0 += frame[i] * frame[i];
  }
  if (energy0 <= 1e-8) return null;

  for (let lag = minLag; lag <= maxLag; lag++) {
    let corr = 0;
    for (let i = 0; i < frame.length - lag; i++) {
      corr += frame[i] * frame[i + lag];
    }
    const normCorr = corr / energy0;
    if (normCorr > bestCorr) {
      bestCorr = normCorr;
      bestLag = lag;
    }
  }

  if (bestCorr > 0.32 && bestLag > 0) {
    return Number((sampleRate / bestLag).toFixed(1));
  }
  return null;
}

export async function analyzeAudioTrack(params: {
  audioInputPath: string;
  sourceId: string;
  tempDir: string;
  mimeType: string;
  skipTranscription?: boolean;
}): Promise<{ summary: AudioDspSummary; transcribeModelUsed: string | null; warnings: string[] }> {
  const { audioInputPath, sourceId, tempDir, mimeType, skipTranscription = false } = params;
  const sampleRate = 16000;
  const rawPcmPath = path.join(tempDir, `${sourceId}_16k.f32`);
  const mp3ForAiPath = path.join(tempDir, `${sourceId}_ai.mp3`);
  const warnings: string[] = [];

  // Decode to raw f32le 16kHz mono PCM for exact DSP
  await execFileAsync('ffmpeg', [
    '-y',
    '-i',
    audioInputPath,
    '-vn',
    '-ac',
    '1',
    '-ar',
    String(sampleRate),
    '-f',
    'f32le',
    rawPcmPath,
  ]);

  const pcmBuf = fs.readFileSync(rawPcmPath);
  const samples = new Float32Array(
    pcmBuf.buffer,
    pcmBuf.byteOffset,
    Math.floor(pcmBuf.byteLength / 4)
  );

  const durationSec = Number((samples.length / sampleRate).toFixed(2));

  // Compute 180 waveform envelope bins
  const binCount = 180;
  const binSize = Math.max(1, Math.floor(samples.length / binCount));
  const waveformBins: number[] = [];
  for (let b = 0; b < binCount; b++) {
    const start = b * binSize;
    const end = Math.min(samples.length, start + binSize);
    let peak = 0;
    for (let i = start; i < end; i++) {
      const a = Math.abs(samples[i]);
      if (a > peak) peak = a;
    }
    waveformBins.push(Number(peak.toFixed(4)));
  }

  // Compute windowed spectral features (0.25s step, 1024-sample FFT)
  const fftSize = 1024;
  const hopSamples = Math.floor(sampleRate * 0.25);
  const timelineMetrics: AudioTimelinePoint[] = [];
  const melBandAccum = new Array(13).fill(0);
  let fftFramesCount = 0;

  const hann = new Float64Array(fftSize);
  for (let i = 0; i < fftSize; i++) {
    hann[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (fftSize - 1)));
  }

  for (let offset = 0; offset + fftSize <= samples.length; offset += hopSamples) {
    const frameSlice = samples.subarray(offset, offset + fftSize);
    let rmsSum = 0;
    let zc = 0;
    for (let i = 0; i < fftSize; i++) {
      rmsSum += frameSlice[i] * frameSlice[i];
      if (i > 0 && ((frameSlice[i] >= 0 && frameSlice[i - 1] < 0) || (frameSlice[i] < 0 && frameSlice[i - 1] >= 0))) {
        zc++;
      }
    }
    const rms = Math.sqrt(rmsSum / fftSize);
    const zcr = zc / fftSize;

    const re = new Float64Array(fftSize);
    const im = new Float64Array(fftSize);
    for (let i = 0; i < fftSize; i++) {
      re[i] = frameSlice[i] * hann[i];
    }
    fftRadix2(re, im);

    const half = fftSize / 2;
    let magSum = 0;
    let weightedFreqSum = 0;
    const mags = new Float64Array(half);
    for (let k = 1; k < half; k++) {
      const mag = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
      mags[k] = mag;
      const freq = (k * sampleRate) / fftSize;
      magSum += mag;
      weightedFreqSum += freq * mag;
    }

    const centroid = magSum > 1e-8 ? weightedFreqSum / magSum : 0;
    let bwVarSum = 0;
    for (let k = 1; k < half; k++) {
      const freq = (k * sampleRate) / fftSize;
      bwVarSum += Math.pow(freq - centroid, 2) * mags[k];
    }
    const bandwidth = magSum > 1e-8 ? Math.sqrt(bwVarSum / magSum) : 0;

    // 13 log-spaced spectral band summary (MFCC-inspired log energy envelope)
    for (let b = 0; b < 13; b++) {
      const kStart = Math.max(1, Math.floor(Math.pow(half, b / 13)));
      const kEnd = Math.max(kStart + 1, Math.floor(Math.pow(half, (b + 1) / 13)));
      let bandE = 0;
      for (let k = kStart; k < kEnd && k < half; k++) bandE += mags[k] * mags[k];
      melBandAccum[b] += Math.log10(1 + bandE);
    }
    fftFramesCount++;

    const pitchHz = estimatePitchAutocorr(frameSlice, sampleRate);
    const voiceActive = rms > 0.015 && centroid > 180 && centroid < 4200;

    timelineMetrics.push({
      timestampSec: Number((offset / sampleRate).toFixed(2)),
      rms: Number(rms.toFixed(4)),
      zcr: Number(zcr.toFixed(4)),
      spectralCentroidHz: Math.round(centroid),
      spectralBandwidthHz: Math.round(bandwidth),
      pitchHz,
      voiceActive,
    });
  }

  const mfccSummary = melBandAccum.map((v) =>
    fftFramesCount > 0 ? Number((v / fftFramesCount).toFixed(3)) : 0
  );

  // Detect abrupt transitions, digital zero silence drops, or spectral flatness anomalies
  const anomalies: AudioDspSummary['anomalies'] = [];
  for (let i = 1; i < timelineMetrics.length; i++) {
    const prev = timelineMetrics[i - 1];
    const curr = timelineMetrics[i];

    // Sudden RMS jump (> 0.14 delta in 250ms)
    const rmsDelta = Math.abs(curr.rms - prev.rms);
    const centroidDelta = Math.abs(curr.spectralCentroidHz - prev.spectralCentroidHz);
    if (rmsDelta > 0.14 && centroidDelta > 900) {
      anomalies.push({
        timestampSec: curr.timestampSec,
        kind: 'abrupt_spectral_transition',
        magnitude: Number(rmsDelta.toFixed(3)),
        detail: `Abrupt amplitude (${prev.rms.toFixed(3)} -> ${curr.rms.toFixed(3)}) and spectral centroid shift (${prev.spectralCentroidHz}Hz -> ${curr.spectralCentroidHz}Hz) within 250ms.`,
      });
    }

    // Near-absolute digital zero floor flanked by active speech
    if (curr.rms < 0.0005 && prev.rms > 0.025) {
      anomalies.push({
        timestampSec: curr.timestampSec,
        kind: 'digital_silence_drop',
        magnitude: Number(prev.rms.toFixed(3)),
        detail: `Instantaneous drop to near-zero digital noise floor (RMS ${curr.rms.toFixed(5)}) immediately following active signal.`,
      });
    }
  }

  // Speech-to-text transcription via Gemini (server-side)
  let transcript: TranscriptSegment[] = [];
  let fullTranscriptText = '';
  let transcribeModelUsed: string | null = null;

  if (!skipTranscription && durationSec > 0.3) {
    try {
      // Compress to lightweight mono mp3 for Gemini API transfer
      await execFileAsync('ffmpeg', [
        '-y',
        '-i',
        audioInputPath,
        '-vn',
        '-ac',
        '1',
        '-ar',
        '16000',
        '-b:a',
        '48k',
        '-t',
        '180',
        mp3ForAiPath,
      ]);

      const audioBase64 = fs.readFileSync(mp3ForAiPath).toString('base64');
      const audioPart = {
        inlineData: {
          mimeType: 'audio/mp3',
          data: audioBase64,
        },
      };

      const { response, telemetry } = await generateContentWithFallback(
        {
          contents: {
            parts: [
              audioPart,
              {
                text: `Transcribe all spoken speech in this audio accurately. Return JSON with timestamped segments (startSec, endSec in seconds bounded by 0 to ${durationSec}) and fullTranscriptText. If there is no intelligible speech (e.g., music, tones, or silence), return empty segments and describe the audible sound briefly in fullTranscriptText.`,
              },
            ],
          },
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                fullTranscriptText: { type: Type.STRING },
                segments: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      startSec: { type: Type.NUMBER },
                      endSec: { type: Type.NUMBER },
                      text: { type: Type.STRING },
                    },
                  },
                },
              },
            },
          },
        },
        GEMINI_CONFIG.transcribeModel
      );

      transcribeModelUsed = telemetry.modelUsed;
      warnings.push(...telemetry.warnings);
      const parsed = JSON.parse((response.text || '{}').trim()) as {
        fullTranscriptText?: string;
        segments?: TranscriptSegment[];
      };

      fullTranscriptText = parsed.fullTranscriptText || '';
      transcript = (parsed.segments || []).map((seg) => ({
        startSec: Math.max(0, Math.min(durationSec, Number(seg.startSec) || 0)),
        endSec: Math.max(0, Math.min(durationSec, Number(seg.endSec) || 0)),
        text: String(seg.text || ''),
      }));
    } catch (err) {
      warnings.push(`Audio transcription unavailable: ${String((err as Error)?.message || err)}`);
    }
  }

  return {
    summary: {
      source_id: sourceId,
      durationSec,
      sampleRate,
      channels: 1,
      waveformBins,
      timelineMetrics: timelineMetrics.slice(0, 240),
      mfccSummary,
      anomalies: anomalies.slice(0, 12),
      transcript,
      fullTranscriptText,
      limitationsNote:
        'Acoustic DSP metrics (MFCC envelope, spectral centroid/bandwidth, ZCR, F0 pitch, silence drops) cannot definitively prove synthetic voice cloning; background compression, noise gates, and microphone changes produce similar shifts.',
    },
    transcribeModelUsed,
    warnings,
  };
}
