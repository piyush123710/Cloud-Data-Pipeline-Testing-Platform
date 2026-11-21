import { useState } from 'react';
import { FileSpreadsheet } from 'lucide-react';
import type { PipelineSnapshot } from '../../shared/types.ts';

interface ExcelReportViewProps {
  snapshot: PipelineSnapshot;
  onDownloadExcel: (runId: string) => void;
}

type SheetKey = 'summary' | 'tables' | 'rules' | 'pytest' | 'defects';

export function ExcelReportView({ snapshot, onDownloadExcel }: ExcelReportViewProps) {
  const [activeSheet, setActiveSheet] = useState<SheetKey>('summary');
  const [selectedRunId, setSelectedRunId] = useState<string>(snapshot.currentRun.runId);

  const selectedRun =
    snapshot.runHistory.find((r) => r.runId === selectedRunId) ?? snapshot.currentRun;

  const sheets: Array<{ key: SheetKey; label: string }> = [
    { key: 'summary', label: '1. Run Summary' },
    { key: 'tables', label: '2. Table Reconciliation (6)' },
    { key: 'rules', label: `3. Quality Rules (${snapshot.qualityRules.length})` },
    { key: 'pytest', label: `4. Pytest Cases (${snapshot.pytestCases.length})` },
    { key: 'defects', label: `5. Defect Log (${snapshot.defects.length})` },
  ];

  return (
    <div className="space-y-6">
      <section className="bg-white border border-slate-200 rounded-lg p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-5">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">
              Excel Run Summary Workbook Preview (.xlsx)
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Every pipeline run is summarized into a formatted 5-sheet Microsoft Excel workbook for stakeholder sign-off.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <select
              value={selectedRun.runId}
              onChange={(e) => setSelectedRunId(e.target.value)}
              aria-label="Select pipeline run for Excel export"
              className="px-3 py-2 text-xs font-mono border border-slate-300 rounded-md bg-white text-slate-900"
            >
              {snapshot.runHistory.map((r) => (
                <option key={r.runId} value={r.runId}>
                  {r.runId} ({r.passRatePct}% pass)
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => onDownloadExcel(selectedRun.runId)}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-md transition-colors whitespace-nowrap shrink-0"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Export {selectedRun.runId}.xlsx</span>
            </button>
          </div>
        </div>

        {/* Excel Sheet Tabs */}
        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg mb-5">
          {sheets.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setActiveSheet(s.key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                activeSheet === s.key ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Sheet Preview Grid */}
        <div className="border border-slate-200 rounded-md overflow-x-auto">
          {activeSheet === 'summary' && (
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-blue-900 text-white">
                  <th className="py-2.5 px-4 font-semibold">Metric</th>
                  <th className="py-2.5 px-4 font-semibold">Value</th>
                  <th className="py-2.5 px-4 font-semibold">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                <tr>
                  <td className="py-2.5 px-4 font-medium text-slate-900">Run ID</td>
                  <td className="py-2.5 px-4 font-mono text-slate-800">{selectedRun.runId}</td>
                  <td className="py-2.5 px-4 text-slate-600">{selectedRun.triggerSource}</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-4 font-medium text-slate-900">Total Records Processed</td>
                  <td className="py-2.5 px-4 font-mono tabular-nums text-slate-800">{selectedRun.totalRecordsProcessed.toLocaleString()}</td>
                  <td className="py-2.5 px-4 text-slate-600">Across 6 AWS S3 source tables</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-4 font-medium text-slate-900">Quality Rules Evaluated</td>
                  <td className="py-2.5 px-4 font-mono tabular-nums text-slate-800">{selectedRun.rulesPassed} / {selectedRun.totalRules} Passed</td>
                  <td className="py-2.5 px-4 text-slate-600">{selectedRun.rulesFailed} failed across 6 dimensions</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-4 font-medium text-slate-900">Pytest Suite Results</td>
                  <td className="py-2.5 px-4 font-mono tabular-nums text-slate-800">{selectedRun.testsPassed} / {selectedRun.totalTests} ({selectedRun.passRatePct}%)</td>
                  <td className="py-2.5 px-4 text-slate-600">Positive, Negative, Boundary, and Failure scenarios</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-4 font-medium text-slate-900">Defects Caught</td>
                  <td className="py-2.5 px-4 font-mono tabular-nums text-slate-800">{selectedRun.openDefects} Open · {selectedRun.resolvedDefects} Resolved</td>
                  <td className="py-2.5 px-4 text-slate-600">{selectedRun.notes}</td>
                </tr>
              </tbody>
            </table>
          )}

          {activeSheet === 'tables' && (
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-blue-900 text-white">
                  <th className="py-2.5 px-4">Table</th>
                  <th className="py-2.5 px-3 text-right">S3 Records</th>
                  <th className="py-2.5 px-3 text-right">Glue ETL</th>
                  <th className="py-2.5 px-3 text-right">Redshift</th>
                  <th className="py-2.5 px-3 text-right">Delta</th>
                  <th className="py-2.5 px-3 text-right">Nulls</th>
                  <th className="py-2.5 px-3 text-right">Duplicates</th>
                  <th className="py-2.5 px-4">Refresh Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-mono">
                {snapshot.tables.map((t) => (
                  <tr key={t.tableName}>
                    <td className="py-2 px-4 text-slate-900">{t.tableName}</td>
                    <td className="py-2 px-3 text-right tabular-nums">{t.s3Records.toLocaleString()}</td>
                    <td className="py-2 px-3 text-right tabular-nums">{t.glueProcessed.toLocaleString()}</td>
                    <td className="py-2 px-3 text-right tabular-nums">{t.redshiftLoaded.toLocaleString()}</td>
                    <td className="py-2 px-3 text-right tabular-nums">{t.deltaRecords}</td>
                    <td className="py-2 px-3 text-right tabular-nums">{t.nullCount}</td>
                    <td className="py-2 px-3 text-right tabular-nums">{t.duplicateCount}</td>
                    <td className="py-2 px-4 font-sans">{t.refreshStatus}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {activeSheet === 'rules' && (
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-blue-900 text-white">
                  <th className="py-2.5 px-4">Rule ID</th>
                  <th className="py-2.5 px-3">Dimension</th>
                  <th className="py-2.5 px-3">Table</th>
                  <th className="py-2.5 px-3">Rule Name</th>
                  <th className="py-2.5 px-3">Actual</th>
                  <th className="py-2.5 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {snapshot.qualityRules.map((r) => (
                  <tr key={r.id}>
                    <td className="py-2 px-4 font-mono">{r.id}</td>
                    <td className="py-2 px-3">{r.dimension}</td>
                    <td className="py-2 px-3 font-mono">{r.table}</td>
                    <td className="py-2 px-3">{r.ruleName}</td>
                    <td className="py-2 px-3 font-mono">{r.actualValue}</td>
                    <td className={`py-2 px-4 font-medium ${r.status === 'Passed' ? 'text-emerald-700' : 'text-red-700'}`}>
                      {r.status}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {activeSheet === 'pytest' && (
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-blue-900 text-white">
                  <th className="py-2.5 px-4">Test ID</th>
                  <th className="py-2.5 px-3">Scenario</th>
                  <th className="py-2.5 px-3">Table</th>
                  <th className="py-2.5 px-3">Node ID</th>
                  <th className="py-2.5 px-3 text-right">Duration</th>
                  <th className="py-2.5 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {snapshot.pytestCases.map((tc) => (
                  <tr key={tc.id}>
                    <td className="py-2 px-4 font-mono">{tc.id}</td>
                    <td className="py-2 px-3">{tc.scenario}</td>
                    <td className="py-2 px-3 font-mono">{tc.table}</td>
                    <td className="py-2 px-3 font-mono truncate max-w-xs">{tc.nodeId}</td>
                    <td className="py-2 px-3 text-right font-mono tabular-nums">{tc.durationMs} ms</td>
                    <td className={`py-2 px-4 font-medium ${tc.status === 'Passed' ? 'text-emerald-700' : 'text-red-700'}`}>
                      {tc.status}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {activeSheet === 'defects' && (
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-blue-900 text-white">
                  <th className="py-2.5 px-4">Defect ID</th>
                  <th className="py-2.5 px-3">Category</th>
                  <th className="py-2.5 px-3">Severity</th>
                  <th className="py-2.5 px-3">Table</th>
                  <th className="py-2.5 px-3 text-right">Rows</th>
                  <th className="py-2.5 px-3">Title</th>
                  <th className="py-2.5 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {snapshot.defects.map((d) => (
                  <tr key={d.id}>
                    <td className="py-2 px-4 font-mono">{d.id}</td>
                    <td className="py-2 px-3">{d.category}</td>
                    <td className="py-2 px-3">{d.severity}</td>
                    <td className="py-2 px-3 font-mono">{d.table}</td>
                    <td className="py-2 px-3 text-right font-mono tabular-nums">{d.affectedRows}</td>
                    <td className="py-2 px-3">{d.title}</td>
                    <td className={`py-2 px-4 font-medium ${d.status === 'Resolved' ? 'text-emerald-700' : 'text-red-700'}`}>
                      {d.status}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
