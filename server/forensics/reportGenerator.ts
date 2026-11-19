import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { ARTIFACTS_DIR, DETECTOR_VERSIONS, FORENSIC_DISCLAIMER, ROOT_DIR } from '../config.ts';
import type { InvestigationReport, SeverityLevel, TrustPassport } from '../../src/types/forensics.ts';

export function computeReportSha256(reportWithoutHash: Omit<InvestigationReport, 'trust_passport'> & {
  trust_passport: Omit<TrustPassport, 'report_sha256' | 'qr_data_url'>;
}): string {
  const canonical = JSON.stringify({
    investigation_id: reportWithoutHash.investigation_id,
    mode: reportWithoutHash.mode,
    created_at: reportWithoutHash.created_at,
    sources: reportWithoutHash.sources.map((s) => ({ id: s.source_id, sha256: s.sha256 })),
    findings: reportWithoutHash.findings.map((f) => ({
      id: f.finding_id,
      source_id: f.source_id,
      severity: f.severity,
      timestamp: f.timestamp,
      review_status: f.review_status,
      investigator_notes: f.investigator_notes,
    })),
    confidence: reportWithoutHash.confidence,
    detector_versions: reportWithoutHash.trust_passport.detector_versions,
  });
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

export async function buildTrustPassport(params: {
  investigationId: string;
  analysisTimestamp: string;
  sourceHashes: Array<{ source_id: string; filename: string; sha256: string }>;
  appBaseUrl: string;
  canonicalBodyForHash: unknown;
}): Promise<TrustPassport> {
  const { investigationId, analysisTimestamp, sourceHashes, appBaseUrl, canonicalBodyForHash } = params;
  const reportSha256 = crypto
    .createHash('sha256')
    .update(JSON.stringify(canonicalBodyForHash))
    .digest('hex');

  const verificationUrl = `${appBaseUrl.replace(/\/$/, '')}/?verify=${encodeURIComponent(investigationId)}&hash=${reportSha256.slice(0, 16)}`;
  const qrDataUrl = await QRCode.toDataURL(verificationUrl, {
    width: 180,
    margin: 1,
    color: { dark: '#0B1120', light: '#FFFFFF' },
  });

  return {
    investigation_id: investigationId,
    report_sha256: reportSha256,
    analysis_timestamp: analysisTimestamp,
    source_hashes: sourceHashes,
    detector_versions: DETECTOR_VERSIONS,
    verification_url: verificationUrl,
    qr_data_url: qrDataUrl,
    integrity_vs_authenticity_note:
      'Trust Passport cryptographically verifies REPORT INTEGRITY (that this forensic record matches its exported hash and source digests). It does NOT certify the real-world authenticity of the underlying media.',
  };
}

const SEVERITY_COLORS: Record<SeverityLevel, { hex: string; label: string }> = {
  high: { hex: '#DC2626', label: 'RED — High-Priority Suspicious Indicator' },
  moderate: { hex: '#EA580C', label: 'ORANGE — Moderate Concern' },
  review: { hex: '#CA8A04', label: 'YELLOW — Needs Further Review' },
  nominal: { hex: '#16A34A', label: 'GREEN — No Significant Indicator' },
};

function resolveLocalAssetPath(urlPath: string | null | undefined): string | null {
  if (!urlPath) return null;
  if (urlPath.startsWith('/artifacts/')) {
    const p = path.join(ARTIFACTS_DIR, urlPath.replace(/^\/artifacts\//, ''));
    return fs.existsSync(p) ? p : null;
  }
  if (urlPath.startsWith('/src/assets/')) {
    const p = path.join(ROOT_DIR, urlPath.slice(1));
    return fs.existsSync(p) ? p : null;
  }
  return null;
}

export async function generateForensicPdfBuffer(report: InvestigationReport): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 44,
      info: {
        Title: `TruthLens Forensic Report — ${report.investigation_id}`,
        Author: 'TruthLens Digital Forensics Platform',
        Subject: report.confidence.assessment_category,
      },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageW = doc.page.width - 88;

    const ensureSpace = (needed = 90) => {
      if (doc.y + needed > doc.page.height - 60) {
        doc.addPage();
      }
    };

    const sectionTitle = (title: string) => {
      ensureSpace(50);
      doc.moveDown(0.7);
      doc.font('Helvetica-Bold').fontSize(12).fillColor('#1E3A8A').text(title);
      doc.moveTo(44, doc.y + 2).lineTo(44 + pageW, doc.y + 2).strokeColor('#CBD5E1').lineWidth(0.75).stroke();
      doc.moveDown(0.5);
      doc.fillColor('#0F172A').font('Helvetica').fontSize(9.5);
    };

    // 1. Header Banner
    doc.rect(44, 40, pageW, 64).fill('#0B1120');
    doc.font('Helvetica-Bold').fontSize(18).fillColor('#FFFFFF').text('TRUTHLENS — FORENSIC REPORT', 58, 54);
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor('#93C5FD')
      .text('See Beyond the Surface. Verify What You Trust.', 58, 77);
    doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .fillColor(report.mode === 'demo' ? '#FBBF24' : '#34D399')
      .text(report.mode === 'demo' ? 'REFERENCE SHOWCASE' : 'LIVE FORENSIC ANALYSIS', 44 + pageW - 140, 62, {
        width: 126,
        align: 'right',
      });

    doc.y = 118;
    doc.fillColor('#0F172A').font('Helvetica').fontSize(9.5);

    // 2. Investigation ID & Trust Passport QR
    const startY = doc.y;
    doc.font('Helvetica-Bold').text('Investigation ID: ', { continued: true }).font('Helvetica').text(report.investigation_id);
    doc.font('Helvetica-Bold').text('Title: ', { continued: true }).font('Helvetica').text(report.title);
    doc.font('Helvetica-Bold').text('Analysis Timestamp: ', { continued: true }).font('Helvetica').text(report.created_at);
    doc.font('Helvetica-Bold').text('Primary Model: ', { continued: true }).font('Helvetica').text(report.model_telemetry.model_used);
    doc.font('Helvetica-Bold').text('Report SHA-256: ', { continued: true }).font('Helvetica').fontSize(8).text(report.trust_passport.report_sha256);

    if (report.trust_passport.qr_data_url) {
      try {
        const b64 = report.trust_passport.qr_data_url.split(',')[1];
        if (b64) {
          doc.image(Buffer.from(b64, 'base64'), 44 + pageW - 76, startY - 4, { width: 72 });
        }
      } catch {
        // ignore QR embed issue
      }
    }
    doc.y = Math.max(doc.y, startY + 74);

    // 3. Overall Assessment Box
    doc.moveDown(0.5);
    const assessColor =
      report.confidence.assessment_category.startsWith('Multiple')
        ? '#FEF2F2'
        : report.confidence.assessment_category.startsWith('Potential')
          ? '#FFF7ED'
          : report.confidence.assessment_category.startsWith('Inconclusive')
            ? '#FEFCE8'
            : '#F0FDF4';
    const assessBorder =
      report.confidence.assessment_category.startsWith('Multiple')
        ? '#DC2626'
        : report.confidence.assessment_category.startsWith('Potential')
          ? '#EA580C'
          : report.confidence.assessment_category.startsWith('Inconclusive')
            ? '#CA8A04'
            : '#16A34A';

    doc.rect(44, doc.y, pageW, 54).fillAndStroke(assessColor, assessBorder);
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#0F172A').text(
      `Overall Assessment: ${report.confidence.assessment_category}`,
      54,
      doc.y + 10,
      { width: pageW - 20 }
    );
    doc
      .font('Helvetica')
      .fontSize(8.5)
      .fillColor('#334155')
      .text(
        `Indicator Index: ${report.confidence.overall_indicator_index ?? 'N/A'}/100  |  Evidence Completeness: ${report.confidence.evidence_completeness_pct}%  |  ${report.confidence.epistemic_notice}`,
        54,
        doc.y + 4,
        { width: pageW - 20 }
      );
    doc.y += 18;

    // 4. Uploaded Files & Metadata
    sectionTitle('1. Uploaded Evidence & Media Metadata');
    for (const src of report.sources) {
      ensureSpace(65);
      doc.font('Helvetica-Bold').text(`${src.source_id} — ${src.originalName} (${src.kind.toUpperCase()})`);
      doc.font('Helvetica').fontSize(8.5).fillColor('#334155');
      doc.text(`SHA-256: ${src.sha256}`);
      doc.text(
        `Format: ${src.metadata.formatName} | Size: ${(src.sizeBytes / 1024).toFixed(1)} KB | Duration: ${src.metadata.durationSec ?? 'N/A'}s | Resolution: ${src.metadata.width && src.metadata.height ? `${src.metadata.width}x${src.metadata.height}` : 'N/A'} | FPS: ${src.metadata.frameRate ?? 'N/A'} | Sample Rate: ${src.metadata.audioSampleRate ?? 'N/A'} Hz`
      );
      doc.text(
        `Codecs: Video=${src.metadata.videoCodec ?? 'N/A'}, Audio=${src.metadata.audioCodec ?? 'N/A'} | Creation Time: ${src.metadata.creationTime ?? 'Absent'} | Encoder: ${src.metadata.encoderTag ?? 'Absent'}`
      );
      if (src.metadata.anomalies.length > 0) {
        doc.fillColor('#B45309').text(`Metadata Notes: ${src.metadata.anomalies.join(' ')}`);
      }
      doc.fillColor('#0F172A').fontSize(9.5).moveDown(0.3);
    }

    // 5. Confidence & Uncertainty Breakdown
    sectionTitle('2. Confidence & Uncertainty Engine');
    const modalities = [
      ['Visual Analysis', report.confidence.visual],
      ['Audio Analysis', report.confidence.audio],
      ['Textual / Contextual', report.confidence.textual],
      ['Cross-Modal Correlation', report.confidence.cross_modal],
    ] as const;

    for (const [label, detail] of modalities) {
      ensureSpace(28);
      doc
        .font('Helvetica-Bold')
        .text(`${label}: `, { continued: true })
        .font('Helvetica')
        .text(`${detail.score !== null ? `${detail.score}/100` : 'Unavailable'} (status: ${detail.status})`);
      if (detail.contributing_signals.length > 0) {
        doc.fontSize(8.5).fillColor('#475569').text(`   Signals: ${detail.contributing_signals.join('; ')}`);
        doc.fontSize(9.5).fillColor('#0F172A');
      }
    }
    doc.moveDown(0.3);
    doc.fontSize(8.5).fillColor('#334155').text(`Methodology: ${report.confidence.methodology_notes}`);
    if (report.confidence.unavailable_signals.length > 0) {
      doc.text(`Unavailable Signals: ${report.confidence.unavailable_signals.join('; ')}`);
    }
    doc.fillColor('#0F172A').fontSize(9.5);

    // 6. Color-Coded Forensic Findings & Investigator Review
    sectionTitle('3. Grounded Forensic Findings & Review Status');
    if (report.findings.length === 0) {
      doc.text('No suspicious indicators flagged across available modalities.');
    }
    for (const f of report.findings) {
      ensureSpace(95);
      const sevMeta = SEVERITY_COLORS[f.severity] || SEVERITY_COLORS.review;
      doc.font('Helvetica-Bold').fillColor(sevMeta.hex).text(`[${sevMeta.label}]`);
      doc
        .fillColor('#0F172A')
        .text(`${f.finding_id} — ${f.indicator_title} (${f.modality.toUpperCase()} | Source: ${f.source_id}${f.timestamp !== null ? ` @ ${f.timestamp}s` : ''})`);
      doc.font('Helvetica').fontSize(9).fillColor('#1E293B');
      doc.text(`Observed Signal: ${f.observed_signal}`);
      doc.text(`Explanation: ${f.forensic_explanation}`);
      doc.text(`Plausible Benign Causes: ${f.counter_evidence.benign_explanations.join(' ')}`);
      doc
        .font('Helvetica-Bold')
        .fontSize(8.5)
        .fillColor('#1E3A8A')
        .text(
          `Investigator Review: ${f.review_status.toUpperCase()} | Confidence: ${Math.round(f.evidence_confidence * 100)}%${f.investigator_notes ? ` | Notes: ${f.investigator_notes}` : ''}`
        );
      doc.fillColor('#0F172A').font('Helvetica').fontSize(9.5).moveDown(0.4);
    }

    // 7. Cross-Modal, Contextual & Debate Room Summary
    sectionTitle('4. Cross-Modal Correlation & Contextual Review');
    doc.text(
      `A/V Synchronization: ${report.cross_modal.av_sync_status} | Caption-Audio Alignment: ${report.cross_modal.caption_audio_status} | Temporal Continuity: ${report.cross_modal.temporal_continuity_status}`
    );
    doc.moveDown(0.3);
    doc.font('Helvetica-Bold').text('Executive Narrative:');
    doc.font('Helvetica').text(report.narrative.executive_summary);
    doc.moveDown(0.3);
    doc.font('Helvetica-Bold').text('Forensic Debate Room Adjudication:');
    doc.font('Helvetica').text(report.debate_room.adjudicator.balanced_summary);

    // 8. Suspicious Timeline
    sectionTitle('5. Suspicious Observation Timeline');
    const timed = report.findings
      .filter((f) => f.timestamp !== null)
      .sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));
    if (timed.length === 0) {
      doc.text('No timestamp-bound observations recorded.');
    } else {
      for (const t of timed) {
        ensureSpace(26);
        doc.text(
          `${(t.timestamp ?? 0).toFixed(2)}s | ${t.modality.toUpperCase()} | ${t.severity.toUpperCase()} | ${t.indicator_title} (${t.finding_id})`
        );
      }
    }

    // 9. Evidence Screenshots
    const thumbCandidates = report.frames.slice(0, 4);
    if (thumbCandidates.length > 0) {
      sectionTitle('6. Extracted Evidence Frame Thumbnails');
      let col = 0;
      let rowY = doc.y;
      for (const fr of thumbCandidates) {
        const imgPath = resolveLocalAssetPath(fr.imageUrl);
        if (!imgPath) continue;
        if (col === 0) ensureSpace(135);
        rowY = col === 0 ? doc.y : rowY;
        const x = 44 + col * (pageW / 2 + 8);
        try {
          doc.image(imgPath, x, rowY, { width: pageW / 2 - 12, height: 105, fit: [pageW / 2 - 12, 105] });
          doc
            .fontSize(8)
            .fillColor('#475569')
            .text(`Frame #${fr.frameNumber} @ ${fr.timestampSec}s (delta ${fr.frameDeltaScore})`, x, rowY + 108, {
              width: pageW / 2 - 12,
            });
        } catch {
          // ignore unreadable image
        }
        col++;
        if (col === 2) {
          col = 0;
          doc.y = rowY + 128;
        }
      }
      if (col === 1) doc.y = rowY + 128;
      doc.fillColor('#0F172A').fontSize(9.5);
    }

    // 10. Technical Limitations, Verification Steps & Trust Passport Disclaimer
    sectionTitle('7. Technical Limitations & Recommended Human Verification');
    for (const step of report.narrative.recommended_verification_steps) {
      ensureSpace(20);
      doc.text(`• ${step}`);
    }
    doc.moveDown(0.3);
    for (const lim of report.narrative.technical_limitations) {
      ensureSpace(20);
      doc.fontSize(8.5).fillColor('#475569').text(`• ${lim}`);
    }

    ensureSpace(80);
    doc.moveDown(0.6);
    doc.rect(44, doc.y, pageW, 52).fillAndStroke('#F8FAFC', '#94A3B8');
    doc
      .font('Helvetica-Bold')
      .fontSize(8.5)
      .fillColor('#0F172A')
      .text('MANDATORY FORENSIC DISCLAIMER', 54, doc.y + 8);
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor('#334155')
      .text(FORENSIC_DISCLAIMER, 54, doc.y + 2, { width: pageW - 20 });

    doc.end();
  });
}
