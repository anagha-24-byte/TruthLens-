import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import type { ExtractedFrame } from '../../src/types/forensics.ts';

const execFileAsync = promisify(execFile);

/**
 * Generates a real Error Level Analysis (ELA) difference heatmap for an image or frame.
 * Re-encodes at JPEG quality ~85, computes pixel difference, and amplifies contrast.
 */
export async function generateElaHeatmap(inputImagePath: string, outputElaPath: string): Promise<boolean> {
  const tmpRecompressed = `${outputElaPath}.recomp.jpg`;
  try {
    await execFileAsync('ffmpeg', [
      '-y',
      '-i',
      inputImagePath,
      '-q:v',
      '5',
      tmpRecompressed,
    ]);

    await execFileAsync('ffmpeg', [
      '-y',
      '-i',
      inputImagePath,
      '-i',
      tmpRecompressed,
      '-filter_complex',
      '[0:v][1:v]blend=all_mode=difference,lutrgb=r=clip(val*12\\,0\\,255):g=clip(val*8\\,0\\,255):b=clip(val*16\\,0\\,255)',
      '-frames:v',
      '1',
      outputElaPath,
    ]);

    return fs.existsSync(outputElaPath);
  } catch {
    return false;
  } finally {
    if (fs.existsSync(tmpRecompressed)) {
      fs.unlinkSync(tmpRecompressed);
    }
  }
}

/**
 * Computes mean pixel luminance & inter-frame difference using ffmpeg raw RGB24 downscaled thumbnails (64x36)
 * so frame-to-frame discontinuity detection is grounded in real pixel measurements.
 */
async function measureFramePixels(imagePath: string): Promise<Uint8Array | null> {
  try {
    const { stdout } = await execFileAsync(
      'ffmpeg',
      [
        '-v',
        'error',
        '-i',
        imagePath,
        '-vf',
        'scale=64:36',
        '-f',
        'rawvideo',
        '-pix_fmt',
        'rgb24',
        'pipe:1',
      ],
      { encoding: 'buffer', maxBuffer: 1024 * 1024 }
    );
    return new Uint8Array(stdout);
  } catch {
    return null;
  }
}

function computeMeanLuma(rgb: Uint8Array): number {
  let sum = 0;
  const pixels = rgb.length / 3;
  for (let i = 0; i < rgb.length; i += 3) {
    sum += 0.299 * rgb[i] + 0.587 * rgb[i + 1] + 0.114 * rgb[i + 2];
  }
  return pixels > 0 ? Number((sum / pixels).toFixed(2)) : 0;
}

function computeFrameDelta(prev: Uint8Array | null, curr: Uint8Array | null): number {
  if (!prev || !curr || prev.length !== curr.length) return 0;
  let diffSum = 0;
  for (let i = 0; i < curr.length; i++) {
    diffSum += Math.abs(curr[i] - prev[i]);
  }
  return Number((diffSum / (curr.length * 255)).toFixed(4));
}

export async function extractVideoFramesAndAudio(params: {
  videoPath: string;
  sourceId: string;
  investigationId: string;
  durationSec: number | null;
  artifactsDir: string;
  tempDir: string;
  maxFrames?: number;
}): Promise<{
  frames: ExtractedFrame[];
  extractedAudioWavPath: string | null;
}> {
  const {
    videoPath,
    sourceId,
    investigationId,
    durationSec,
    artifactsDir,
    tempDir,
    maxFrames = 10,
  } = params;

  const framesDir = path.join(artifactsDir, investigationId, 'frames', sourceId);
  fs.mkdirSync(framesDir, { recursive: true });

  const safeDur = durationSec && durationSec > 0 ? durationSec : 8;
  const interval = Math.max(0.5, safeDur / maxFrames);
  const fpsFilter = `fps=1/${interval.toFixed(3)}`;

  await execFileAsync('ffmpeg', [
    '-y',
    '-i',
    videoPath,
    '-vf',
    `${fpsFilter},scale='min(960,iw)':-2`,
    '-frames:v',
    String(maxFrames),
    '-q:v',
    '3',
    path.join(framesDir, 'frame_%03d.jpg'),
  ]);

  const files = fs
    .readdirSync(framesDir)
    .filter((f) => f.startsWith('frame_') && f.endsWith('.jpg'))
    .sort();

  const frames: ExtractedFrame[] = [];
  let prevPixels: Uint8Array | null = null;

  for (let idx = 0; idx < files.length; idx++) {
    const fname = files[idx];
    const framePath = path.join(framesDir, fname);
    const elaName = `ela_${fname}`;
    const elaPath = path.join(framesDir, elaName);

    const elaOk = await generateElaHeatmap(framePath, elaPath);
    const currPixels = await measureFramePixels(framePath);
    const lumaMean = currPixels ? computeMeanLuma(currPixels) : 0;
    const frameDeltaScore = computeFrameDelta(prevPixels, currPixels);
    prevPixels = currPixels;

    const timestampSec = Number(Math.min(safeDur, idx * interval).toFixed(2));
    frames.push({
      frameId: `${sourceId}-f${idx + 1}`,
      source_id: sourceId,
      frameNumber: idx + 1,
      timestampSec,
      imageUrl: `/artifacts/${investigationId}/frames/${sourceId}/${fname}`,
      elaImageUrl: elaOk ? `/artifacts/${investigationId}/frames/${sourceId}/${elaName}` : null,
      frameDeltaScore,
      lumaMean,
    });
  }

  // Extract 16kHz mono WAV audio stream if present
  const extractedAudioWavPath = path.join(tempDir, `${investigationId}_${sourceId}_audio.wav`);
  let hasAudio = false;
  try {
    await execFileAsync('ffmpeg', [
      '-y',
      '-i',
      videoPath,
      '-vn',
      '-acodec',
      'pcm_s16le',
      '-ar',
      '16000',
      '-ac',
      '1',
      extractedAudioWavPath,
    ]);
    hasAudio = fs.existsSync(extractedAudioWavPath) && fs.statSync(extractedAudioWavPath).size > 1024;
  } catch {
    hasAudio = false;
  }

  return {
    frames,
    extractedAudioWavPath: hasAudio ? extractedAudioWavPath : null,
  };
}
