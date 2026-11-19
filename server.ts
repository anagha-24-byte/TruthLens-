import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import {
  ALLOWED_EXTENSIONS,
  ARTIFACTS_DIR,
  DETECTOR_VERSIONS,
  FORENSIC_DISCLAIMER,
  MAX_FILE_SIZE_BYTES,
  MAX_FILES_PER_ANALYSIS,
  SAMPLE_DIR,
  TEMP_DIR,
  sanitizeFilename,
} from './server/config.ts';
import { GeminiForensicError, verifyGeminiConfigStatus } from './server/geminiClient.ts';
import {
  getSessionByToken,
  loginInvestigator,
  logoutSession,
  registerInvestigator,
} from './server/database/auth.ts';
import {
  deleteInvestigation,
  getDashboardStats,
  getInvestigationById,
  listInvestigations,
  purgeInvestigationMedia,
  saveInvestigation,
  updateFindingReview,
} from './server/database/history.ts';
import { getDatabaseTablesSnapshot } from './server/database/inspector.ts';
import { computeFileSha256, extractMediaMetadata } from './server/forensics/metadataAnalysis.ts';
import { extractVideoFramesAndAudio, generateElaHeatmap } from './server/forensics/videoProcessing.ts';
import { analyzeAudioTrack } from './server/forensics/audioForensics.ts';
import { runMultimodalForensicReasoning } from './server/forensics/multimodalReasoner.ts';
import { validateAndGroundFindings } from './server/forensics/groundingValidator.ts';
import { calculateConfidenceAndAssessment } from './server/forensics/confidenceEngine.ts';
import { buildTrustPassport, generateForensicPdfBuffer } from './server/forensics/reportGenerator.ts';
import { createOfflineDemoReport, ensureSyntheticSampleDataset } from './server/forensics/demoAndSamples.ts';
import type {
  AudioDspSummary,
  ExtractedFrame,
  InvestigationReport,
  SourceFileRecord,
  UserContextClaims,
} from './src/types/forensics.ts';

const upload = multer({
  dest: TEMP_DIR,
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
    files: MAX_FILES_PER_ANALYSIS,
  },
});

function getBaseUrl(req: express.Request): string {
  if (process.env.APP_URL && process.env.APP_URL !== 'MY_APP_URL') {
    return process.env.APP_URL;
  }
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const host = req.headers['x-forwarded-host'] || req.get('host') || 'localhost:3000';
  return `${proto}://${host}`;
}

