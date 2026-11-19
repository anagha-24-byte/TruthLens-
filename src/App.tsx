import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import {
  Clock,
  Database,
  FileCheck2,
  FileSearch,
  History,
  Info,
  LayoutDashboard,
  LogOut,
  Menu,
  ScanEye,
  ShieldAlert,
  X,
} from 'lucide-react';
import { AmbientMotionBackground3D } from './components/AmbientMotionBackground3D';
import { LandingPage } from './pages/LandingPage';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { AnalyzePage } from './pages/AnalyzePage';
import { ResultsPage } from './pages/ResultsPage';
import { TimelinePage } from './pages/TimelinePage';
import { ExplorerPage } from './pages/ExplorerPage';
import { ReportsPage } from './pages/ReportsPage';
import { HistoryPage } from './pages/HistoryPage';
import { DatabasePage } from './pages/DatabasePage';
import { AboutPage } from './pages/AboutPage';
import { maskEmail } from './lib/formatters';
import type {
  AuthSession,
  DashboardStats,
  InvestigationReport,
  InvestigationSummary,
  ReviewStatus,
} from './types/forensics';

type PageId =
  | 'dashboard'
  | 'analyze'
  | 'results'
  | 'timeline'
  | 'explorer'
  | 'reports'
  | 'history'
  | 'database'
  | 'about';

const AUTH_STORAGE_KEY = 'truthlens_session_token';
const ACTIVE_INVESTIGATION_STORAGE_KEY = 'truthlens_active_investigation_id';

function getStoredActiveInvestigationId(): string | null {
  try {
    return window.localStorage.getItem(ACTIVE_INVESTIGATION_STORAGE_KEY);
  } catch {
    return null;
  }
}

