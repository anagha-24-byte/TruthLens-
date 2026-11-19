import { execFile } from 'child_process';
import { promisify } from 'util';
import crypto from 'crypto';
import fs from 'fs';
import type { MediaKind, MediaMetadata } from '../../src/types/forensics.ts';

const execFileAsync = promisify(execFile);

export function computeFileSha256(filePath: string): string {
  const hash = crypto.createHash('sha256');
  const data = fs.readFileSync(filePath);
  hash.update(data);
  return hash.digest('hex');
}

function parseFrameRate(rateStr?: string): number | null {
  if (!rateStr || rateStr === '0/0') return null;
  const parts = rateStr.split('/');
  if (parts.length === 2) {
    const num = Number(parts[0]);
    const den = Number(parts[1]);
    if (den > 0 && !Number.isNaN(num)) {
      return Number((num / den).toFixed(2));
    }
  }
  const n = Number(rateStr);
  return Number.isNaN(n) || n <= 0 ? null : Number(n.toFixed(2));
}

export async function extractMediaMetadata(
  filePath: string,
  kind: MediaKind,
  fileSizeBytes: number
): Promise<MediaMetadata> {
  const anomalies: string[] = [];

  if (kind === 'text') {
    return {
      formatName: filePath.toLowerCase().endsWith('.pdf') ? 'PDF Document' : 'Plain Text',
      durationSec: null,
      width: null,
      height: null,
      frameRate: null,
      audioSampleRate: null,
      audioChannels: null,
      videoCodec: null,
      audioCodec: null,
      bitrateKbps: null,
      fileSizeBytes,
      creationTime: null,
      encoderTag: null,
      anomalies: [],
      limitationsNote: 'Text documents do not carry multimedia stream headers; evaluated at content level.',
    };
  }

  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v',
      'quiet',
      '-print_format',
      'json',
      '-show_format',
      '-show_streams',
      filePath,
    ]);

    const parsed = JSON.parse(stdout || '{}') as {
      format?: {
        format_name?: string;
        duration?: string;
        bit_rate?: string;
        tags?: Record<string, string>;
      };
      streams?: Array<{
        codec_type?: string;
        codec_name?: string;
        width?: number;
        height?: number;
        r_frame_rate?: string;
        avg_frame_rate?: string;
        sample_rate?: string;
        channels?: number;
        tags?: Record<string, string>;
      }>;
    };

    const format = parsed.format || {};
    const streams = parsed.streams || [];
    const videoStream = streams.find((s) => s.codec_type === 'video');
    const audioStream = streams.find((s) => s.codec_type === 'audio');

    const tags = {
      ...(format.tags || {}),
      ...(videoStream?.tags || {}),
      ...(audioStream?.tags || {}),
    };

    const creationTime = tags.creation_time || tags.DATE || tags.date || null;
    const encoderTag = tags.encoder || tags.Software || tags.software || tags.writing_library || null;
    const durationSec = format.duration ? Number(Number(format.duration).toFixed(2)) : null;
    const bitrateKbps = format.bit_rate ? Math.round(Number(format.bit_rate) / 1000) : null;
    const frameRate = parseFrameRate(videoStream?.avg_frame_rate || videoStream?.r_frame_rate);
    const audioSampleRate = audioStream?.sample_rate ? Number(audioStream.sample_rate) : null;

    if (!creationTime) {
      anomalies.push('Creation timestamp metadata is absent or stripped from container headers.');
    }
    if (encoderTag && /lavf|ffmpeg|handbrake|premiere|davinci|capcut|after effects/i.test(encoderTag)) {
      anomalies.push(`Re-encoding or post-production software signature detected (${encoderTag}).`);
    }
    if (kind === 'video' && videoStream?.r_frame_rate && videoStream?.avg_frame_rate && videoStream.r_frame_rate !== videoStream.avg_frame_rate) {
      anomalies.push(
        `Variable or mismatched frame rate signature (avg ${videoStream.avg_frame_rate} vs nominal ${videoStream.r_frame_rate}).`
      );
    }
    if (kind === 'video' && !audioStream) {
      anomalies.push('Video container contains no embedded audio stream.');
    }

    return {
      formatName: format.format_name || kind.toUpperCase(),
      durationSec: Number.isNaN(durationSec) ? null : durationSec,
      width: videoStream?.width ?? null,
      height: videoStream?.height ?? null,
      frameRate,
      audioSampleRate,
      audioChannels: audioStream?.channels ?? null,
      videoCodec: videoStream?.codec_name ?? null,
      audioCodec: audioStream?.codec_name ?? null,
      bitrateKbps: Number.isNaN(bitrateKbps) ? null : bitrateKbps,
      fileSizeBytes,
      creationTime,
      encoderTag,
      anomalies,
      limitationsNote:
        'Editing software signatures, re-encoding tags, and stripped metadata occur routinely in social media sharing and compression; they are never proof of manipulation.',
    };
  } catch (err) {
    return {
      formatName: kind.toUpperCase(),
      durationSec: null,
      width: null,
      height: null,
      frameRate: null,
      audioSampleRate: null,
      audioChannels: null,
      videoCodec: null,
      audioCodec: null,
      bitrateKbps: null,
      fileSizeBytes,
      creationTime: null,
      encoderTag: null,
      anomalies: ['Unable to parse container stream headers via ffprobe; file may use non-standard encapsulation.'],
      limitationsNote: `Metadata parser encountered an error: ${String((err as Error)?.message || err)}`,
    };
  }
}
