import { execFile } from 'child_process';
import { promisify } from 'util';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { DETECTOR_VERSIONS, FORENSIC_DISCLAIMER, ROOT_DIR, SAMPLE_DIR } from '../config.ts';
import { computeFileSha256 } from './metadataAnalysis.ts';
import { buildTrustPassport } from './reportGenerator.ts';
import { calculateConfidenceAndAssessment } from './confidenceEngine.ts';
import { validateAndGroundFindings } from './groundingValidator.ts';
import type {
  AudioDspSummary,
  CrossModalCorrelation,
  ExtractedFrame,
  InvestigationReport,
  SourceFileRecord,
} from '../../src/types/forensics.ts';

const execFileAsync = promisify(execFile);

const DEMO_FRAME_1 = '/src/assets/images/demo_press_briefing_1795059431713.jpg';
const DEMO_FRAME_2 = '/src/assets/images/demo_document_scan_1795059431493.jpg';

export async function ensureSyntheticSampleDataset(): Promise<void> {
  const sampleVideoPath = path.join(SAMPLE_DIR, 'sample_briefing_clip.mp4');
  const sampleAudioPath = path.join(SAMPLE_DIR, 'sample_voice_cadence.wav');
  const sampleTextPath = path.join(SAMPLE_DIR, 'sample_context_notes.txt');

  if (!fs.existsSync(sampleTextPath)) {
    fs.writeFileSync(
      sampleTextPath,
      `Source Claim: Press briefing recorded indoors at Municipal Hall on November 12, 2026.\nClaimed Caption: "Spokesperson announces immediate suspension of downtown transit grid."\nNote: Synthetic test sample generated locally for TruthLens AI end-to-end verification.\n`,
      'utf-8'
    );
  }

  const baseImg = path.join(ROOT_DIR, DEMO_FRAME_1.slice(1));
  if (fs.existsSync(baseImg) && !fs.existsSync(sampleVideoPath)) {
    try {
      // Build a 6-second MP4 test clip with an intentional brightness/tint shift at t=3.2s + synthetic tone audio
      await execFileAsync('ffmpeg', [
        '-y',
        '-loop',
        '1',
        '-i',
        baseImg,
        '-f',
        'lavfi',
        '-i',
        "sine=frequency=210:duration=6,volume='if(between(t,3.0,3.4),0.02,0.5)'",
        '-vf',
        "scale=960:540,eq=brightness='if(between(t,3.0,3.6),0.14,0)'",
        '-c:v',
        'libx264',
        '-t',
        '6',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        sampleVideoPath,
      ]);
    } catch {
      // Non-fatal if ffmpeg build lacks libx264; fallback to mpeg4
      try {
        await execFileAsync('ffmpeg', [
          '-y',
          '-loop',
          '1',
          '-i',
          baseImg,
          '-f',
          'lavfi',
          '-i',
          'sine=frequency=210:duration=6',
          '-vf',
          'scale=960:540',
          '-c:v',
          'mpeg4',
          '-t',
          '6',
          '-c:a',
          'aac',
          sampleVideoPath,
        ]);
      } catch {
        // ignore if skipped
      }
    }
  }

  if (!fs.existsSync(sampleAudioPath)) {
    try {
      await execFileAsync('ffmpeg', [
        '-y',
        '-f',
        'lavfi',
        '-i',
        "sine=frequency=185:duration=5,volume='if(between(t,2.2,2.5),0.0,0.6)'",
        '-ar',
        '16000',
        '-ac',
        '1',
        sampleAudioPath,
      ]);
    } catch {
      // ignore
    }
  }
}

