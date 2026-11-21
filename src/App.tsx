import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Database,
  FileSpreadsheet,
  FlaskConical,
  Layers,
  LayoutDashboard,
  Menu,
  Play,
  ShieldCheck,
  X,
} from 'lucide-react';
import type { PipelineSnapshot, SqlExecutionResponse } from '../shared/types.ts';
import { OverviewView } from './components/OverviewView.tsx';
import { QualitySqlView } from './components/QualitySqlView.tsx';
import { DatabricksEtlView } from './components/DatabricksEtlView.tsx';
import { PytestSuiteView } from './components/PytestSuiteView.tsx';
import { DefectsView } from './components/DefectsView.tsx';
import { ExcelReportView } from './components/ExcelReportView.tsx';

type NavTab = 'overview' | 'quality' | 'databricks' | 'pytest' | 'defects' | 'excel';

export default function App() {
  const [snapshot, setSnapshot] = useState<PipelineSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<NavTab>('overview');
  const [focusedDefectId, setFocusedDefectId] = useState<string | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const loadSnapshot = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/pipeline/state');
      if (!res.ok) throw new Error(`Failed to load pipeline state (${res.status})`);
      const data = (await res.json()) as PipelineSnapshot;
      setSnapshot(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reach pipeline server');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSnapshot();
  }, [loadSnapshot]);

  async function handleRunPipeline() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/pipeline/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ triggerSource: 'Manual QA Trigger' }),
      });
      if (!res.ok) throw new Error(`Pipeline run failed (${res.status})`);
      const data = (await res.json()) as PipelineSnapshot;
      setSnapshot(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Pipeline execution error');
    } finally {
      setBusy(false);
    }
  }

  async function handleResolveDefect(defectId: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/pipeline/fix-defect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ defectId }),
      });
      if (!res.ok) throw new Error(`Failed to resolve defect (${res.status})`);
      const data = (await res.json()) as PipelineSnapshot;
      setSnapshot(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Defect remediation failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleResolveAll() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/pipeline/fix-all', { method: 'POST' });
      if (!res.ok) throw new Error(`Failed to resolve defects (${res.status})`);
      const data = (await res.json()) as PipelineSnapshot;
      setSnapshot(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Batch remediation failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleInjectFault(
    faultType: 'duplicates' | 'nulls' | 'broken_refresh' | 'reset_baseline'
  ) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/pipeline/inject-fault', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ faultType }),
      });
      if (!res.ok) throw new Error(`Simulation failed (${res.status})`);
      const data = (await res.json()) as PipelineSnapshot;
      setSnapshot(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fault simulation failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleUploadSource(tableName: string, content: string, format: 'csv' | 'json') {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/pipeline/upload-source', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tableName, content, format }),
      });
      if (!res.ok) throw new Error(`Source ingestion failed (${res.status})`);
      const data = (await res.json()) as PipelineSnapshot;
      setSnapshot(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleExecuteSql(query: string): Promise<SqlExecutionResponse> {
    const res = await fetch('/api/sql/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });
    if (!res.ok) {
      throw new Error(`SQL query failed (${res.status})`);
    }
    return (await res.json()) as SqlExecutionResponse;
  }

  function handleDownloadExcel(runId: string) {
    const link = document.createElement('a');
    link.href = `/api/runs/${encodeURIComponent(runId)}/excel`;
    link.download = `pipeline_qa_summary_${runId}.xlsx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function handleJumpToDefect(defectId: string) {
    setFocusedDefectId(defectId);
    setActiveTab('defects');
  }

  const navItems: Array<{ id: NavTab; label: string; countText?: string; icon: typeof LayoutDashboard }> = [
    { id: 'overview', label: 'Pipeline Overview', icon: LayoutDashboard },
    {
      id: 'quality',
      label: 'SQL & Quality Rules',
      countText: snapshot ? `${snapshot.qualityRules.length}` : '44',
      icon: ShieldCheck,
    },
    { id: 'databricks', label: 'Databricks & S3 ETL', icon: Layers },
    {
      id: 'pytest',
      label: 'Pytest Suite',
      countText: snapshot ? `${snapshot.pytestCases.length}` : '64',
      icon: FlaskConical,
    },
    {
      id: 'defects',
      label: 'Defects Caught',
      countText: snapshot ? `${snapshot.currentRun.openDefects}` : '28',
      icon: AlertTriangle,
    },
    { id: 'excel', label: 'Excel Run Summary', icon: FileSpreadsheet },
  ];

  const activeNavLabel = navItems.find((n) => n.id === activeTab)?.label ?? 'Pipeline Overview';

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900">
      {/* Desktop Sidebar (256px) */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 bg-white border-r border-slate-200 z-30">
        <div className="h-14 px-5 flex items-center gap-2.5 border-b border-slate-200">
          <Database className="w-5 h-5 text-blue-700 shrink-0" />
          <span className="text-sm font-bold tracking-tight text-slate-900 whitespace-nowrap truncate">
            Pipeline QA Lab
          </span>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto" aria-label="Primary sections">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-blue-50 text-blue-800'
                    : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-blue-700' : 'text-slate-500'}`} />
                  <span className="truncate">{item.label}</span>
                </span>
                {item.countText && (
                  <span className="font-mono tabular-nums text-[11px] text-slate-500 shrink-0">
                    {item.countText}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-200 text-xs text-slate-500 space-y-1">
          <div className="font-medium text-slate-800">Target Architecture</div>
          <div>AWS S3 · Lambda · Glue</div>
          <div>Databricks · Amazon Redshift</div>
          <div>Python · pytest · SQL · Excel</div>
        </div>
      </aside>

      {/* Mobile Sidebar Overlay */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/40"
            onClick={() => setMobileNavOpen(false)}
            aria-hidden="true"
          />
          <aside className="relative w-64 max-w-xs bg-white h-full border-r border-slate-200 flex flex-col z-10">
            <div className="h-14 px-5 flex items-center justify-between border-b border-slate-200">
              <span className="text-sm font-bold text-slate-900">Pipeline QA Lab</span>
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                aria-label="Close navigation menu"
                className="p-1.5 text-slate-600 hover:text-slate-900"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <nav className="flex-1 p-3 space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(item.id);
                      setMobileNavOpen(false);
                    }}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 text-xs font-medium rounded-md ${
                      active ? 'bg-blue-50 text-blue-800' : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <Icon className="w-4 h-4 shrink-0" />
                      <span>{item.label}</span>
                    </span>
                    {item.countText && (
                      <span className="font-mono tabular-nums text-[11px] text-slate-500">
                        {item.countText}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        {/* Top Bar Contract: Breadcrumbs on left, max 2 single-line primary actions on right */}
        <header className="sticky top-0 z-20 h-14 bg-white border-b border-slate-200 px-4 sm:px-8 flex items-center justify-between gap-8">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden p-1.5 text-slate-600 hover:text-slate-900 rounded-md"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 text-xs text-slate-500 truncate">
              <span className="font-medium text-slate-700 hidden sm:inline whitespace-nowrap">
                Cloud Data Pipeline Testing Platform
              </span>
              <span className="hidden sm:inline" aria-hidden="true">/</span>
              <span className="font-semibold text-slate-900 whitespace-nowrap truncate">
                {activeNavLabel}
              </span>
              {snapshot && (
                <>
                  <span className="hidden md:inline" aria-hidden="true">/</span>
                  <span className="hidden md:inline font-mono text-slate-500 whitespace-nowrap">
                    {snapshot.currentRun.runId}
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {snapshot && (
              <button
                type="button"
                onClick={() => handleDownloadExcel(snapshot.currentRun.runId)}
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md transition-colors whitespace-nowrap shrink-0"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-slate-600" />
                <span>Export Excel</span>
              </button>
            )}

            <button
              type="button"
              disabled={busy || loading}
              onClick={handleRunPipeline}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-50 rounded-md transition-colors whitespace-nowrap shrink-0"
            >
              <Play className="w-3.5 h-3.5" />
              <span>{busy ? 'Running Tests...' : 'Run Pipeline Test'}</span>
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-8 max-w-[1360px] w-full mx-auto">
          {error && (
            <div className="mb-6 p-4 rounded-lg bg-red-50 border border-red-200 flex items-center justify-between gap-4 text-xs text-red-800">
              <span>{error}</span>
              <button
                type="button"
                onClick={() => void loadSnapshot()}
                className="px-3 py-1 font-medium bg-white border border-red-300 rounded text-red-800 hover:bg-red-100 whitespace-nowrap shrink-0"
              >
                Retry
              </button>
            </div>
          )}

          {loading || !snapshot ? (
            <div className="space-y-6" aria-busy="true" aria-label="Loading pipeline test data">
              <div className="h-44 bg-white border border-slate-200 rounded-lg animate-pulse" />
              <div className="h-64 bg-white border border-slate-200 rounded-lg animate-pulse" />
              <div className="h-72 bg-white border border-slate-200 rounded-lg animate-pulse" />
            </div>
          ) : (
            <>
              {activeTab === 'overview' && (
                <OverviewView
                  snapshot={snapshot}
                  onNavigate={(t) => setActiveTab(t as NavTab)}
                  onDownloadExcel={handleDownloadExcel}
                />
              )}
              {activeTab === 'quality' && (
                <QualitySqlView
                  rules={snapshot.qualityRules}
                  onExecuteSql={handleExecuteSql}
                  onJumpToDefect={handleJumpToDefect}
                />
              )}
              {activeTab === 'databricks' && (
                <DatabricksEtlView
                  cells={snapshot.databricksNotebook}
                  glueJobs={snapshot.glueJobs}
                  lambdaEvents={snapshot.lambdaEvents}
                  onInjectFault={handleInjectFault}
                  onUploadSource={handleUploadSource}
                  busy={busy}
                />
              )}
              {activeTab === 'pytest' && (
                <PytestSuiteView testCases={snapshot.pytestCases} />
              )}
              {activeTab === 'defects' && (
                <DefectsView
                  defects={snapshot.defects}
                  initialDefectId={focusedDefectId}
                  onResolveDefect={handleResolveDefect}
                  onResolveAll={handleResolveAll}
                  busy={busy}
                />
              )}
              {activeTab === 'excel' && (
                <ExcelReportView
                  snapshot={snapshot}
                  onDownloadExcel={handleDownloadExcel}
                />
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
