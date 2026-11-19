import { motion } from 'motion/react';
import { ArrowRight } from 'lucide-react';

interface LandingPageProps {
  onVisitPortal: () => void;
}

export function LandingPage({ onVisitPortal }: LandingPageProps) {
  return (
    <div className="relative z-10 min-h-screen flex items-center justify-center p-6 sm:p-10">
      {/* Translucent frosted glassmorphism square integrated directly over the 3D radiation waves */}
      <motion.section
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-[440px] sm:aspect-square flex flex-col items-center justify-center rounded-2xl p-8 sm:p-10 text-center bg-white/28 backdrop-blur-2xl border border-white/55 shadow-[0_18px_50px_-14px_rgba(15,23,42,0.12),inset_0_1px_0_rgba(255,255,255,0.65)] space-y-5"
      >
        <div className="flex flex-col items-center gap-3.5">
          <img
            src="/src/assets/images/truthlens_emblem_1795059431139.jpg"
            alt="TruthLens Logo"
            referrerPolicy="no-referrer"
            className="w-20 h-20 rounded-xl object-cover border border-white/80 shadow-md"
          />
          <div className="space-y-1">
            <h1 className="text-4xl sm:text-[42px] font-display font-bold tracking-tight text-slate-950 leading-none">
              TruthLens
            </h1>
            <p className="text-xs sm:text-sm font-semibold text-blue-800 tracking-wide">
              See Beyond the Surface. Verify What You Trust.
            </p>
          </div>
        </div>

        <p className="text-sm sm:text-[15px] font-medium text-slate-800 leading-relaxed max-w-xs mx-auto">
          A multimodal digital forensics platform built to inspect images, video, audio, and contextual media with transparent, explainable evidence.
        </p>

        <div className="pt-1">
          <button
            type="button"
            onClick={onVisitPortal}
            className="inline-flex items-center justify-center gap-2.5 px-8 py-3 text-sm font-semibold bg-slate-900/95 hover:bg-slate-900 text-white rounded-xl shadow-md transition-colors whitespace-nowrap"
          >
            Visit Portal
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </motion.section>
    </div>
  );
}
