import type {
  AssessmentCategory,
  ConfidenceEngineResult,
  CrossModalCorrelation,
  ForensicFinding,
  ModalityScoreDetail,
  SourceFileRecord,
} from '../../src/types/forensics.ts';

function computeModalityScore(
  findings: ForensicFinding[],
  hasEvidence: boolean,
  signals: string[]
): ModalityScoreDetail {
  if (!hasEvidence) {
    return {
      score: null,
      coverage: 0,
      status: 'unavailable',
      contributing_signals: [],
    };
  }

  if (findings.length === 0) {
    return {
      score: 8, // Baseline minimal residual noise floor when inspected cleanly
      coverage: 1,
      status: 'available',
      contributing_signals: signals.length ? signals : ['Automated signal inspection completed with no elevated anomalies'],
    };
  }

  const severityWeight: Record<string, number> = {
    high: 42,
    moderate: 25,
    review: 14,
    nominal: 4,
  };

  let weightedSum = 0;
  for (const f of findings) {
    const w = severityWeight[f.severity] ?? 10;
    const conf = Math.max(0.25, Math.min(1, f.evidence_confidence || 0.5));
    // Confirmed findings retain full weight; investigator-marked benign findings drop to minimal residual
    const reviewFactor = f.review_status === 'benign' ? 0.15 : f.review_status === 'confirmed' ? 1.15 : 1.0;
    weightedSum += w * conf * reviewFactor;
  }

  // Diminishing-returns saturation curve: 100 * (1 - exp(-weightedSum / 68))
  const score = Math.min(96, Math.round(100 * (1 - Math.exp(-weightedSum / 68))));
  const hasOnlyReview = findings.every((f) => f.severity === 'review' || f.severity === 'nominal');

  return {
    score,
    coverage: 1,
    status: hasOnlyReview && score < 22 ? 'inconclusive' : 'available',
    contributing_signals: signals,
  };
}

export function calculateConfidenceAndAssessment(params: {
  sources: SourceFileRecord[];
  findings: ForensicFinding[];
  hasVisualEvidence: boolean;
  hasAudioEvidence: boolean;
  hasTextContextEvidence: boolean;
  crossModal: CrossModalCorrelation;
}): ConfidenceEngineResult {
  const {
    sources,
    findings,
    hasVisualEvidence,
    hasAudioEvidence,
    hasTextContextEvidence,
    crossModal,
  } = params;

  const visualFindings = findings.filter((f) => f.modality === 'visual' || f.modality === 'metadata');
  const audioFindings = findings.filter((f) => f.modality === 'audio');
  const textFindings = findings.filter((f) => f.modality === 'text');
  const crossFindings = findings.filter((f) => f.modality === 'cross_modal');

  const visual = computeModalityScore(
    visualFindings,
    hasVisualEvidence,
    visualFindings.map((f) => `${f.indicator_title} (${f.severity})`)
  );
  const audio = computeModalityScore(
    audioFindings,
    hasAudioEvidence,
    audioFindings.map((f) => `${f.indicator_title} (${f.severity})`)
  );
  const textual = computeModalityScore(
    textFindings,
    hasTextContextEvidence,
    textFindings.map((f) => `${f.indicator_title} (${f.severity})`)
  );

  const crossAvailable =
    crossModal.av_sync_status !== 'unavailable' ||
    crossModal.caption_audio_status !== 'unavailable' ||
    crossModal.temporal_continuity_status !== 'unavailable' ||
    crossFindings.length > 0;

  const crossSignals: string[] = [];
  if (crossModal.av_sync_status !== 'unavailable') {
    crossSignals.push(`A/V synchronization check: ${crossModal.av_sync_status}`);
  }
  if (crossModal.caption_audio_status !== 'unavailable') {
    crossSignals.push(`Caption-speech alignment: ${crossModal.caption_audio_status}`);
  }
  if (crossModal.temporal_continuity_status !== 'unavailable') {
    crossSignals.push(`Temporal continuity: ${crossModal.temporal_continuity_status}`);
  }
  for (const cf of crossFindings) {
    crossSignals.push(`${cf.indicator_title} (${cf.severity})`);
  }

  const cross_modal = computeModalityScore(crossFindings, crossAvailable, crossSignals);

  // Weighted aggregation strictly over AVAILABLE modalities
  const weights: Array<{ key: string; weight: number; detail: ModalityScoreDetail }> = [
    { key: 'visual', weight: 0.34, detail: visual },
    { key: 'audio', weight: 0.28, detail: audio },
    { key: 'textual', weight: 0.18, detail: textual },
    { key: 'cross_modal', weight: 0.20, detail: cross_modal },
  ];

  let activeWeight = 0;
  let weightedScoreSum = 0;
  const unavailable_signals: string[] = [];
  const inconclusive_observations: string[] = [];

  for (const item of weights) {
    if (item.detail.status === 'unavailable' || item.detail.score === null) {
      unavailable_signals.push(`${item.key.replace('_', '-')} modality unavailable in submitted evidence`);
    } else {
      activeWeight += item.weight;
      weightedScoreSum += item.weight * item.detail.score;
      if (item.detail.status === 'inconclusive') {
        inconclusive_observations.push(`${item.key.replace('_', '-')} signals require human verification`);
      }
    }
  }

  const evidence_completeness_pct = Math.round(activeWeight * 100);
  const overall_indicator_index =
    activeWeight > 0 ? Math.round(weightedScoreSum / activeWeight) : null;

  const activeSuspicious = findings.filter(
    (f) => f.review_status !== 'benign' && (f.severity === 'high' || f.severity === 'moderate')
  );
  const highCount = activeSuspicious.filter((f) => f.severity === 'high').length;

  let assessment_category: AssessmentCategory;
  if (sources.length === 0 || activeWeight < 0.20 || overall_indicator_index === null) {
    assessment_category = 'Inconclusive – insufficient evidence.';
  } else if (
    (highCount >= 2 || activeSuspicious.length >= 3 || overall_indicator_index >= 58) &&
    evidence_completeness_pct >= 30
  ) {
    assessment_category = 'Multiple suspicious indicators detected.';
  } else if (activeSuspicious.length >= 1 || overall_indicator_index >= 30) {
    assessment_category = 'Potential manipulation indicators detected.';
  } else if (evidence_completeness_pct < 35 && findings.some((f) => f.severity === 'review')) {
    assessment_category = 'Inconclusive – insufficient evidence.';
  } else {
    assessment_category = 'No significant manipulation indicators detected.';
  }

  return {
    visual,
    audio,
    textual,
    cross_modal,
    overall_indicator_index,
    evidence_completeness_pct,
    assessment_category,
    methodology_notes:
      'Deterministic saturation aggregation across available modalities only (Visual 34%, Audio 28%, Textual 18%, Cross-Modal 20%, re-normalized to active coverage). Missing modalities carry 0 weight and are never penalized as suspicious.',
    unavailable_signals,
    inconclusive_observations,
    epistemic_notice:
      'An absence of detected indicators does not prove authenticity, and elevated indicator scores do not prove intentional manipulation. Compression, re-encoding, and recording artifacts frequently mimic forensic anomalies.',
  };
}