async function startServer() {
  await ensureSyntheticSampleDataset();

  const app = express();
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization');
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });
  app.use(express.json({ limit: '4mb' }));

  // Serve locally retained forensic artifacts & synthetic test kit safely
  app.use('/artifacts', express.static(ARTIFACTS_DIR, { fallthrough: false }));
  app.use('/sample-dataset', express.static(SAMPLE_DIR, { fallthrough: false }));

  // Health & Config Check (never exposes GEMINI_API_KEY)
  app.get('/api/health', async (_req, res) => {
    const geminiStatus = await verifyGeminiConfigStatus();
    const sampleFiles = fs.existsSync(SAMPLE_DIR)
      ? fs.readdirSync(SAMPLE_DIR).map((name) => ({
          name,
          url: `/sample-dataset/${name}`,
          sizeBytes: fs.statSync(path.join(SAMPLE_DIR, name)).size,
        }))
      : [];
    res.json({
      status: 'ok',
      gemini: geminiStatus,
      limits: {
        maxFileSizeBytes: MAX_FILE_SIZE_BYTES,
        maxFiles: MAX_FILES_PER_ANALYSIS,
        allowedExtensions: Object.keys(ALLOWED_EXTENSIONS),
      },
      sampleFiles,
    });
  });

  // Investigator Authentication & Submitted Session Context
  app.post('/api/auth/login', (req, res) => {
    const { email, password, submittedContext } = req.body || {};
    const result = loginInvestigator({
      email: String(email || ''),
      password: String(password || ''),
      submittedContext: {
        caseUnit: String(submittedContext?.caseUnit || '').trim(),
        caseReference: String(submittedContext?.caseReference || '').trim(),
        intakeNote: String(submittedContext?.intakeNote || '').trim(),
      },
    });
    if (!result.ok) {
      res.status(401).json({ error: result.error });
      return;
    }
    res.json(result.session);
  });

  app.post('/api/auth/register', (req, res) => {
    const { email, password, fullName, organization, roleTitle, submittedContext } = req.body || {};
    const result = registerInvestigator({
      email: String(email || ''),
      password: String(password || ''),
      fullName: String(fullName || ''),
      organization: String(organization || ''),
      roleTitle: String(roleTitle || ''),
      submittedContext: {
        caseUnit: String(submittedContext?.caseUnit || '').trim(),
        caseReference: String(submittedContext?.caseReference || '').trim(),
        intakeNote: String(submittedContext?.intakeNote || '').trim(),
      },
    });
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.status(201).json(result.session);
  });

  app.get('/api/auth/session', (req, res) => {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    const session = getSessionByToken(token);
    if (!session) {
      res.status(401).json({ error: 'Session expired or invalid.' });
      return;
    }
    res.json(session);
  });

  app.post('/api/auth/logout', (req, res) => {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    logoutSession(token);
    res.json({ ok: true });
  });

  app.get('/api/sample-dataset', (_req, res) => {
    const files = fs.existsSync(SAMPLE_DIR)
      ? fs.readdirSync(SAMPLE_DIR).map((name) => ({
          name,
          url: `/sample-dataset/${name}`,
          sizeBytes: fs.statSync(path.join(SAMPLE_DIR, name)).size,
        }))
      : [];
    res.json({ files });
  });

  app.get('/api/dashboard', (_req, res) => {
    res.json(getDashboardStats());
  });

  app.get('/api/investigations', (_req, res) => {
    res.json({ investigations: listInvestigations() });
  });

  app.get('/api/database/tables', (req, res) => {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    const session = getSessionByToken(token);
    if (!session) {
      res.status(401).json({ error: 'Authentication required to inspect database tables.' });
      return;
    }
    res.json(getDatabaseTablesSnapshot());
  });

  app.get('/api/investigations/:id', (req, res) => {
    const inv = getInvestigationById(req.params.id);
    if (!inv) {
      res.status(404).json({ error: 'Investigation not found.' });
      return;
    }
    res.json(inv);
  });

  app.post('/api/investigations/restore', (req, res) => {
    const candidate = req.body as Partial<InvestigationReport> | undefined;
    if (
      !candidate ||
      typeof candidate.investigation_id !== 'string' ||
      !candidate.investigation_id.trim() ||
      typeof candidate.title !== 'string' ||
      !Array.isArray(candidate.sources) ||
      !Array.isArray(candidate.findings) ||
      !candidate.confidence ||
      !candidate.trust_passport
    ) {
      res.status(400).json({ error: 'Invalid investigation payload for restore.' });
      return;
    }

    const existing = getInvestigationById(candidate.investigation_id);
    if (existing) {
      res.json(existing);
      return;
    }

    saveInvestigation(candidate as InvestigationReport);
    res.status(201).json(candidate);
  });

  app.delete('/api/investigations/:id', (req, res) => {
    const ok = deleteInvestigation(req.params.id);
    if (!ok) {
      res.status(404).json({ error: 'Investigation not found.' });
      return;
    }
    res.json({ deleted: true });
  });

  app.post('/api/investigations/:id/purge-media', (req, res) => {
    const updated = purgeInvestigationMedia(req.params.id);
    if (!updated) {
      res.status(404).json({ error: 'Investigation not found.' });
      return;
    }
    res.json(updated);
  });

  app.patch('/api/investigations/:id/findings/:findingId/review', async (req, res) => {
    const { review_status, investigator_notes } = req.body || {};
    const validStatuses = ['unreviewed', 'confirmed', 'benign', 'secondary_review'];
    if (!validStatuses.includes(review_status)) {
      res.status(400).json({ error: 'Invalid review_status value.' });
      return;
    }

    const updated = updateFindingReview(
      req.params.id,
      req.params.findingId,
      review_status,
      String(investigator_notes || '')
    );
    if (!updated) {
      res.status(404).json({ error: 'Investigation or finding not found.' });
      return;
    }

    // Recompute ConfidenceEngine & Trust Passport SHA-256 to reflect investigator review state
    updated.confidence = calculateConfidenceAndAssessment({
      sources: updated.sources,
      findings: updated.findings,
      hasVisualEvidence: updated.sources.some((s) => s.kind === 'image' || s.kind === 'video'),
      hasAudioEvidence: updated.audio_analyses.length > 0,
      hasTextContextEvidence:
        updated.sources.some((s) => s.kind === 'text') ||
        Object.values(updated.user_context).some((v) => Boolean(v?.trim())),
      crossModal: updated.cross_modal,
    });

    updated.trust_passport = await buildTrustPassport({
      investigationId: updated.investigation_id,
      analysisTimestamp: updated.created_at,
      sourceHashes: updated.sources.map((s) => ({
        source_id: s.source_id,
        filename: s.originalName,
        sha256: s.sha256,
      })),
      appBaseUrl: getBaseUrl(req),
      canonicalBodyForHash: {
        investigation_id: updated.investigation_id,
        mode: updated.mode,
        created_at: updated.created_at,
        sources: updated.sources.map((s) => ({ id: s.source_id, sha256: s.sha256 })),
        findings: updated.findings.map((f) => ({
          id: f.finding_id,
          severity: f.severity,
          review_status: f.review_status,
          investigator_notes: f.investigator_notes,
        })),
        detector_versions: DETECTOR_VERSIONS,
      },
    });

    saveInvestigation(updated);
    res.json(updated);
  });

  app.get('/api/investigations/:id/export/json', (req, res) => {
    const inv = getInvestigationById(req.params.id);
    if (!inv) {
      res.status(404).json({ error: 'Investigation not found.' });
      return;
    }
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="TruthLens_${inv.investigation_id}.json"`);
    res.send(JSON.stringify(inv, null, 2));
  });

  app.get('/api/investigations/:id/export/pdf', async (req, res) => {
    const inv = getInvestigationById(req.params.id);
    if (!inv) {
      res.status(404).json({ error: 'Investigation not found.' });
      return;
    }
    try {
      const pdfBuf = await generateForensicPdfBuffer(inv);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="TruthLens_${inv.investigation_id}.pdf"`);
      res.send(pdfBuf);
    } catch (err) {
      res.status(500).json({ error: `PDF export failed: ${String((err as Error)?.message || err)}` });
    }
  });

  app.get('/api/verify/:id', (req, res) => {
    const inv = getInvestigationById(req.params.id);
    if (!inv) {
      res.status(404).json({ verified: false, error: 'Investigation ID not found in local registry.' });
      return;
    }
    const providedPrefix = String(req.query.hash || '').trim().toLowerCase();
    const fullHash = inv.trust_passport.report_sha256.toLowerCase();
    const hashMatches = !providedPrefix || fullHash.startsWith(providedPrefix);

    res.json({
      verified: hashMatches,
      investigation_id: inv.investigation_id,
      title: inv.title,
      mode: inv.mode,
      created_at: inv.created_at,
      report_sha256: inv.trust_passport.report_sha256,
      provided_hash_prefix: providedPrefix || null,
      source_hashes: inv.trust_passport.source_hashes,
      detector_versions: inv.trust_passport.detector_versions,
      integrity_vs_authenticity_note: inv.trust_passport.integrity_vs_authenticity_note,
    });
  });

  app.post('/api/demo', async (req, res) => {
    try {
      const demoReport = await createOfflineDemoReport(getBaseUrl(req));
      saveInvestigation(demoReport);
      res.json(demoReport);
    } catch (err) {
      res.status(500).json({ error: String((err as Error)?.message || err) });
    }
  });

  // Main Multimodal Forensic Analysis Endpoint
  app.post('/api/analyze', upload.array('files', MAX_FILES_PER_ANALYSIS), async (req, res) => {
    const uploadedFiles = (req.files as Express.Multer.File[] | undefined) || [];
    const investigationId = `TL-${Date.now().toString(36).toUpperCase()}-${Math.random()
      .toString(36)
      .slice(2, 6)
      .toUpperCase()}`;
    const invArtifactsDir = path.join(ARTIFACTS_DIR, investigationId);
    const createdAt = new Date().toISOString();
    const tempFilesToCleanup: string[] = uploadedFiles.map((f) => f.path);

    try {
      const consent = req.body?.consent === 'true' || req.body?.consent === true;
      if (!consent) {
        res.status(400).json({ error: 'Explicit user consent is required before processing media.' });
        return;
      }

      const retainMedia = req.body?.retainMedia !== 'false';
      const userContext: UserContextClaims = {
        caption: String(req.body?.caption || '').trim(),
        claimedSpeaker: String(req.body?.claimedSpeaker || '').trim(),
        claimedLocation: String(req.body?.claimedLocation || '').trim(),
        claimedEvent: String(req.body?.claimedEvent || '').trim(),
        sourceDescription: String(req.body?.sourceDescription || '').trim(),
      };

      const hasAnyContextText = Object.values(userContext).some(Boolean);
      if (uploadedFiles.length === 0 && !hasAnyContextText) {
        res.status(400).json({ error: 'Please upload at least one media/text file or supply contextual claims.' });
        return;
      }

      // Validate file types strictly
      for (const file of uploadedFiles) {
        const ext = path.extname(file.originalname).toLowerCase();
        if (!ALLOWED_EXTENSIONS[ext]) {
          res.status(400).json({
            error: `Unsupported file type "${ext}" on "${file.originalname}". Allowed: ${Object.keys(
              ALLOWED_EXTENSIONS
            ).join(', ')}`,
          });
          return;
        }
      }

      fs.mkdirSync(invArtifactsDir, { recursive: true });
      const sourcesDir = path.join(invArtifactsDir, 'sources');
      fs.mkdirSync(sourcesDir, { recursive: true });

      const sources: SourceFileRecord[] = [];
      const frames: ExtractedFrame[] = [];
      const audioAnalyses: AudioDspSummary[] = [];
      const warnings: string[] = [];
      let transcribeModelUsed: string | null = null;

      for (let idx = 0; idx < uploadedFiles.length; idx++) {
        const file = uploadedFiles[idx];
        const ext = path.extname(file.originalname).toLowerCase();
        const kind = ALLOWED_EXTENSIONS[ext];
        const sourceId = `src_${String(idx + 1).padStart(2, '0')}`;
        const safeName = sanitizeFilename(file.originalname);
        const storedPath = path.join(sourcesDir, `${sourceId}_${safeName}`);

        fs.copyFileSync(file.path, storedPath);

        const sha256 = computeFileSha256(storedPath);
        const metadata = await extractMediaMetadata(storedPath, kind, file.size);

        let artifactUrl: string | null = `/artifacts/${investigationId}/sources/${sourceId}_${safeName}`;
        let elaUrl: string | null = null;
        let textExcerpt: string | null = null;

        if (kind === 'image') {
          const elaOutPath = path.join(sourcesDir, `${sourceId}_ela.jpg`);
          const elaOk = await generateElaHeatmap(storedPath, elaOutPath);
          if (elaOk) {
            elaUrl = `/artifacts/${investigationId}/sources/${sourceId}_ela.jpg`;
          }
        } else if (kind === 'video') {
          const videoRes = await extractVideoFramesAndAudio({
            videoPath: storedPath,
            sourceId,
            investigationId,
            durationSec: metadata.durationSec,
            artifactsDir: ARTIFACTS_DIR,
            tempDir: TEMP_DIR,
            maxFrames: 10,
          });
          frames.push(...videoRes.frames);

          if (videoRes.extractedAudioWavPath) {
            tempFilesToCleanup.push(videoRes.extractedAudioWavPath);
            const audioRes = await analyzeAudioTrack({
              audioInputPath: videoRes.extractedAudioWavPath,
              sourceId,
              tempDir: TEMP_DIR,
              mimeType: 'audio/wav',
            });
            audioAnalyses.push(audioRes.summary);
            if (audioRes.transcribeModelUsed) transcribeModelUsed = audioRes.transcribeModelUsed;
            warnings.push(...audioRes.warnings);
          }
        } else if (kind === 'audio') {
          const audioRes = await analyzeAudioTrack({
            audioInputPath: storedPath,
            sourceId,
            tempDir: TEMP_DIR,
            mimeType: file.mimetype || 'audio/wav',
          });
          audioAnalyses.push(audioRes.summary);
          if (audioRes.transcribeModelUsed) transcribeModelUsed = audioRes.transcribeModelUsed;
          warnings.push(...audioRes.warnings);
        } else if (kind === 'text') {
          if (ext === '.txt') {
            textExcerpt = fs.readFileSync(storedPath, 'utf-8').slice(0, 12000);
          } else {
            textExcerpt = '[PDF Document attached for direct server-side Gemini extraction]';
          }
        }

        sources.push({
          source_id: sourceId,
          originalName: file.originalname,
          safeName,
          kind,
          mimeType: file.mimetype || 'application/octet-stream',
          sizeBytes: file.size,
          sha256,
          artifactUrl,
          elaUrl,
          textExcerpt,
          metadata,
        });
      }

      // Run server-side Gemini multimodal forensic reasoning
      const synthesis = await runMultimodalForensicReasoning({
        sources,
        frames,
        audioAnalyses,
        userContext,
        artifactsDir: ARTIFACTS_DIR,
        investigationId,
      });

      warnings.push(...synthesis.warnings);

      // Strict Evidence Grounding Validation
      const groundedFindings = validateAndGroundFindings({
        rawFindings: synthesis.findings,
        sources,
        frames,
      });

      const hasVisualEvidence = sources.some((s) => s.kind === 'image' || s.kind === 'video');
      const hasAudioEvidence = audioAnalyses.length > 0;
      const hasTextContextEvidence =
        sources.some((s) => s.kind === 'text') || hasAnyContextText;

      const confidence = calculateConfidenceAndAssessment({
        sources,
        findings: groundedFindings,
        hasVisualEvidence,
        hasAudioEvidence,
        hasTextContextEvidence,
        crossModal: synthesis.cross_modal,
      });

      // If user chose NOT to retain original media permanently, remove raw uploaded media copies (keep frames/ELA or purge if requested)
      if (!retainMedia) {
        if (fs.existsSync(sourcesDir)) {
          fs.rmSync(sourcesDir, { recursive: true, force: true });
        }
        for (const s of sources) {
          if (s.kind !== 'text') {
            s.artifactUrl = null;
          }
        }
      }

      const title =
        userContext.claimedEvent ||
        userContext.caption.slice(0, 64) ||
        sources[0]?.originalName ||
        `Investigation ${investigationId}`;

      const partialReport = {
        investigation_id: investigationId,
        title,
        mode: 'live' as const,
        created_at: createdAt,
        retain_media: retainMedia,
        media_purged: !retainMedia,
        model_telemetry: {
          primary_configured: process.env.GEMINI_PRIMARY_MODEL || 'gemini-3.8-flash',
          model_used: synthesis.modelUsed,
          fallback_used: synthesis.fallbackUsed,
          transcribe_model_used: transcribeModelUsed,
          attempts: synthesis.attempts,
          warnings: Array.from(new Set(warnings)),
        },
        user_context: userContext,
        sources,
        frames,
        audio_analyses: audioAnalyses,
        findings: groundedFindings,
        cross_modal: synthesis.cross_modal,
        confidence,
        debate_room: synthesis.debate_room,
        narrative: synthesis.narrative,
        disclaimer: FORENSIC_DISCLAIMER,
      };

      const trust_passport = await buildTrustPassport({
        investigationId,
        analysisTimestamp: createdAt,
        sourceHashes: sources.map((s) => ({
          source_id: s.source_id,
          filename: s.originalName,
          sha256: s.sha256,
        })),
        appBaseUrl: getBaseUrl(req),
        canonicalBodyForHash: {
          investigation_id: partialReport.investigation_id,
          mode: partialReport.mode,
          created_at: partialReport.created_at,
          sources: partialReport.sources.map((s) => ({ id: s.source_id, sha256: s.sha256 })),
          findings: partialReport.findings.map((f) => ({
            id: f.finding_id,
            severity: f.severity,
            timestamp: f.timestamp,
          })),
          detector_versions: DETECTOR_VERSIONS,
        },
      });

      const fullReport: InvestigationReport = {
        ...partialReport,
        trust_passport,
      };

      saveInvestigation(fullReport);
      res.json(fullReport);
    } catch (err) {
      // Clean up partial artifact directory on failure
      if (fs.existsSync(invArtifactsDir)) {
        fs.rmSync(invArtifactsDir, { recursive: true, force: true });
      }

      if (err instanceof GeminiForensicError) {
        res.status(err.statusCode).json({
          error: err.message,
          code: err.code,
          retryAfterSec: err.retryAfterSec,
        });
        return;
      }

      res.status(500).json({
        error: `Forensic pipeline error: ${String((err as Error)?.message || err)}`,
        code: 'PIPELINE_ERROR',
      });
    } finally {
      for (const tmp of tempFilesToCleanup) {
        if (fs.existsSync(tmp)) {
          try {
            fs.unlinkSync(tmp);
          } catch {
            // ignore
          }
        }
      }
    }
  });

  // Multer file-size error handler
  app.use((err: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        res.status(413).json({ error: `File exceeds the ${Math.round(MAX_FILE_SIZE_BYTES / (1024 * 1024))} MB upload limit.` });
        return;
      }
      res.status(400).json({ error: `Upload error: ${err.message}` });
      return;
    }
    next(err);
  });

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const port = Number(process.env.PORT || 3000);
  app.listen(port, '0.0.0.0', () => {
    console.log(`TruthLens AI server listening on http://0.0.0.0:${port}`);
  });
}

startServer();
