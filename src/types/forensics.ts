export type MediaKind = 'image' | 'video' | 'audio' | 'text';
export type MediaModality = 'visual' | 'audio' | 'text' | 'cross_modal' | 'metadata';
export type SeverityLevel = 'high' | 'moderate' | 'review' | 'nominal';
export type ReviewStatus = 'unreviewed' | 'confirmed' | 'benign' | 'secondary_review';

export type AssessmentCategory =
  | 'No significant manipulation indicators detected.'
  | 'Potential manipulation indicators detected.'
  | 'Multiple suspicious indicators detected.'
  | 'Inconclusive – insufficient evidence.';

export interface MediaMetadata {
  formatName: string;
  durationSec: number | null;
  width: number | null;
  height: number | null;
  frameRate: number | null;
  audioSampleRate: number | null;
  audioChannels: number | null;
  videoCodec: string | null;
  audioCodec: string | null;
  bitrateKbps: number | null;
  fileSizeBytes: number;
  creationTime: string | null;
  encoderTag: string | null;
  anomalies: string[];
  limitationsNote: string;
}

export interface SourceFileRecord {
  source_id: string;
  originalName: string;
  safeName: string;
  kind: MediaKind;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  artifactUrl: string | null;
  elaUrl: string | null;
  textExcerpt: string | null;
  metadata: MediaMetadata;
}

export interface ExtractedFrame {
  frameId: string;
  source_id: string;
  frameNumber: number;
  timestampSec: number;
  imageUrl: string;
  elaImageUrl: string | null;
  frameDeltaScore: number;
  lumaMean: number;
}

export interface AudioTimelinePoint {
  timestampSec: number;
  rms: number;
  zcr: number;
  spectralCentroidHz: number;
  spectralBandwidthHz: number;
  pitchHz: number | null;
  voiceActive: boolean;
}

export interface TranscriptSegment {
  startSec: number;
  endSec: number;
  text: string;
}

export interface AudioDspSummary {
  source_id: string;
  durationSec: number;
  sampleRate: number;
  channels: number;
  waveformBins: number[];
  timelineMetrics: AudioTimelinePoint[];
  mfccSummary: number[];
  anomalies: Array<{
    timestampSec: number;
    kind: string;
    magnitude: number;
    detail: string;
  }>;
  transcript: TranscriptSegment[];
  fullTranscriptText: string;
  limitationsNote: string;
}

export interface CounterEvidence {
  benign_explanations: string[];
  supporting_evidence: string[];
  contradicting_evidence: string[];
  unresolved_questions: string[];
}

export interface ForensicFinding {
  finding_id: string;
  source_id: string;
  modality: MediaModality;
  timestamp: number | null;
  quote: string | null;
  box_2d: [number, number, number, number] | null;
  indicator_category: string;
  indicator_title: string;
  observed_signal: string;
  forensic_explanation: string;
  severity: SeverityLevel;
  evidence_confidence: number;
  frame_ref: string | null;
  counter_evidence: CounterEvidence;
  review_status: ReviewStatus;
  investigator_notes: string;
  grounding_notes?: string[];
}

export interface DebateRoomPerspective {
  investigator: {
    summary: string;
    key_arguments: Array<{ claim: string; cited_finding_ids: string[] }>;
  };
  skeptic: {
    summary: string;
    alternative_hypotheses: Array<{ hypothesis: string; cited_finding_ids: string[] }>;
  };
  adjudicator: {
    balanced_summary: string;
    verified_observations: string[];
    unresolved_uncertainties: string[];
    recommended_next_steps: string[];
  };
}

export interface CrossModalCorrelation {
  av_sync_status: 'aligned' | 'potential_mismatch' | 'unavailable';
  caption_audio_status: 'aligned' | 'potential_mismatch' | 'unavailable';
  temporal_continuity_status: 'consistent' | 'discontinuity_noted' | 'unavailable';
  overlapping_windows: Array<{
    timestampSec: number;
    modalities: string[];
    summary: string;
    cited_finding_ids: string[];
  }>;
  correlation_matrix: Array<{
    pair: string;
    status: 'corroborating' | 'contradicting' | 'unavailable';
    explanation: string;
  }>;
}

export interface ModalityScoreDetail {
  score: number | null;
  coverage: number;
  status: 'available' | 'unavailable' | 'inconclusive';
  contributing_signals: string[];
}

export interface ConfidenceEngineResult {
  visual: ModalityScoreDetail;
  audio: ModalityScoreDetail;
  textual: ModalityScoreDetail;
  cross_modal: ModalityScoreDetail;
  overall_indicator_index: number | null;
  evidence_completeness_pct: number;
  assessment_category: AssessmentCategory;
  methodology_notes: string;
  unavailable_signals: string[];
  inconclusive_observations: string[];
  epistemic_notice: string;
}

export interface TrustPassport {
  investigation_id: string;
  report_sha256: string;
  analysis_timestamp: string;
  source_hashes: Array<{ source_id: string; filename: string; sha256: string }>;
  detector_versions: Record<string, string>;
  verification_url: string;
  qr_data_url: string;
  integrity_vs_authenticity_note: string;
}

export interface UserContextClaims {
  caption: string;
  claimedSpeaker: string;
  claimedLocation: string;
  claimedEvent: string;
  sourceDescription: string;
}

export interface ExplainableNarrative {
  executive_summary: string;
  what_was_analyzed: string;
  detected_indicators_narrative: string;
  corroborating_and_contradicting: string;
  remaining_uncertainties: string;
  contextual_mismatches: Array<{
    claim: string;
    observed_evidence: string;
    explanation: string;
    requires_human_review: boolean;
  }>;
  recommended_verification_steps: string[];
  technical_limitations: string[];
}

export interface InvestigationReport {
  investigation_id: string;
  title: string;
  mode: 'live' | 'demo';
  created_at: string;
  retain_media: boolean;
  media_purged: boolean;
  model_telemetry: {
    primary_configured: string;
    model_used: string;
    fallback_used: boolean;
    transcribe_model_used: string | null;
    attempts: number;
    warnings: string[];
  };
  user_context: UserContextClaims;
  sources: SourceFileRecord[];
  frames: ExtractedFrame[];
  audio_analyses: AudioDspSummary[];
  findings: ForensicFinding[];
  cross_modal: CrossModalCorrelation;
  confidence: ConfidenceEngineResult;
  debate_room: DebateRoomPerspective;
  narrative: ExplainableNarrative;
  trust_passport: TrustPassport;
  disclaimer: string;
}

export interface InvestigationSummary {
  investigation_id: string;
  title: string;
  mode: 'live' | 'demo';
  created_at: string;
  primary_filename: string;
  source_count: number;
  assessment_category: AssessmentCategory;
  overall_indicator_index: number | null;
  suspicious_count: number;
  needs_review_count: number;
  confirmed_count: number;
  report_sha256: string;
  media_purged: boolean;
}

export interface DashboardStats {
  total_files_analyzed: number;
  suspicious_files_flagged: number;
  analyses_requiring_review: number;
  completed_investigations: number;
  recent_investigations: InvestigationSummary[];
}

export interface InvestigatorUser {
  id: string;
  email: string;
  fullName: string;
  organization: string;
  roleTitle: string;
}

export interface LoginSubmittedContext {
  caseUnit: string;
  caseReference: string;
  intakeNote: string;
}

export interface AuthSession {
  token: string;
  user: InvestigatorUser;
  submittedContext: LoginSubmittedContext;
  expiresAt: string;
}