function setStoredActiveInvestigationId(id: string | null): void {
  try {
    if (id) {
      window.localStorage.setItem(ACTIVE_INVESTIGATION_STORAGE_KEY, id);
    } else {
      window.localStorage.removeItem(ACTIVE_INVESTIGATION_STORAGE_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

const NAV_ITEMS: Array<{ id: PageId; label: string; icon: typeof LayoutDashboard }> = [
  { id: 'dashboard', label: 'Home Dashboard', icon: LayoutDashboard },
  { id: 'analyze', label: 'New Forensic Analysis', icon: FileSearch },
  { id: 'results', label: 'Analysis Results', icon: ShieldAlert },
  { id: 'timeline', label: 'Suspicious Timeline', icon: Clock },
  { id: 'explorer', label: 'Evidence Explorer', icon: ScanEye },
  { id: 'reports', label: 'Forensic Reports', icon: FileCheck2 },
  { id: 'history', label: 'Analysis History', icon: History },
  { id: 'database', label: 'Database Tables', icon: Database },
  { id: 'about', label: 'About TruthLens', icon: Info },
];

export default function App() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [portalEntered, setPortalEntered] = useState(false);
  const [showIntroLogo, setShowIntroLogo] = useState(true);

  const [activePage, setActivePage] = useState<PageId>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [historyList, setHistoryList] = useState<InvestigationSummary[]>([]);
  const [loadingRegistry, setLoadingRegistry] = useState(true);

  const [currentReport, setCurrentReport] = useState<InvestigationReport | null>(null);
  const currentReportRef = useRef<InvestigationReport | null>(null);

  useEffect(() => {
    currentReportRef.current = currentReport;
  }, [currentReport]);

  const [replayTimestamp, setReplayTimestamp] = useState<number | null>(null);
  const [replayFindingId, setReplayFindingId] = useState<string | null>(null);

  const [verifyParams, setVerifyParams] = useState<{ id: string | null; hash: string | null }>({
    id: null,
    hash: null,
  });

  const refreshRegistry = useCallback(async () => {
    setLoadingRegistry(true);
    try {
      const [dashRes, histRes] = await Promise.all([
        fetch('/api/dashboard'),
        fetch('/api/investigations'),
      ]);
      if (dashRes.ok) {
        setStats((await dashRes.json()) as DashboardStats);
      }
      if (histRes.ok) {
        const hData = (await histRes.json()) as { investigations: InvestigationSummary[] };
        const investigations = hData.investigations || [];
        setHistoryList(investigations);

        const activeId = currentReportRef.current?.investigation_id;
        const storedId = getStoredActiveInvestigationId();
        const targetId =
          (activeId && investigations.some((inv) => inv.investigation_id === activeId) ? activeId : null) ||
          (storedId && investigations.some((inv) => inv.investigation_id === storedId) ? storedId : null) ||
          investigations[0]?.investigation_id ||
          null;

        if (targetId && (!currentReportRef.current || currentReportRef.current.investigation_id !== targetId)) {
          const repRes = await fetch(`/api/investigations/${encodeURIComponent(targetId)}`);
          if (repRes.ok) {
            const restored = (await repRes.json()) as InvestigationReport;
            setCurrentReport(restored);
            setStoredActiveInvestigationId(restored.investigation_id);
          }
        } else if (!targetId && currentReportRef.current) {
          setCurrentReport(null);
          setStoredActiveInvestigationId(null);
        }
      }
    } catch {
      // Keep previous state cleanly if transient error occurs
    } finally {
      setLoadingRegistry(false);
    }
  }, []);

  useEffect(() => {
    if (!showIntroLogo) return;
    const timer = window.setTimeout(() => {
      setShowIntroLogo(false);
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [showIntroLogo]);

  useEffect(() => {
    try {
      window.localStorage.removeItem(AUTH_STORAGE_KEY);
    } catch {
      // ignore storage errors
    }

    const params = new URLSearchParams(window.location.search);
    const vId = params.get('verify');
    const vHash = params.get('hash');
    if (vId) {
      setVerifyParams({ id: vId, hash: vHash });
      setActivePage('reports');
    }
  }, []);

  useEffect(() => {
    if (session) {
      void refreshRegistry();
    }
  }, [session, refreshRegistry]);

  const handleAuthenticated = (nextSession: AuthSession) => {
    setSession(nextSession);
    if (!verifyParams.id) {
      setActivePage('dashboard');
    }
  };

  const handleLogout = async () => {
    const token = session?.token;
    if (token) {
      try {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {
        // ignore
      }
    }
    setSession(null);
    setPortalEntered(false);
    setCurrentReport(null);
    setActivePage('dashboard');
  };

  const openInvestigationById = async (id: string) => {
    try {
      const res = await fetch(`/api/investigations/${encodeURIComponent(id)}`);
      if (!res.ok) return;
      const report = (await res.json()) as InvestigationReport;
      setCurrentReport(report);
      setStoredActiveInvestigationId(report.investigation_id);
      setReplayTimestamp(null);
      setReplayFindingId(null);
      setActivePage('results');
      setMobileMenuOpen(false);
    } catch {
      // ignore
    }
  };

  const launchDemoInvestigation = async () => {
    const res = await fetch('/api/demo', { method: 'POST' });
    if (res.ok) {
      const report = (await res.json()) as InvestigationReport;
      setCurrentReport(report);
      setStoredActiveInvestigationId(report.investigation_id);
      setReplayTimestamp(null);
      setReplayFindingId(null);
      setActivePage('results');
      setMobileMenuOpen(false);
      await refreshRegistry();
    }
  };

  const handleAnalysisComplete = async (report: InvestigationReport) => {
    setCurrentReport(report);
    setStoredActiveInvestigationId(report.investigation_id);
    setReplayTimestamp(null);
    setReplayFindingId(null);
    setActivePage('results');
    await refreshRegistry();
  };

  const handleUpdateReview = async (findingId: string, status: ReviewStatus, notes: string) => {
    if (!currentReport) return;
    const res = await fetch(
      `/api/investigations/${encodeURIComponent(currentReport.investigation_id)}/findings/${encodeURIComponent(findingId)}/review`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ review_status: status, investigator_notes: notes }),
      }
    );
    if (res.ok) {
      const updated = (await res.json()) as InvestigationReport;
      setCurrentReport(updated);
      await refreshRegistry();
    }
  };

  const handlePurgeMedia = async (id: string) => {
    const res = await fetch(`/api/investigations/${encodeURIComponent(id)}/purge-media`, {
      method: 'POST',
    });
    if (res.ok) {
      const updated = (await res.json()) as InvestigationReport;
      if (currentReport?.investigation_id === id) {
        setCurrentReport(updated);
      }
      await refreshRegistry();
    }
  };

  const handleDeleteInvestigation = async (id: string) => {
    const res = await fetch(`/api/investigations/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      if (getStoredActiveInvestigationId() === id) {
        setStoredActiveInvestigationId(null);
      }
      if (currentReport?.investigation_id === id) {
        setCurrentReport(null);
      }
      await refreshRegistry();
    }
  };

  const navigate = (page: PageId) => {
    setActivePage(page);
    setMobileMenuOpen(false);
  };

  const activeNavTitle = NAV_ITEMS.find((n) => n.id === activePage)?.label || 'TruthLens';

  return (
    <MotionConfig reducedMotion="user">
      {/* Smooth 3D daylight cosmic forensic motion UI canvas behind all views */}
      <AmbientMotionBackground3D />

      {/* First-open pop-up logo animation (plays once when opened for the first time) */}
      <AnimatePresence>
        {showIntroLogo && (
          <motion.div
            key="truthlens-intro-popup"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] } }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-[#EEF2F8]/95 backdrop-blur-md"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.72, y: 14 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 1.06, y: -8 }}
              transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
              className="flex flex-col items-center gap-4 text-center px-6"
            >
              <motion.img
                initial={{ scale: 0.8, rotate: -6 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                src="/src/assets/images/truthlens_emblem_1795059431139.jpg"
                alt="TruthLens Logo"
                referrerPolicy="no-referrer"
                className="w-24 h-24 rounded-3xl object-cover border border-white shadow-[0_20px_50px_-12px_rgba(37,99,235,0.28)]"
              />
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, delay: 0.18, ease: [0.16, 1, 0.3, 1] }}
                className="space-y-1"
              >
                <p className="text-3xl font-display font-bold tracking-tight text-slate-900">
                  TruthLens
                </p>
                <p className="text-xs font-medium text-blue-700 tracking-wide">
                  See Beyond the Surface. Verify What You Trust.
                </p>
              </motion.div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {!session ? (
        !portalEntered ? (
          <LandingPage onVisitPortal={() => setPortalEntered(true)} />
        ) : (
          <LoginPage
            onAuthenticated={handleAuthenticated}
            onBack={() => setPortalEntered(false)}
          />
        )
      ) : (
        <div className="relative z-10 min-h-screen text-slate-900 flex">
          {/* Desktop Sidebar */}
          <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 border-r border-slate-200/90 bg-white/90 z-30">
            <div className="h-16 px-5 flex items-center gap-3 border-b border-slate-200">
              <img
                src="/src/assets/images/truthlens_emblem_1795059431139.jpg"
                alt="TruthLens"
                referrerPolicy="no-referrer"
                className="w-8 h-8 rounded object-cover border border-slate-200 shrink-0"
              />
              <span className="font-display font-bold text-base tracking-tight text-slate-900 whitespace-nowrap">
                TruthLens
              </span>
            </div>

            <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto" aria-label="Primary navigation">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = activePage === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => navigate(item.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                      active
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </nav>

            <div className="p-4 border-t border-slate-200 text-xs space-y-3">
              {currentReport ? (
                <div className="space-y-1 pb-2 border-b border-slate-200">
                  <p className="text-slate-500">Active Investigation</p>
                  <p className="font-mono text-blue-700 font-medium truncate">{currentReport.investigation_id}</p>
                  <p className="text-[11px] text-slate-600 truncate">{currentReport.title}</p>
                </div>
              ) : (
                <p className="text-slate-500 pb-2 border-b border-slate-200">No active investigation loaded.</p>
              )}

              <div className="space-y-1">
                <p className="font-medium text-slate-900 truncate">{session.user.fullName}</p>
                <p className="font-mono text-[11px] text-slate-500 truncate">
                  {maskEmail(session.user.email)}
                </p>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="inline-flex items-center gap-1.5 pt-1 text-xs font-medium text-slate-600 hover:text-red-700 transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" /> Sign Out
                </button>
              </div>
            </div>
          </aside>

          {/* Mobile Navigation Drawer */}
          {mobileMenuOpen && (
            <div className="fixed inset-0 z-50 lg:hidden flex">
              <div className="fixed inset-0 bg-slate-900/40" onClick={() => setMobileMenuOpen(false)} />
              <aside className="relative w-64 max-w-[80vw] bg-white border-r border-slate-200 flex flex-col z-10">
                <div className="h-14 px-4 flex items-center justify-between border-b border-slate-200">
                  <span className="font-display font-bold text-slate-900">TruthLens</span>
                  <button
                    type="button"
                    onClick={() => setMobileMenuOpen(false)}
                    aria-label="Close navigation menu"
                    className="p-1.5 text-slate-500 hover:text-slate-900"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <nav className="flex-1 p-3 space-y-1">
                  {NAV_ITEMS.map((item) => {
                    const Icon = item.icon;
                    const active = activePage === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => navigate(item.id)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-xs font-medium ${
                          active ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <Icon className="w-4 h-4 shrink-0" />
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
                </nav>
                <div className="p-4 border-t border-slate-200 text-xs space-y-2">
                  <p className="font-medium text-slate-900 truncate">{session.user.fullName}</p>
                  <p className="font-mono text-[11px] text-slate-500 truncate">{maskEmail(session.user.email)}</p>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-red-700"
                  >
                    <LogOut className="w-3.5 h-3.5" /> Sign Out
                  </button>
                </div>
              </aside>
            </div>
          )}

          {/* Main Content Shell */}
          <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
            {/* Top Bar Contract: Breadcrumb on left + primary action on right */}
            <header className="h-14 sm:h-16 sticky top-0 z-20 bg-white/90 border-b border-slate-200/90 px-4 sm:px-6 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(true)}
                  aria-label="Open navigation menu"
                  className="lg:hidden p-2 text-slate-600 hover:text-slate-900 border border-slate-200 rounded"
                >
                  <Menu className="w-4 h-4" />
                </button>
                <div className="flex items-center gap-2 text-xs sm:text-sm min-w-0 truncate">
                  <span className="text-slate-500 hidden sm:inline">TruthLens Workspace</span>
                  <span className="text-slate-300 hidden sm:inline">/</span>
                  <span className="font-medium text-slate-900 truncate">{activeNavTitle}</span>
                  {currentReport && (
                    <>
                      <span className="text-slate-300 hidden md:inline">/</span>
                      <span className="font-mono text-xs text-blue-700 hidden md:inline truncate">
                        {currentReport.investigation_id}
                      </span>
                    </>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2.5 shrink-0">
                <button
                  type="button"
                  onClick={() => navigate('analyze')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium bg-slate-900 hover:bg-slate-800 text-white rounded-md transition-colors whitespace-nowrap shrink-0"
                >
                  New Analysis
                </button>
              </div>
            </header>

            <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1360px] w-full mx-auto">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activePage}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                >
                  {activePage === 'dashboard' && (
                    <DashboardPage
                      stats={stats}
                      loading={loadingRegistry}
                      activeConfidence={currentReport?.confidence ?? null}
                      activeWaveform={currentReport?.audio_analyses[0]?.waveformBins}
                      onStartNew={() => navigate('analyze')}
                      onOpenResults={currentReport ? () => navigate('results') : undefined}
                      onOpenHistory={() => navigate('history')}
                      onOpenInvestigation={openInvestigationById}
                    />
                  )}

                  {activePage === 'analyze' && (
                    <AnalyzePage onAnalysisComplete={handleAnalysisComplete} />
                  )}

                  {activePage === 'results' && (
                    <ResultsPage
                      report={currentReport}
                      onUpdateReview={handleUpdateReview}
                      onJumpToReplay={(sec, findingId) => {
                        setReplayTimestamp(sec);
                        setReplayFindingId(findingId);
                        navigate('timeline');
                      }}
                      onOpenReports={() => navigate('reports')}
                      onStartNew={() => navigate('analyze')}
                    />
                  )}

                  {activePage === 'timeline' && (
                    <TimelinePage
                      report={currentReport}
                      focusTimestamp={replayTimestamp}
                      focusFindingId={replayFindingId}
                      onStartNew={() => navigate('analyze')}
                    />
                  )}

                  {activePage === 'explorer' && (
                    <ExplorerPage
                      report={currentReport}
                      onStartNew={() => navigate('analyze')}
                    />
                  )}

                  {activePage === 'reports' && (
                    <ReportsPage
                      report={currentReport}
                      initialVerifyId={verifyParams.id}
                      initialVerifyHash={verifyParams.hash}
                      onStartNew={() => navigate('analyze')}
                    />
                  )}

                  {activePage === 'history' && (
                    <HistoryPage
                      investigations={historyList}
                      loading={loadingRegistry}
                      onOpenInvestigation={openInvestigationById}
                      onPurgeMedia={handlePurgeMedia}
                      onDeleteInvestigation={handleDeleteInvestigation}
                      onStartNew={() => navigate('analyze')}
                    />
                  )}

                  {activePage === 'database' && (
                    <DatabasePage authToken={session.token} />
                  )}

                  {activePage === 'about' && (
                    <AboutPage
                      onStartNew={() => navigate('analyze')}
                      onLaunchDemo={launchDemoInvestigation}
                    />
                  )}
                </motion.div>
              </AnimatePresence>
            </main>
          </div>
        </div>
      )}
    </MotionConfig>
  );
}
