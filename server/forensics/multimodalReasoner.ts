import fs from 'fs';
import path from 'path';
import { Type } from '@google/genai';
import { generateContentWithFallback } from '../geminiClient.ts';
import type {
  AudioDspSummary,
  CrossModalCorrelation,
  DebateRoomPerspective,
  ExplainableNarrative,
  ExtractedFrame,
  ForensicFinding,
  SourceFileRecord,
  UserContextClaims,
} from '../../src/types/forensics.ts';

interface MultimodalSynthesisResult {
  findings: Array<Partial<ForensicFinding>>;
  cross_modal: CrossModalCorrelation;
  debate_room: DebateRoomPerspective;
  narrative: ExplainableNarrative;
  modelUsed: string;
  fallbackUsed: boolean;
  attempts: number;
  warnings: string[];
}

export async function runMultimodalForensicReasoning(params: {
  sources: SourceFileRecord[];
  frames: ExtractedFrame[];
  audioAnalyses: AudioDspSummary[];
  userContext: UserContextClaims;
  artifactsDir: string;
  investigationId: string;
}): Promise<MultimodalSynthesisResult> {
  const { sources, frames, audioAnalyses, userContext, artifactsDir, investigationId } = params;

  const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];

  // Attach up to 8 representative visual frames / images (real bytes) for multimodal inspection
  const visualImagesToInspect: Array<{ label: string; filePath: string; mimeType: string }> = [];

  for (const src of sources) {
    if (src.kind === 'image' && src.artifactUrl) {
      const diskPath = path.join(artifactsDir, src.artifactUrl.replace(/^\/artifacts\//, ''));
      if (fs.existsSync(diskPath)) {
        visualImagesToInspect.push({
          label: `IMAGE source_id="${src.source_id}" (${src.originalName})`,
          filePath: diskPath,
          mimeType: src.mimeType.startsWith('image/') ? src.mimeType : 'image/jpeg',
        });
      }
      if (src.elaUrl) {
        const elaPath = path.join(artifactsDir, src.elaUrl.replace(/^\/artifacts\//, ''));
        if (fs.existsSync(elaPath)) {
          visualImagesToInspect.push({
            label: `ELA_HEATMAP source_id="${src.source_id}"`,
            filePath: elaPath,
            mimeType: 'image/jpeg',
          });
        }
      }
    }
  }

  // Pick up to 6 key video frames (including highest frameDeltaScore frames)
  const sortedFrames = [...frames].sort((a, b) => b.frameDeltaScore - a.frameDeltaScore);
  const selectedFrames = Array.from(
    new Set([...frames.slice(0, 3), ...sortedFrames.slice(0, 3)])
  ).slice(0, 6);

  for (const fr of selectedFrames) {
    const diskPath = path.join(artifactsDir, fr.imageUrl.replace(/^\/artifacts\//, ''));
    if (fs.existsSync(diskPath)) {
      visualImagesToInspect.push({
        label: `VIDEO_FRAME source_id="${fr.source_id}" frame=${fr.frameNumber} timestamp=${fr.timestampSec}s luma=${fr.lumaMean} delta=${fr.frameDeltaScore}`,
        filePath: diskPath,
        mimeType: 'image/jpeg',
      });
    }
  }

  for (const item of visualImagesToInspect.slice(0, 8)) {
    const b64 = fs.readFileSync(item.filePath).toString('base64');
    parts.push({ text: `[Visual Evidence Asset: ${item.label}]` });
    parts.push({ inlineData: { mimeType: item.mimeType, data: b64 } });
  }

  // Attach any uploaded PDF files directly if small (< 4MB)
  for (const src of sources) {
    if (src.kind === 'text' && src.mimeType === 'application/pdf' && src.artifactUrl) {
      const diskPath = path.join(artifactsDir, src.artifactUrl.replace(/^\/artifacts\//, ''));
      if (fs.existsSync(diskPath) && fs.statSync(diskPath).size < 4 * 1024 * 1024) {
        parts.push({ text: `[Uploaded PDF Document source_id="${src.source_id}" filename="${src.originalName}"]` });
        parts.push({
          inlineData: {
            mimeType: 'application/pdf',
            data: fs.readFileSync(diskPath).toString('base64'),
          },
        });
      }
    }
  }

  const telemetryDigest = {
    investigation_id: investigationId,
    sources: sources.map((s) => ({
      source_id: s.source_id,
      filename: s.originalName,
      kind: s.kind,
      sha256: s.sha256,
      metadata: s.metadata,
      textExcerpt: s.textExcerpt ? s.textExcerpt.slice(0, 4000) : null,
    })),
    extracted_frames_telemetry: frames.map((f) => ({
      frameId: f.frameId,
      source_id: f.source_id,
      frameNumber: f.frameNumber,
      timestampSec: f.timestampSec,
      lumaMean: f.lumaMean,
      frameDeltaScore: f.frameDeltaScore,
    })),
    audio_dsp_telemetry: audioAnalyses.map((a) => ({
      source_id: a.source_id,
      durationSec: a.durationSec,
      sampleRate: a.sampleRate,
      mfccSummary: a.mfccSummary,
      anomalies: a.anomalies,
      fullTranscriptText: a.fullTranscriptText,
      transcriptSegments: a.transcript,
      meanSpectralCentroidHz:
        a.timelineMetrics.length > 0
          ? Math.round(
              a.timelineMetrics.reduce((s, p) => s + p.spectralCentroidHz, 0) / a.timelineMetrics.length
            )
          : null,
    })),
    unverified_user_claims: userContext,
  };

  const systemInstruction = `You are TruthLens AI, an epistemic-first Multimodal Digital Forensics Analyst.
STRICT RULES:
1. NEVER claim any image, video, or audio is "definitely fake" or "definitely authentic" or prove a real-world event false. Frame every observation as an indicator, measurement, or discrepancy requiring human verification.
2. NEVER fabricate source_ids, timestamps, quotes, metadata, or detector outputs. Every finding MUST reference an exact source_id from the provided sources list, and any timestamp MUST lie strictly within [0, durationSec] of that source.
3. For visual findings, provide normalized box_2d [ymin, xmin, ymax, xmax] in 0..1000 coordinates pointing to the inspected region (or null if whole-frame/non-spatial).
4. For EVERY finding, populate Counter-Evidence (plausible benign explanations, supporting evidence, contradicting evidence, unresolved questions).
5. In the AI Debate Room (investigator, skeptic, adjudicator), cite ONLY the exact finding_id values you created in the findings array. Never invent extra findings in the debate.
6. If a modality (e.g. audio, video, or user context) is missing, mark cross-modal checks for it as "unavailable"—never treat missing evidence as manipulation.`;

  parts.push({
    text: `Analyze all attached visual evidence assets and the real deterministic telemetry below. Return a single JSON object adhering strictly to the schema.

TELEMETRY & CONTEXT DIGEST:
${JSON.stringify(telemetryDigest, null, 2)}`,
  });

  const responseSchema = {
    type: Type.OBJECT,
    properties: {
      findings: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            finding_id: { type: Type.STRING },
            source_id: { type: Type.STRING },
            modality: { type: Type.STRING },
            timestamp: { type: Type.NUMBER, nullable: true },
            quote: { type: Type.STRING, nullable: true },
            box_2d: {
              type: Type.ARRAY,
              items: { type: Type.INTEGER },
              nullable: true,
            },
            indicator_category: { type: Type.STRING },
            indicator_title: { type: Type.STRING },
            observed_signal: { type: Type.STRING },
            forensic_explanation: { type: Type.STRING },
            severity: { type: Type.STRING },
            evidence_confidence: { type: Type.NUMBER },
            counter_evidence: {
              type: Type.OBJECT,
              properties: {
                benign_explanations: { type: Type.ARRAY, items: { type: Type.STRING } },
                supporting_evidence: { type: Type.ARRAY, items: { type: Type.STRING } },
                contradicting_evidence: { type: Type.ARRAY, items: { type: Type.STRING } },
                unresolved_questions: { type: Type.ARRAY, items: { type: Type.STRING } },
              },
            },
          },
        },
      },
      cross_modal: {
        type: Type.OBJECT,
        properties: {
          av_sync_status: { type: Type.STRING },
          caption_audio_status: { type: Type.STRING },
          temporal_continuity_status: { type: Type.STRING },
          overlapping_windows: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                timestampSec: { type: Type.NUMBER },
                modalities: { type: Type.ARRAY, items: { type: Type.STRING } },
                summary: { type: Type.STRING },
                cited_finding_ids: { type: Type.ARRAY, items: { type: Type.STRING } },
              },
            },
          },
          correlation_matrix: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                pair: { type: Type.STRING },
                status: { type: Type.STRING },
                explanation: { type: Type.STRING },
              },
            },
          },
        },
      },
      debate_room: {
        type: Type.OBJECT,
        properties: {
          investigator: {
            type: Type.OBJECT,
            properties: {
              summary: { type: Type.STRING },
              key_arguments: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    claim: { type: Type.STRING },
                    cited_finding_ids: { type: Type.ARRAY, items: { type: Type.STRING } },
                  },
                },
              },
            },
          },
          skeptic: {
            type: Type.OBJECT,
            properties: {
              summary: { type: Type.STRING },
              alternative_hypotheses: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    hypothesis: { type: Type.STRING },
                    cited_finding_ids: { type: Type.ARRAY, items: { type: Type.STRING } },
                  },
                },
              },
            },
          },
          adjudicator: {
            type: Type.OBJECT,
            properties: {
              balanced_summary: { type: Type.STRING },
              verified_observations: { type: Type.ARRAY, items: { type: Type.STRING } },
              unresolved_uncertainties: { type: Type.ARRAY, items: { type: Type.STRING } },
              recommended_next_steps: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
          },
        },
      },
      narrative: {
        type: Type.OBJECT,
        properties: {
          executive_summary: { type: Type.STRING },
          what_was_analyzed: { type: Type.STRING },
          detected_indicators_narrative: { type: Type.STRING },
          corroborating_and_contradicting: { type: Type.STRING },
          remaining_uncertainties: { type: Type.STRING },
          contextual_mismatches: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                claim: { type: Type.STRING },
                observed_evidence: { type: Type.STRING },
                explanation: { type: Type.STRING },
                requires_human_review: { type: Type.BOOLEAN },
              },
            },
          },
          recommended_verification_steps: { type: Type.ARRAY, items: { type: Type.STRING } },
          technical_limitations: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
      },
    },
  };

  const { response, telemetry } = await generateContentWithFallback({
    contents: { parts },
    config: {
      systemInstruction,
      responseMimeType: 'application/json',
      responseSchema,
    },
  });

  const parsed = JSON.parse((response.text || '{}').trim()) as {
    findings?: Array<Partial<ForensicFinding>>;
    cross_modal?: Partial<CrossModalCorrelation>;
    debate_room?: Partial<DebateRoomPerspective>;
    narrative?: Partial<ExplainableNarrative>;
  };

  const crossModal: CrossModalCorrelation = {
    av_sync_status: (parsed.cross_modal?.av_sync_status as CrossModalCorrelation['av_sync_status']) || 'unavailable',
    caption_audio_status:
      (parsed.cross_modal?.caption_audio_status as CrossModalCorrelation['caption_audio_status']) || 'unavailable',
    temporal_continuity_status:
      (parsed.cross_modal?.temporal_continuity_status as CrossModalCorrelation['temporal_continuity_status']) ||
      'unavailable',
    overlapping_windows: parsed.cross_modal?.overlapping_windows || [],
    correlation_matrix: parsed.cross_modal?.correlation_matrix || [],
  };

  const debateRoom: DebateRoomPerspective = {
    investigator: {
      summary: parsed.debate_room?.investigator?.summary || 'Investigator reviewed available signal indicators.',
      key_arguments: parsed.debate_room?.investigator?.key_arguments || [],
    },
    skeptic: {
      summary: parsed.debate_room?.skeptic?.summary || 'Skeptic evaluated benign acquisition and compression hypotheses.',
      alternative_hypotheses: parsed.debate_room?.skeptic?.alternative_hypotheses || [],
    },
    adjudicator: {
      balanced_summary:
        parsed.debate_room?.adjudicator?.balanced_summary ||
        'Adjudicator synthesized both perspectives while preserving epistemic uncertainty.',
      verified_observations: parsed.debate_room?.adjudicator?.verified_observations || [],
      unresolved_uncertainties: parsed.debate_room?.adjudicator?.unresolved_uncertainties || [],
      recommended_next_steps: parsed.debate_room?.adjudicator?.recommended_next_steps || [],
    },
  };

  const narrative: ExplainableNarrative = {
    executive_summary:
      parsed.narrative?.executive_summary || 'Automated multimodal forensic inspection completed.',
    what_was_analyzed:
      parsed.narrative?.what_was_analyzed || `${sources.length} submitted source file(s) inspected.`,
    detected_indicators_narrative:
      parsed.narrative?.detected_indicators_narrative || 'Review structured findings for specific indicator details.',
    corroborating_and_contradicting:
      parsed.narrative?.corroborating_and_contradicting || 'See Cross-Modal Correlation and Counter-Evidence panels.',
    remaining_uncertainties:
      parsed.narrative?.remaining_uncertainties ||
      'Automated detectors cannot verify chain-of-custody without original camera masters.',
    contextual_mismatches: parsed.narrative?.contextual_mismatches || [],
    recommended_verification_steps:
      parsed.narrative?.recommended_verification_steps || [
        'Inspect highlighted frames against raw uncompressed master files if available.',
        'Cross-verify claimed speaker, time, and location through independent primary reporting.',
      ],
    technical_limitations:
      parsed.narrative?.technical_limitations || [
        'Social-media re-compression alters JPEG quantization and audio frequency bandwidth.',
        'Automated indicators highlight statistical or structural irregularities, not intent.',
      ],
  };

  return {
    findings: parsed.findings || [],
    cross_modal: crossModal,
    debate_room: debateRoom,
    narrative,
    modelUsed: telemetry.modelUsed,
    fallbackUsed: telemetry.fallbackUsed,
    attempts: telemetry.attempts,
    warnings: telemetry.warnings,
  };
}
