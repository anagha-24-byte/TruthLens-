import { DatabaseSync } from 'node:sqlite';
import fs from 'fs';
import path from 'path';
import { ARTIFACTS_DIR, DB_PATH } from '../config.ts';
import type {
  DashboardStats,
  InvestigationReport,
  InvestigationSummary,
  ReviewStatus,
} from '../../src/types/forensics.ts';

const db = new DatabaseSync(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS investigations (
    investigation_id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    mode TEXT NOT NULL,
    created_at TEXT NOT NULL,
    primary_filename TEXT NOT NULL,
    source_count INTEGER NOT NULL,
    assessment_category TEXT NOT NULL,
    overall_indicator_index REAL,
    suspicious_count INTEGER NOT NULL,
    needs_review_count INTEGER NOT NULL,
    confirmed_count INTEGER NOT NULL,
    report_sha256 TEXT NOT NULL,
    media_purged INTEGER NOT NULL DEFAULT 0,
    payload_json TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS investigation_findings (
    finding_id TEXT NOT NULL,
    investigation_id TEXT NOT NULL,
    modality TEXT NOT NULL,
    severity TEXT NOT NULL,
    indicator_title TEXT NOT NULL,
    confidence_score REAL NOT NULL,
    timestamp_sec REAL,
    review_status TEXT NOT NULL,
    source_id TEXT NOT NULL,
    PRIMARY KEY (investigation_id, finding_id)
  );
`);

export function computeSummaryMetrics(report: InvestigationReport) {
  const suspiciousCount = report.findings.filter(
    (f) => f.severity === 'high' || f.severity === 'moderate'
  ).length;
  const needsReviewCount = report.findings.filter(
    (f) => f.review_status === 'unreviewed' || f.review_status === 'secondary_review' || f.severity === 'review'
  ).length;
  const confirmedCount = report.findings.filter((f) => f.review_status === 'confirmed').length;
  const primaryFilename = report.sources[0]?.originalName || 'Unnamed Evidence';

  return {
    primaryFilename,
    suspiciousCount,
    needsReviewCount,
    confirmedCount,
  };
}

export function saveInvestigation(report: InvestigationReport): void {
  const metrics = computeSummaryMetrics(report);
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO investigations (
      investigation_id, title, mode, created_at, primary_filename,
      source_count, assessment_category, overall_indicator_index,
      suspicious_count, needs_review_count, confirmed_count,
      report_sha256, media_purged, payload_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    report.investigation_id,
    report.title,
    report.mode,
    report.created_at,
    metrics.primaryFilename,
    report.sources.length,
    report.confidence.assessment_category,
    report.confidence.overall_indicator_index,
    metrics.suspiciousCount,
    metrics.needsReviewCount,
    metrics.confirmedCount,
    report.trust_passport.report_sha256,
    report.media_purged ? 1 : 0,
    JSON.stringify(report)
  );

  db.prepare('DELETE FROM investigation_findings WHERE investigation_id = ?').run(report.investigation_id);
  const findingStmt = db.prepare(`
    INSERT OR REPLACE INTO investigation_findings (
      finding_id, investigation_id, modality, severity, indicator_title,
      confidence_score, timestamp_sec, review_status, source_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const f of report.findings) {
    findingStmt.run(
      f.finding_id,
      report.investigation_id,
      f.modality,
      f.severity,
      f.indicator_title,
      f.evidence_confidence,
      f.timestamp,
      f.review_status,
      f.source_id
    );
  }
}

export function getInvestigationById(investigationId: string): InvestigationReport | null {
  const row = db
    .prepare('SELECT payload_json FROM investigations WHERE investigation_id = ?')
    .get(investigationId) as { payload_json: string } | undefined;
  if (!row) return null;
  return JSON.parse(row.payload_json) as InvestigationReport;
}

export function listInvestigations(): InvestigationSummary[] {
  const rows = db
    .prepare(`
      SELECT investigation_id, title, mode, created_at, primary_filename,
             source_count, assessment_category, overall_indicator_index,
             suspicious_count, needs_review_count, confirmed_count,
             report_sha256, media_purged
      FROM investigations
      ORDER BY created_at DESC
    `)
    .all() as Array<Record<string, unknown>>;

  return rows.map((r) => ({
    investigation_id: String(r.investigation_id),
    title: String(r.title),
    mode: r.mode === 'demo' ? 'demo' : 'live',
    created_at: String(r.created_at),
    primary_filename: String(r.primary_filename),
    source_count: Number(r.source_count),
    assessment_category: r.assessment_category as InvestigationSummary['assessment_category'],
    overall_indicator_index: r.overall_indicator_index === null ? null : Number(r.overall_indicator_index),
    suspicious_count: Number(r.suspicious_count),
    needs_review_count: Number(r.needs_review_count),
    confirmed_count: Number(r.confirmed_count),
    report_sha256: String(r.report_sha256),
    media_purged: Boolean(r.media_purged),
  }));
}

export function getDashboardStats(): DashboardStats {
  const all = listInvestigations();
  const totalFiles = all.reduce((acc, inv) => acc + inv.source_count, 0);
  const suspiciousFiles = all.filter((inv) => inv.suspicious_count > 0).length;
  const requiringReview = all.filter((inv) => inv.needs_review_count > 0).length;

  return {
    total_files_analyzed: totalFiles,
    suspicious_files_flagged: suspiciousFiles,
    analyses_requiring_review: requiringReview,
    completed_investigations: all.length,
    recent_investigations: all.slice(0, 8),
  };
}

export function updateFindingReview(
  investigationId: string,
  findingId: string,
  reviewStatus: ReviewStatus,
  investigatorNotes: string
): InvestigationReport | null {
  const report = getInvestigationById(investigationId);
  if (!report) return null;

  const target = report.findings.find((f) => f.finding_id === findingId);
  if (!target) return null;

  target.review_status = reviewStatus;
  target.investigator_notes = investigatorNotes;

  saveInvestigation(report);
  return report;
}

export function purgeInvestigationMedia(investigationId: string): InvestigationReport | null {
  const report = getInvestigationById(investigationId);
  if (!report) return null;

  const dir = path.join(ARTIFACTS_DIR, investigationId);
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }

  report.media_purged = true;
  report.retain_media = false;
  report.sources = report.sources.map((s) => ({
    ...s,
    artifactUrl: null,
    elaUrl: null,
  }));
  report.frames = report.frames.map((fr) => ({
    ...fr,
    imageUrl: '',
    elaImageUrl: null,
  }));

  saveInvestigation(report);
  return report;
}

export function deleteInvestigation(investigationId: string): boolean {
  const dir = path.join(ARTIFACTS_DIR, investigationId);
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  db.prepare('DELETE FROM investigation_findings WHERE investigation_id = ?').run(investigationId);
  const result = db.prepare('DELETE FROM investigations WHERE investigation_id = ?').run(investigationId);
  return result.changes > 0;
}