export async function createOfflineDemoReport(appBaseUrl: string): Promise<InvestigationReport> {
  const investigationId = `TL-DEMO-${Date.now().toString(36).toUpperCase()}`;
  const createdAt = new Date().toISOString();

  const frame1Disk = path.join(ROOT_DIR, DEMO_FRAME_1.slice(1));
  const frame2Disk = path.join(ROOT_DIR, DEMO_FRAME_2.slice(1));

  const hash1 = fs.existsSync(frame1Disk)
    ? computeFileSha256(frame1Disk)
    : crypto.createHash('sha256').update('demo-briefing-video').digest('hex');
  const hash2 = fs.existsSync(frame2Disk)
    ? computeFileSha256(frame2Disk)
    : crypto.createHash('sha256').update('demo-outdoor-still').digest('hex');

  const sources: SourceFileRecord[] = [
    {
      source_id: 'src_01',
      originalName: 'press_briefing_excerpt.mp4 (Demo Asset)',
      safeName: 'press_briefing_excerpt.mp4',
      kind: 'video',
      mimeType: 'video/mp4',
      sizeBytes: 4285120,
      sha256: hash1,
      artifactUrl: DEMO_FRAME_1,
      elaUrl: null,
      textExcerpt: null,
      metadata: {
        formatName: 'mov,mp4,m4a,3gp,3g2,mj2',
        durationSec: 12.0,
        width: 1280,
        height: 720,
        frameRate: 29.97,
        audioSampleRate: 44100,
        audioChannels: 1,
        videoCodec: 'h264',
        audioCodec: 'aac',
        bitrateKbps: 2856,
        fileSizeBytes: 4285120,
        creationTime: null,
        encoderTag: 'Lavf60.16.100',
        anomalies: [
          'Creation timestamp metadata is absent or stripped from container headers.',
          'Re-encoding signature detected (Lavf60.16.100) — common in social distribution.',
        ],
        limitationsNote:
          'Demo metadata profile illustrating how re-encoding tags and missing creation timestamps are documented without assuming manipulation.',
      },
    },
    {
      source_id: 'src_02',
      originalName: 'reference_outdoor_briefing.jpg (Demo Asset)',
      safeName: 'reference_outdoor_briefing.jpg',
      kind: 'image',
      mimeType: 'image/jpeg',
      sizeBytes: 642800,
      sha256: hash2,
      artifactUrl: DEMO_FRAME_2,
      elaUrl: DEMO_FRAME_2,
      textExcerpt: null,
      metadata: {
        formatName: 'image2',
        durationSec: null,
        width: 1200,
        height: 900,
        frameRate: null,
        audioSampleRate: null,
        audioChannels: null,
        videoCodec: 'mjpeg',
        audioCodec: null,
        bitrateKbps: null,
        fileSizeBytes: 642800,
        creationTime: '2026-11-10T14:22:10Z',
        encoderTag: 'Adobe Lightroom Classic 14.0',
        anomalies: ['Post-capture color management tag present (Adobe Lightroom Classic 14.0).'],
        limitationsNote: 'Photo editing tags indicate export pipeline, not necessarily content alteration.',
      },
    },
  ];

  const frames: ExtractedFrame[] = [
    { frameId: 'src_01-f1', source_id: 'src_01', frameNumber: 1, timestampSec: 0.0, imageUrl: DEMO_FRAME_1, elaImageUrl: null, frameDeltaScore: 0.0, lumaMean: 98.4 },
    { frameId: 'src_01-f2', source_id: 'src_01', frameNumber: 2, timestampSec: 2.5, imageUrl: DEMO_FRAME_1, elaImageUrl: null, frameDeltaScore: 0.021, lumaMean: 99.1 },
    { frameId: 'src_01-f3', source_id: 'src_01', frameNumber: 3, timestampSec: 4.8, imageUrl: DEMO_FRAME_1, elaImageUrl: null, frameDeltaScore: 0.118, lumaMean: 104.7 },
    { frameId: 'src_01-f4', source_id: 'src_01', frameNumber: 4, timestampSec: 7.4, imageUrl: DEMO_FRAME_1, elaImageUrl: null, frameDeltaScore: 0.032, lumaMean: 99.8 },
    { frameId: 'src_01-f5', source_id: 'src_01', frameNumber: 5, timestampSec: 10.0, imageUrl: DEMO_FRAME_1, elaImageUrl: null, frameDeltaScore: 0.019, lumaMean: 98.9 },
  ];

  // Build deterministic 48-point DSP profile over 12 seconds
  const timelineMetrics = Array.from({ length: 48 }, (_, i) => {
    const t = Number((i * 0.25).toFixed(2));
    const isSpliceWindow = t >= 4.5 && t <= 5.25;
    return {
      timestampSec: t,
      rms: isSpliceWindow ? (t === 4.75 ? 0.0003 : 0.215) : Number((0.085 + 0.045 * Math.sin(i * 0.7)).toFixed(4)),
      zcr: isSpliceWindow ? 0.195 : Number((0.072 + 0.025 * Math.cos(i * 0.5)).toFixed(4)),
      spectralCentroidHz: isSpliceWindow ? 2980 : Math.round(1350 + 380 * Math.sin(i * 0.4)),
      spectralBandwidthHz: isSpliceWindow ? 610 : Math.round(1120 + 190 * Math.cos(i * 0.3)),
      pitchHz: isSpliceWindow && t === 4.75 ? null : Number((138 + 16 * Math.sin(i * 0.6)).toFixed(1)),
      voiceActive: !(isSpliceWindow && t === 4.75),
    };
  });

  const audioAnalyses: AudioDspSummary[] = [
    {
      source_id: 'src_01',
      durationSec: 12.0,
      sampleRate: 16000,
      channels: 1,
      waveformBins: Array.from({ length: 120 }, (_, i) => {
        const t = (i / 120) * 12;
        if (t >= 4.65 && t <= 4.9) return 0.01;
        return Number((0.28 + 0.48 * Math.abs(Math.sin(i * 0.42) * Math.cos(i * 0.17))).toFixed(3));
      }),
      timelineMetrics,
      mfccSummary: [2.41, 1.88, 1.42, 0.95, 0.71, 0.54, 0.43, 0.31, 0.24, 0.19, 0.15, 0.11, 0.08],
      anomalies: [
        {
          timestampSec: 4.75,
          kind: 'digital_silence_drop',
          magnitude: 0.215,
          detail: 'Instantaneous drop to near-zero digital noise floor (RMS 0.00030) followed by spectral centroid jump to 2980Hz.',
        },
      ],
      transcript: [
        { startSec: 0.4, endSec: 4.4, text: 'We are reviewing the regional infrastructure timeline this quarter with full transparency.' },
        { startSec: 5.0, endSec: 11.2, text: 'All municipal transit corridors remain open and operating under normal schedule.' },
      ],
      fullTranscriptText:
        'We are reviewing the regional infrastructure timeline this quarter with full transparency. All municipal transit corridors remain open and operating under normal schedule.',
      limitationsNote: 'Offline Demo Preview synthetic audio telemetry. Real uploads run full Radix-2 FFT + Gemini transcription.',
    },
  ];

  const rawFindings = [
    {
      finding_id: 'FND-001',
      source_id: 'src_01',
      modality: 'visual' as const,
      timestamp: 4.8,
      quote: null,
      box_2d: [65, 620, 390, 810] as [number, number, number, number],
      indicator_category: 'Facial / Boundary Illumination Shift',
      indicator_title: 'Localized Facial Luma & Edge Compression Discontinuity',
      observed_signal: 'Inter-frame pixel delta spiked to 0.118 at 4.80s accompanied by +5.6 luma shift around facial region.',
      forensic_explanation:
        'Frames near 4.80s exhibit localized high-frequency sharpening around the jawline and collar compared to background auditorium compression blocks.',
      severity: 'moderate' as const,
      evidence_confidence: 0.74,
      frame_ref: DEMO_FRAME_1,
      counter_evidence: {
        benign_explanations: [
          'H.264 I-frame keyframe refresh or camera auto-exposure compensation during speaker head turn.',
          'Stage spotlight adjustment or camera flash in the press pool.',
        ],
        supporting_evidence: [
          'Frame delta score at 4.80s (0.118) is 5x higher than adjacent frames (0.021).',
          'Occurs within 50ms of an audio spectral centroid shift.',
        ],
        contradicting_evidence: [
          'Background press gallery and podium text remain geometrically stable without warping.',
          'Natural skin texture pores remain visible across inspected frames.',
        ],
        unresolved_questions: [
          'Does the uncropped original broadcast feed show a camera flash or cut at 4.8s?',
        ],
      },
    },
    {
      finding_id: 'FND-002',
      source_id: 'src_01',
      modality: 'audio' as const,
      timestamp: 4.75,
      quote: '...full transparency. [0.25s silence gap] All municipal transit corridors...',
      box_2d: null,
      indicator_category: 'Temporal Audio Splice Indicator',
      indicator_title: 'Abrupt Noise-Floor Drop & Spectral Bandwidth Narrowing',
      observed_signal: 'RMS energy dropped instantaneously to 0.0003 at 4.75s with spectral centroid jumping from 1350Hz to 2980Hz.',
      forensic_explanation:
        'Real room recordings rarely fall to near-zero digital silence between clauses; this pattern can indicate an audio splice, aggressive noise gate, or inserted speech segment.',
      severity: 'high' as const,
      evidence_confidence: 0.81,
      frame_ref: DEMO_FRAME_1,
      counter_evidence: {
        benign_explanations: [
          'Broadcast studio cough-mute switch or digital noise-gate threshold cutting room ambience.',
          'Routine editorial jump-cut trimming a pause during press highlight packaging.',
        ],
        supporting_evidence: [
          '0.25s zero-floor gap immediately precedes a 1630Hz spectral centroid jump.',
          'Aligns temporally with the 4.80s visual frame delta spike.',
        ],
        contradicting_evidence: [
          'Fundamental pitch contour (138Hz ±16Hz) remains consistent before and after the pause.',
        ],
        unresolved_questions: [
          'Was a routine editorial pause removal performed by the news publisher?',
        ],
      },
    },
    {
      finding_id: 'FND-003',
      source_id: 'src_01',
      modality: 'text' as const,
      timestamp: 5.0,
      quote: 'All municipal transit corridors remain open and operating under normal schedule.',
      box_2d: null,
      indicator_category: 'Caption–Speech Contradiction',
      indicator_title: 'Supplied Caption Conflicts with Extracted Spoken Statement',
      observed_signal: 'User-supplied caption claims transit shutdown, whereas transcribed speech at 5.0–11.2s states transit corridors remain open.',
      forensic_explanation:
        'The circulating caption reverses the semantic claim spoken in the audio track—a classic cheapfake / out-of-context reframing indicator requiring journalistic verification.',
      severity: 'high' as const,
      evidence_confidence: 0.88,
      frame_ref: DEMO_FRAME_1,
      counter_evidence: {
        benign_explanations: [
          'Caption may reference a different timestamp from a longer press conference not included in this 12-second clip.',
          'Translator or social media poster misheard or summarized an earlier policy proposal.',
        ],
        supporting_evidence: [
          'Direct verbatim transcription at 5.0s–11.2s explicitly contradicts the supplied caption text.',
        ],
        contradicting_evidence: [
          'Audio speech itself shows coherent natural phrasing consistent with a civic briefing.',
        ],
        unresolved_questions: [
          'Does the full unedited press conference contain a conditional shutdown statement elsewhere?',
        ],
      },
    },
    {
      finding_id: 'FND-004',
      source_id: 'src_02',
      modality: 'metadata' as const,
      timestamp: null,
      quote: null,
      box_2d: null,
      indicator_category: 'Container Provenance Advisory',
      indicator_title: 'Post-Processing Software Tag & Missing Primary Video Timestamp',
      observed_signal: 'src_01 lacks creation_time and carries Lavf60.16.100 encoder tag; src_02 carries Lightroom Classic export tag.',
      forensic_explanation:
        'Container tags document post-capture software transit. While expected on social re-uploads, stripped creation timestamps prevent automated chronological verification.',
      severity: 'review' as const,
      evidence_confidence: 0.62,
      frame_ref: DEMO_FRAME_2,
      counter_evidence: {
        benign_explanations: [
          'All major social networks (X, WhatsApp, Instagram, YouTube) strip EXIF/creation tags and re-encode with FFmpeg/Lavf.',
        ],
        supporting_evidence: ['Both creation_time absence in src_01 and Lavf encoder string verified by ffprobe.'],
        contradicting_evidence: ['Standard photojournalism workflow uses Lightroom for color/crop export.'],
        unresolved_questions: ['Can the original camera card or newsroom wire archive be queried?'],
      },
    },
  ];

  const findings = validateAndGroundFindings({ rawFindings, sources, frames });

  const crossModal: CrossModalCorrelation = {
    av_sync_status: 'potential_mismatch',
    caption_audio_status: 'potential_mismatch',
    temporal_continuity_status: 'discontinuity_noted',
    overlapping_windows: [
      {
        timestampSec: 4.8,
        modalities: ['visual', 'audio'],
        summary: 'Visual frame delta spike (4.80s) overlaps within 50ms of digital silence drop & spectral shift (4.75s), consistent with a splice or broadcast jump-cut.',
        cited_finding_ids: ['FND-001', 'FND-002'],
      },
    ],
    correlation_matrix: [
      {
        pair: 'Visual Frame Delta ↔ Audio Noise Floor',
        status: 'corroborating',
        explanation: 'Both visual frame delta (4.80s) and audio RMS zero-drop (4.75s) localize to the same sub-second window.',
      },
      {
        pair: 'Supplied Caption ↔ Speech Transcription',
        status: 'contradicting',
        explanation: 'Caption asserts immediate transit shutdown while spoken audio at 5.0–11.2s affirms normal transit operations.',
      },
      {
        pair: 'Reference Still (src_02) ↔ Video Speaker',
        status: 'unavailable',
        explanation: 'Different indoor vs. outdoor scenes and subjects; identity linkage not asserted without verified reference records.',
      },
    ],
  };

  const confidence = calculateConfidenceAndAssessment({
    sources,
    findings,
    hasVisualEvidence: true,
    hasAudioEvidence: true,
    hasTextContextEvidence: true,
    crossModal,
  });

  const debateRoom = {
    investigator: {
      summary:
        'Multiple modalities converge on an editing discontinuity near 4.75–4.80s coupled with a direct semantic inversion between the circulating caption and spoken audio.',
      key_arguments: [
        {
          claim: 'Co-occurring visual delta spike and digital silence drop at 4.75–4.80s indicate non-continuous recording or splice.',
          cited_finding_ids: ['FND-001', 'FND-002'],
        },
        {
          claim: 'Circulating caption directly contradicts spoken statement at 5.0–11.2s.',
          cited_finding_ids: ['FND-003'],
        },
      ],
    },
    skeptic: {
      summary:
        'Observed visual and audio discontinuities are fully explainable by routine newsroom jump-cut editing and social-media re-encoding; no definitive synthetic generation proof exists.',
      alternative_hypotheses: [
        {
          hypothesis: 'Routine editorial pause-trimming in post-production explains both the 4.75s silence floor and 4.80s frame delta.',
          cited_finding_ids: ['FND-001', 'FND-002', 'FND-004'],
        },
        {
          hypothesis: 'Caption discrepancy could stem from a longer unsubmitted portion of the briefing.',
          cited_finding_ids: ['FND-003'],
        },
      ],
    },
    adjudicator: {
      balanced_summary:
        'Evidence strongly supports an editing cut around 4.75–4.80s and a clear mismatch between the supplied caption and the audio inside this 12s clip. However, signal measurements alone cannot distinguish routine news editing from deceptive splicing, nor confirm whether the speaker made different remarks outside this excerpt.',
      verified_observations: [
        '4.75s audio RMS drop to 0.0003 coincides with 4.80s visual frame delta spike (0.118).',
        'Spoken audio at 5.0–11.2s contradicts the supplied caption summary.',
      ],
      unresolved_uncertainties: [
        'Full unedited press conference recording has not been supplied.',
        'Original camera master files are unavailable due to Lavf re-encoding.',
      ],
      recommended_next_steps: [
        'Locate full-length broadcast stream from official municipal archive to check context around 4.8s.',
        'Inspect frame-by-frame lip synchronization immediately after 5.0s if original high-bitrate file is obtained.',
      ],
    },
  };

  const narrative = {
    executive_summary:
      'Offline Demo Preview: Analysis of the 12-second briefing excerpt identified an aligned audio-visual discontinuity at 4.75–4.80s and a direct contradiction between the supplied caption and spoken audio. These indicators point toward editorial splicing or out-of-context reframing rather than proving AI face/voice synthesis.',
    what_was_analyzed:
      '2 demo media assets (a 12.0s MP4 press briefing excerpt and a 1200x900 reference JPEG) plus unverified social caption context.',
    detected_indicators_narrative:
      'High-priority indicators center on the 4.75s digital silence drop (FND-002) and the caption-audio contradiction (FND-003), corroborated by a moderate localized visual delta at 4.80s (FND-001).',
    corroborating_and_contradicting:
      'Audio and visual telemetry corroborate a cut at 4.8s, whereas stable pitch contour and natural skin/background consistency argue against heavy generative synthesis.',
    remaining_uncertainties:
      'Without the full unedited broadcast and camera master metadata, a benign editorial jump-cut cannot be ruled out.',
    contextual_mismatches: [
      {
        claim: 'Caption claims immediate suspension of downtown transit grid.',
        observed_evidence: 'Audio transcript (5.0s–11.2s): "All municipal transit corridors remain open and operating under normal schedule."',
        explanation: 'Direct semantic inversion between caption and audible statement in the supplied clip.',
        requires_human_review: true,
      },
    ],
    recommended_verification_steps: [
      'Obtain the full unedited municipal press conference broadcast.',
      'Verify whether the circulating caption was copied from a separate announcement.',
      'Compare source hashes against primary newsroom wire archives.',
    ],
    technical_limitations: [
      'This is an Offline Demo Preview built from deterministic showcase assets with zero external API calls.',
      'Social-platform Lavf re-encoding removes original camera sensor metadata.',
    ],
  };

  const basePayload = {
    investigation_id: investigationId,
    title: 'Offline Demo Preview — Municipal Briefing Excerpt',
    mode: 'demo' as const,
    created_at: createdAt,
    retain_media: true,
    media_purged: false,
    model_telemetry: {
      primary_configured: 'offline-demo-deterministic',
      model_used: 'offline-demo-deterministic',
      fallback_used: false,
      transcribe_model_used: null,
      attempts: 0,
      warnings: ['Offline Demo Preview active — no Gemini API calls were executed.'],
    },
    user_context: {
      caption: 'BREAKING: Spokesperson announces immediate suspension of downtown transit grid.',
      claimedSpeaker: 'Regional Transit Director (Unverified)',
      claimedLocation: 'Municipal Hall',
      claimedEvent: 'Emergency Transit Briefing',
      sourceDescription: 'Circulated social video clip paired with outdoor reference still.',
    },
    sources,
    frames,
    audio_analyses: audioAnalyses,
    findings,
    cross_modal: crossModal,
    confidence,
    debate_room: debateRoom,
    narrative,
    disclaimer: FORENSIC_DISCLAIMER,
  };

  const trust_passport = await buildTrustPassport({
    investigationId,
    analysisTimestamp: createdAt,
    sourceHashes: sources.map((s) => ({ source_id: s.source_id, filename: s.originalName, sha256: s.sha256 })),
    appBaseUrl,
    canonicalBodyForHash: {
      investigation_id: basePayload.investigation_id,
      mode: basePayload.mode,
      created_at: basePayload.created_at,
      sources: basePayload.sources.map((s) => ({ id: s.source_id, sha256: s.sha256 })),
      findings: basePayload.findings.map((f) => ({ id: f.finding_id, severity: f.severity, timestamp: f.timestamp })),
      detector_versions: DETECTOR_VERSIONS,
    },
  });

  return {
    ...basePayload,
    trust_passport,
  };
}
