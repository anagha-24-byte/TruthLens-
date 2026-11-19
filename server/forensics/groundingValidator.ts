import type {
  ExtractedFrame,
  ForensicFinding,
  MediaModality,
  SeverityLevel,
  SourceFileRecord,
} from '../../src/types/forensics.ts';

const VALID_MODALITIES = new Set<MediaModality>(['visual', 'audio', 'text', 'cross_modal', 'metadata']);
const VALID_SEVERITIES = new Set<SeverityLevel>(['high', 'moderate', 'review', 'nominal']);

export function validateAndGroundFindings(params: {
  rawFindings: Array<Partial<ForensicFinding>>;
  sources: SourceFileRecord[];
  frames: ExtractedFrame[];
}): ForensicFinding[] {
  const { rawFindings, sources, frames } = params;
  const sourceMap = new Map(sources.map((s) => [s.source_id, s]));
  const fallbackSourceId = sources[0]?.source_id || 'src_unknown';

  const grounded: ForensicFinding[] = [];

  for (let i = 0; i < rawFindings.length; i++) {
    const raw = rawFindings[i];
    const groundingNotes: string[] = [];

    // 1. Validate source_id exists in uploaded sources
    let sourceId = String(raw.source_id || '').trim();
    if (!sourceMap.has(sourceId)) {
      groundingNotes.push(
        `Original source reference "${sourceId || 'empty'}" remapped to primary source "${fallbackSourceId}".`
      );
      sourceId = fallbackSourceId;
    }
    const source = sourceMap.get(sourceId);

    // 2. Validate modality & severity
    const modality: MediaModality = VALID_MODALITIES.has(raw.modality as MediaModality)
      ? (raw.modality as MediaModality)
      : 'visual';
    const severity: SeverityLevel = VALID_SEVERITIES.has(raw.severity as SeverityLevel)
      ? (raw.severity as SeverityLevel)
      : 'review';

    // 3. Validate timestamp against actual media duration
    let timestamp: number | null =
      typeof raw.timestamp === 'number' && !Number.isNaN(raw.timestamp) ? Number(raw.timestamp.toFixed(2)) : null;

    const maxDur = source?.metadata.durationSec ?? null;
    if (timestamp !== null) {
      if (timestamp < 0) {
        groundingNotes.push(`Negative timestamp (${timestamp}s) clamped to 0.00s.`);
        timestamp = 0;
      } else if (maxDur !== null && maxDur > 0 && timestamp > maxDur) {
        groundingNotes.push(`Timestamp (${timestamp}s) exceeded media duration (${maxDur}s); clamped to ${maxDur}s.`);
        timestamp = maxDur;
      }
    }

    // 4. Validate box_2d [ymin, xmin, ymax, xmax] normalized 0..1000
    let box2d: [number, number, number, number] | null = null;
    if (Array.isArray(raw.box_2d) && raw.box_2d.length === 4) {
      const nums = raw.box_2d.map((n) => Math.max(0, Math.min(1000, Math.round(Number(n)))));
      if (nums.every((n) => !Number.isNaN(n)) && nums[0] < nums[2] && nums[1] < nums[3]) {
        box2d = [nums[0], nums[1], nums[2], nums[3]];
      } else {
        groundingNotes.push('Invalid bounding box geometry discarded by grounding validator.');
      }
    }

    // 5. Associate closest extracted frame if visual/cross-modal
    let frameRef: string | null = raw.frame_ref || null;
    if (!frameRef && (modality === 'visual' || modality === 'cross_modal')) {
      const sourceFrames = frames.filter((fr) => fr.source_id === sourceId);
      if (sourceFrames.length > 0) {
        if (timestamp !== null) {
          let best = sourceFrames[0];
          let bestDist = Math.abs(best.timestampSec - timestamp);
          for (const fr of sourceFrames) {
            const d = Math.abs(fr.timestampSec - timestamp);
            if (d < bestDist) {
              best = fr;
              bestDist = d;
            }
          }
          frameRef = best.imageUrl;
        } else {
          frameRef = sourceFrames[0].imageUrl;
        }
      } else if (source?.kind === 'image' && source.artifactUrl) {
        frameRef = source.artifactUrl;
      }
    }

    const ce = raw.counter_evidence;
    const findingId = String(raw.finding_id || `FND-${String(i + 1).padStart(3, '0')}`);

    grounded.push({
      finding_id: findingId,
      source_id: sourceId,
      modality,
      timestamp,
      quote: raw.quote ? String(raw.quote) : null,
      box_2d: box2d,
      indicator_category: String(raw.indicator_category || 'Signal Anomaly'),
      indicator_title: String(raw.indicator_title || 'Observed Forensic Indicator'),
      observed_signal: String(raw.observed_signal || 'Localized signal deviation recorded during automated inspection.'),
      forensic_explanation: String(
        raw.forensic_explanation ||
          'Automated signal inspection observed an anomaly requiring human verification against benign acquisition causes.'
      ),
      severity,
      evidence_confidence: Math.max(0.05, Math.min(0.99, Number(raw.evidence_confidence ?? 0.5))),
      frame_ref: frameRef,
      counter_evidence: {
        benign_explanations:
          Array.isArray(ce?.benign_explanations) && ce.benign_explanations.length > 0
            ? ce.benign_explanations.map(String)
            : ['Standard lossy compression, codec keyframe quantization, or lighting shifts can produce similar artifacts.'],
        supporting_evidence:
          Array.isArray(ce?.supporting_evidence) && ce.supporting_evidence.length > 0
            ? ce.supporting_evidence.map(String)
            : [String(raw.observed_signal || 'Detected in primary stream telemetry.')],
        contradicting_evidence:
          Array.isArray(ce?.contradicting_evidence) && ce.contradicting_evidence.length > 0
            ? ce.contradicting_evidence.map(String)
            : ['Surrounding media segments do not exhibit corroborating manipulation across all modalities.'],
        unresolved_questions:
          Array.isArray(ce?.unresolved_questions) && ce.unresolved_questions.length > 0
            ? ce.unresolved_questions.map(String)
            : ['Can the original camera/device master file be obtained to verify encoding provenance?'],
      },
      review_status: 'unreviewed',
      investigator_notes: '',
      grounding_notes: groundingNotes.length > 0 ? groundingNotes : undefined,
    });
  }

  return grounded;
}
