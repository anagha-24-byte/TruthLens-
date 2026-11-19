import { AudioWaveform, Cpu, Eye, FileText, GitMerge, ShieldCheck } from 'lucide-react';

export function AboutPage({ onStartNew, onLaunchDemo }: { onStartNew: () => void; onLaunchDemo: () => void }) {
  const agents = [
    {
      icon: Eye,
      title: '01. Visual Forensic Agent',
      body: 'Extracts keyframes via FFmpeg, computes frame-to-frame luminance and pixel deltas, generates real Error Level Analysis (ELA) compression difference heatmaps, and evaluates localized boundary/lighting anomalies with normalized region coordinates.',
    },
    {
      icon: AudioWaveform,
      title: '02. Audio Forensic Agent',
      body: 'Decodes audio to 16kHz mono PCM and runs a Radix-2 FFT + autocorrelation DSP pipeline extracting RMS energy, zero-crossing rate, spectral centroid, spectral bandwidth, 13-band log mel energy, F0 pitch, and digital silence drops alongside timestamped transcription.',
    },
    {
      icon: FileText,
      title: '03. Text & Contextual Agent',
      body: 'Compares spoken transcripts against user-supplied captions, claimed speaker identity, location, event descriptions, and uploaded TXT/PDF documents while strictly treating unverified user claims as hypotheses.',
    },
    {
      icon: GitMerge,
      title: '04. Cross-Modal Correlation Engine',
      body: 'Aligns visual frame deltas, audio noise-floor discontinuities, and semantic caption mismatches along a shared timeline. Unavailable modalities are marked explicitly and never penalized as suspicious.',
    },
  ];

  return (
    <div className="space-y-8 max-w-5xl">
      <section className="forensic-bezel rounded-xl p-6 space-y-3">
        <p className="text-xs font-medium text-blue-700">INNOVEDGE Hackathon 2026 — Track 4</p>
        <h1 className="text-2xl lg:text-3xl font-display font-bold text-slate-900">
          About TruthLens
        </h1>
        <p className="text-sm text-slate-600 leading-relaxed max-w-3xl">
          TruthLens is built around one core principle: never simply tell investigators whether media looks fake—show them exactly what was measured, where it occurred, plausible benign explanations, and what remains uncertain for human verification.
        </p>
        <div className="flex flex-wrap gap-3 pt-2">
          <button
            type="button"
            onClick={onStartNew}
            className="px-4 py-2 text-xs font-medium bg-slate-900 hover:bg-slate-800 text-white rounded-md transition-colors"
          >
            Run Live Analysis
          </button>
          <button
            type="button"
            onClick={onLaunchDemo}
            className="px-4 py-2 text-xs font-medium bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-md transition-colors"
          >
            Inspect Reference Showcase
          </button>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {agents.map((ag) => {
          const Icon = ag.icon;
          return (
            <div key={ag.title} className="forensic-bezel rounded-xl p-5 space-y-2.5">
              <div className="flex items-center gap-2 text-blue-700">
                <Icon className="w-4 h-4 shrink-0" />
                <h2 className="text-sm font-display font-semibold text-slate-900">{ag.title}</h2>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">{ag.body}</p>
            </div>
          );
        })}
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="forensic-bezel rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2 text-slate-900">
            <Cpu className="w-4 h-4 shrink-0 text-blue-700" />
            <h2 className="text-sm font-display font-semibold">
              Deterministic Confidence &amp; Grounding
            </h2>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Confidence scores are calculated deterministically on the server from validated finding weights (Visual 34%, Audio 28%, Textual 18%, Cross-Modal 20% re-normalized over available modalities)—never invented by a language model. Every finding passes a strict grounding validator verifying source IDs, duration-bounded timestamps, and normalized bounding boxes.
          </p>
        </div>

        <div className="forensic-bezel rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2 text-slate-900">
            <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-700" />
            <h2 className="text-sm font-display font-semibold">
              Verification Workflow
            </h2>
          </div>
          <ol className="text-xs text-slate-600 space-y-1.5 list-decimal pl-4 leading-relaxed">
            <li>Open <strong>New Forensic Analysis</strong> and attach your media or click <strong>Attach Sample Case</strong>.</li>
            <li>Start analysis to observe FFmpeg frame/ELA extraction, Radix-2 FFT DSP, and multimodal correlation.</li>
            <li>Inspect the <strong>Counter-Evidence Engine</strong>, <strong>Forensic Debate Room</strong>, and <strong>Evidence DNA Map</strong>.</li>
            <li>Open <strong>Suspicious Timeline</strong> to scrub <strong>Reality Replay</strong> and click finding markers.</li>
            <li>Review investigator controls and export the signed <strong>Forensic PDF</strong> &amp; <strong>Trust Passport</strong>.</li>
          </ol>
        </div>
      </section>

      <section className="forensic-well rounded-xl p-5 space-y-2 text-xs text-slate-600">
        <h2 className="text-sm font-display font-semibold text-slate-900">Known Technical Limitations</h2>
        <ul className="list-disc pl-4 space-y-1 leading-relaxed">
          <li>Social-network re-encoding (Lavf/H.264/AAC) removes original camera sensor metadata and introduces compression artifacts.</li>
          <li>Acoustic DSP metrics alone cannot definitively establish AI voice cloning versus studio noise gates or microphone swaps.</li>
          <li>Absence of detected manipulation indicators does not constitute proof of real-world authenticity.</li>
        </ul>
      </section>
    </div>
  );
}
