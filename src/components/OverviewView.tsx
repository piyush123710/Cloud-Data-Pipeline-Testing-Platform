import { useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Database,
  FileSpreadsheet,
  HardDrive,
  Layers,
  Workflow,
  Zap,
} from 'lucide-react';
import type { PipelineSnapshot } from '../../shared/types.ts';

interface OverviewViewProps {
  snapshot: PipelineSnapshot;
  onNavigate: (tab: string) => void;
  onDownloadExcel: (runId: string) => void;
}

type StageId = 's3' | 'lambda' | 'glue' | 'databricks' | 'redshift';

export function OverviewView({ snapshot, onNavigate, onDownloadExcel }: OverviewViewProps) {
  const [selectedStage, setSelectedStage] = useState<StageId>('s3');
  const { currentRun, tables, lambdaEvents, glueJobs, databricksNotebook, runHistory } = snapshot;

  const totalRedshift = tables.reduce((acc, t) => acc + t.redshiftLoaded, 0);
  const totalNulls = tables.reduce((acc, t) => acc + t.nullCount, 0);
  const totalDups = tables.reduce((acc, t) => acc + t.duplicateCount, 0);
  const brokenTables = tables.filter((t) => t.refreshStatus !== 'Healthy').length;

  const stages: Array<{
    id: StageId;
    name: string;
    tech: string;
    metric: string;
    subtext: string;
    icon: typeof HardDrive;
  }> = [
    {
      id: 's3',
      name: 'Landing Zone',
      tech: 'AWS S3',
      metric: `${currentRun.totalRecordsProcessed.toLocaleString()} rows`,
      subtext: '6 source tables (Parquet, CSV, JSON)',
      icon: HardDrive,
    },
    {
      id: 'lambda',
      name: 'Event Triggers',
      tech: 'AWS Lambda',
      metric: `${lambdaEvents.length} invocations`,
      subtext: 'ObjectCreated:Put manifest dispatch',
      icon: Zap,
    },
    {
      id: 'glue',
      name: 'ETL Processing',
      tech: 'AWS Glue',
      metric: `${glueJobs.length} PySpark jobs`,
      subtext: `${totalNulls} quarantined · cast & partition`,
      icon: Workflow,
    },
    {
      id: 'databricks',
      name: 'Transform QA',
      tech: 'Databricks',
      metric: `${databricksNotebook.filter((c) => c.status === 'Passed').length}/${databricksNotebook.length} cells ok`,
      subtext: 'Spark SQL & PySpark check notebook',
      icon: Layers,
    },
    {
      id: 'redshift',
      name: 'Cloud Warehouse',
      tech: 'Amazon Redshift',
      metric: `${totalRedshift.toLocaleString()} loaded`,
      subtext: brokenTables > 0 ? `${brokenTables} refresh warnings` : 'All tables refreshed',
      icon: Database,
    },
  ];

  return (
    <div className="space-y-8">
      {/* Project Header & Tech Summary */}
      <section className="bg-white border border-slate-200 rounded-lg p-6">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div className="space-y-1.5 max-w-3xl">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span>{snapshot.projectMeta.releaseDate}</span>
              <span aria-hidden="true">·</span>
              <span>Active Run {currentRun.runId}</span>
              <span aria-hidden="true">·</span>
              <span>Trigger: {currentRun.triggerSource}</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              {snapshot.projectMeta.name}
            </h1>
            <p className="text-sm text-slate-600 leading-relaxed">
              {snapshot.projectMeta.description}
            </p>
          </div>

          <div className="text-xs text-slate-600 lg:text-right shrink-0">
            <div className="font-medium text-slate-900 mb-1">Core Framework Stack</div>
            <div className="font-mono text-slate-600">
              {snapshot.projectMeta.techStack.join(' · ')}
            </div>
          </div>
        </div>

        {/* 5-Column KPI Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-6 mt-6 pt-6 border-t border-slate-200">
          <div>
            <div className="text-xs font-medium text-slate-500">Records Processed</div>
            <div className="text-2xl font-bold text-slate-900 font-mono tabular-nums mt-1">
              {currentRun.totalRecordsProcessed.toLocaleString()}
            </div>
            <div className="text-xs text-slate-500 mt-1">Across {currentRun.tablesValidated} source tables</div>
          </div>

          <div>
            <div className="text-xs font-medium text-slate-500">Quality Rules (6 Dim.)</div>
            <div className="text-2xl font-bold text-slate-900 font-mono tabular-nums mt-1">
              {currentRun.rulesPassed} / {currentRun.totalRules}
            </div>
            <div className="text-xs text-slate-500 mt-1">{currentRun.rulesFailed} failed reconciliation</div>
          </div>

          <div>
            <div className="text-xs font-medium text-slate-500">Pytest Scenarios</div>
            <div className="text-2xl font-bold text-slate-900 font-mono tabular-nums mt-1">
              {currentRun.testsPassed} / {currentRun.totalTests}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              <span className="font-mono tabular-nums">{currentRun.passRatePct}%</span> suite pass rate
            </div>
          </div>

          <div>
            <div className="text-xs font-medium text-slate-500">Defects Caught</div>
            <div className="text-2xl font-bold text-slate-900 font-mono tabular-nums mt-1">
              {currentRun.openDefects} Open
            </div>
            <div className="text-xs text-slate-500 mt-1">
              {currentRun.resolvedDefects} resolved · {totalDups} dups · {totalNulls} nulls
            </div>
          </div>

          <div>
            <div className="text-xs font-medium text-slate-500">Warehouse Delta</div>
            <div className="text-2xl font-bold text-slate-900 font-mono tabular-nums mt-1">
              {totalRedshift - currentRun.totalRecordsProcessed >= 0 ? '+' : ''}
              {(totalRedshift - currentRun.totalRecordsProcessed).toLocaleString()}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              {brokenTables > 0 ? `${brokenTables} refresh SLA alerts` : '0 refresh SLA alerts'}
            </div>
          </div>
        </div>
      </section>

      {/* Interactive 5-Stage Pipeline Topology */}
      <section className="bg-white border border-slate-200 rounded-lg p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-5">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              End-to-End S3-to-Redshift Pipeline Architecture
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Select a pipeline stage to inspect live execution metrics, triggers, and transformation checks.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('databricks')}
            className="text-xs font-medium text-blue-700 hover:text-blue-800 whitespace-nowrap shrink-0 self-start sm:self-auto"
          >
            Open Databricks &amp; S3 Uploader
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-stretch">
          {stages.map((st, idx) => {
            const Icon = st.icon;
            const active = selectedStage === st.id;
            return (
              <div key={st.id} className="flex items-stretch gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedStage(st.id)}
                  className={`w-full text-left p-4 rounded-lg border transition-colors flex flex-col justify-between ${
                    active
                      ? 'border-blue-700 bg-blue-50/50'
                      : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-blue-700">{st.tech}</span>
                      <Icon className="w-4 h-4 text-slate-500 shrink-0" />
                    </div>
                    <div className="text-sm font-semibold text-slate-900 mt-1">{st.name}</div>
                  </div>
                  <div className="mt-3 pt-2 border-t border-slate-200/80">
                    <div className="text-sm font-semibold font-mono tabular-nums text-slate-900">
                      {st.metric}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5 truncate">{st.subtext}</div>
                  </div>
                </button>
                {idx < stages.length - 1 && (
                  <div className="hidden md:flex items-center justify-center text-slate-400 shrink-0">
                    <ArrowRight className="w-4 h-4" />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Stage Detail Drawer (Hairline separated, no nested cards) */}
        <div className="mt-5 pt-5 border-t border-slate-200">
          {selectedStage === 's3' && (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-slate-900">
                AWS S3 Raw Inbound Manifests (6 Source Tables)
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2 text-xs">
                {tables.map((t) => (
                  <div key={t.tableName} className="flex items-center justify-between py-1.5 border-b border-slate-100">
                    <span className="font-mono text-slate-700 truncate pr-2">{t.s3Path.replace('s3://raw-enterprise-lake/inbound/', '')}</span>
                    <span className="font-mono tabular-nums font-medium text-slate-900 shrink-0">
                      {t.s3Records.toLocaleString()} rows
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {selectedStage === 'lambda' && (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-slate-900">
                AWS Lambda S3 Event Triggers (fn-s3-ingest-dispatcher)
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2 text-xs">
                {lambdaEvents.map((ev) => (
                  <div key={ev.eventId} className="flex items-center justify-between py-1.5 border-b border-slate-100">
                    <span className="font-mono text-slate-700 truncate pr-2">{ev.targetGlueJob}</span>
                    <span className="font-mono tabular-nums text-slate-700 shrink-0">
                      {ev.durationMs}ms · {ev.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {selectedStage === 'glue' && (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-slate-900">
                AWS Glue PySpark ETL Execution Summary
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2 text-xs">
                {glueJobs.map((job) => (
                  <div key={job.runId} className="flex items-center justify-between py-1.5 border-b border-slate-100">
                    <span className="font-mono text-slate-700 truncate pr-2">{job.jobName}</span>
                    <span className="font-mono tabular-nums text-slate-700 shrink-0">
                      {job.dpuAllocated} DPU · {job.durationSec}s · {job.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {selectedStage === 'databricks' && (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-slate-900">
                Databricks Transformation Notebook Checks (/Workspace/QA/s3_redshift_transformation_checks.py)
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-xs">
                {databricksNotebook.map((cell) => (
                  <div key={cell.cellNumber} className="flex items-center justify-between py-1.5 border-b border-slate-100 gap-3">
                    <span className="text-slate-700 truncate">
                      Cell {cell.cellNumber}: {cell.title}
                    </span>
                    <span
                      className={`font-medium shrink-0 ${
                        cell.status === 'Passed' ? 'text-emerald-700' : 'text-red-700'
                      }`}
                    >
                      {cell.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {selectedStage === 'redshift' && (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-slate-900">
                Amazon Redshift Warehouse Target Tables (analytics_dw.public)
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2 text-xs">
                {tables.map((t) => (
                  <div key={t.tableName} className="flex items-center justify-between py-1.5 border-b border-slate-100">
                    <span className="font-mono text-slate-700">public.{t.tableName}</span>
                    <span
                      className={`font-mono tabular-nums shrink-0 ${
                        t.refreshStatus === 'Healthy' ? 'text-emerald-700' : 'text-red-700'
                      }`}
                    >
                      {t.redshiftLoaded.toLocaleString()} rows · {t.refreshStatus}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* 6-Table Source-to-Warehouse Reconciliation Matrix */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Source-to-Warehouse Table Reconciliation (6 Tables)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Row-count parity, duplicates, null violations, and Redshift refresh SLA status across all 6 inbound S3 datasets.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => onNavigate('quality')}
              className="text-xs font-medium text-blue-700 hover:text-blue-800 whitespace-nowrap shrink-0"
            >
              Inspect 44 Quality Rules
            </button>
            <button
              type="button"
              onClick={() => onNavigate('defects')}
              className="text-xs font-medium text-blue-700 hover:text-blue-800 whitespace-nowrap shrink-0"
            >
              Inspect {currentRun.openDefects} Open Defects
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                <th className="py-3 px-4">Source Table</th>
                <th className="py-3 px-3">Format</th>
                <th className="py-3 px-3 text-right">S3 Source</th>
                <th className="py-3 px-3 text-right">Glue ETL</th>
                <th className="py-3 px-3 text-right">Redshift</th>
                <th className="py-3 px-3 text-right">Delta</th>
                <th className="py-3 px-3 text-right">Nulls</th>
                <th className="py-3 px-3 text-right">Duplicates</th>
                <th className="py-3 px-4">Refresh Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-sm">
              {tables.map((row) => (
                <tr key={row.tableName} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-2.5 px-4">
                    <div className="font-mono font-medium text-slate-900">{row.tableName}</div>
                    <div className="text-xs text-slate-500 font-mono">PK: {row.primaryKey}</div>
                  </td>
                  <td className="py-2.5 px-3 text-xs font-mono text-slate-600">{row.fileFormat}</td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-900">
                    {row.s3Records.toLocaleString()}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700">
                    {row.glueProcessed.toLocaleString()}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-900 font-medium">
                    {row.redshiftLoaded.toLocaleString()}
                  </td>
                  <td
                    className={`py-2.5 px-3 text-right font-mono tabular-nums font-medium ${
                      row.deltaRecords === 0 ? 'text-emerald-700' : 'text-red-700'
                    }`}
                  >
                    {row.deltaRecords > 0 ? `+${row.deltaRecords}` : row.deltaRecords}
                  </td>
                  <td
                    className={`py-2.5 px-3 text-right font-mono tabular-nums ${
                      row.nullCount === 0 ? 'text-slate-600' : 'text-amber-700 font-medium'
                    }`}
                  >
                    {row.nullCount}
                  </td>
                  <td
                    className={`py-2.5 px-3 text-right font-mono tabular-nums ${
                      row.duplicateCount === 0 ? 'text-slate-600' : 'text-red-700 font-medium'
                    }`}
                  >
                    {row.duplicateCount}
                  </td>
                  <td className="py-2.5 px-4">
                    <div className="inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap">
                      {row.refreshStatus === 'Healthy' ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                          <span className="text-emerald-700">Healthy ({row.refreshLagMinutes}m lag)</span>
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="w-3.5 h-3.5 text-red-700 shrink-0" />
                          <span className="text-red-700">
                            {row.refreshStatus} ({row.refreshLagMinutes}m)
                          </span>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Run History & Excel Export Ledger */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Pipeline Test Run History</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Every pipeline verification run is archived and exportable as a multi-sheet Excel summary.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('excel')}
            className="text-xs font-medium text-blue-700 hover:text-blue-800 whitespace-nowrap shrink-0"
          >
            Preview Excel Workbook
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                <th className="py-2.5 px-4">Run ID</th>
                <th className="py-2.5 px-3">Trigger</th>
                <th className="py-2.5 px-3 text-right">Records</th>
                <th className="py-2.5 px-3 text-right">Rules Passed</th>
                <th className="py-2.5 px-3 text-right">Pytest Passed</th>
                <th className="py-2.5 px-3 text-right">Open Defects</th>
                <th className="py-2.5 px-3">Notes</th>
                <th className="py-2.5 px-4 text-right">Excel Summary</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-sm">
              {runHistory.map((run) => (
                <tr key={run.runId} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-2.5 px-4 font-mono text-xs font-semibold text-slate-900 whitespace-nowrap">
                    {run.runId}
                  </td>
                  <td className="py-2.5 px-3 text-xs text-slate-700 whitespace-nowrap">{run.triggerSource}</td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums text-xs text-slate-900">
                    {run.totalRecordsProcessed.toLocaleString()}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums text-xs text-slate-800">
                    {run.rulesPassed}/{run.totalRules}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums text-xs text-slate-800">
                    {run.testsPassed}/{run.totalTests} ({run.passRatePct}%)
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums text-xs font-medium text-slate-900">
                    {run.openDefects}
                  </td>
                  <td className="py-2.5 px-3 text-xs text-slate-600 max-w-xs truncate">{run.notes}</td>
                  <td className="py-2.5 px-4 text-right">
                    <button
                      type="button"
                      onClick={() => onDownloadExcel(run.runId)}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 hover:text-blue-900 whitespace-nowrap"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5 shrink-0" />
                      <span>Download .xlsx</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
