import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Wrench } from 'lucide-react';
import type { DefectCategory, DefectRecord } from '../../shared/types.ts';

interface DefectsViewProps {
  defects: DefectRecord[];
  initialDefectId: string | null;
  onResolveDefect: (defectId: string) => Promise<void>;
  onResolveAll: () => Promise<void>;
  busy: boolean;
}

const CATEGORIES: Array<'All' | DefectCategory> = [
  'All',
  'Duplicate Records',
  'Null Violations',
  'Broken Refresh',
  'Referential Mismatch',
  'Validity & Boundary',
];

export function DefectsView({
  defects,
  initialDefectId,
  onResolveDefect,
  onResolveAll,
  busy,
}: DefectsViewProps) {
  const [categoryFilter, setCategoryFilter] = useState<'All' | DefectCategory>('All');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Open' | 'Resolved'>('All');
  const [selectedId, setSelectedId] = useState<string>(initialDefectId ?? defects[0]?.id ?? 'DEF-001');

  const openCount = defects.filter((d) => d.status === 'Open').length;

  const filtered = useMemo(() => {
    return defects.filter((d) => {
      if (categoryFilter !== 'All' && d.category !== categoryFilter) return false;
      if (statusFilter !== 'All' && d.status !== statusFilter) return false;
      return true;
    });
  }, [defects, categoryFilter, statusFilter]);

  const activeDefect = useMemo(() => {
    if (initialDefectId) {
      const target = defects.find((d) => d.id === initialDefectId);
      if (target && selectedId === initialDefectId) return target;
    }
    return filtered.find((d) => d.id === selectedId) ?? filtered[0] ?? defects[0];
  }, [defects, filtered, selectedId, initialDefectId]);

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <section className="bg-white border border-slate-200 rounded-lg p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">
              Caught Pipeline Defects ({defects.length} Total · {openCount} Open)
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Defects surfaced by SQL reconciliation and pytest assertions including duplicates, nulls, broken refreshes, and referential mismatches.
            </p>
          </div>
          <button
            type="button"
            disabled={busy || openCount === 0}
            onClick={onResolveAll}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-50 rounded-md transition-colors whitespace-nowrap shrink-0 self-start sm:self-auto"
          >
            <Wrench className="w-3.5 h-3.5" />
            <span>{openCount === 0 ? 'All Defects Resolved' : 'Apply All Glue Fixes & Re-Run'}</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {CATEGORIES.map((cat) => {
              const count =
                cat === 'All'
                  ? defects.length
                  : defects.filter((d) => d.category === cat).length;
              const active = categoryFilter === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategoryFilter(cat)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    active ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {cat} ({count})
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-md">
            {(['All', 'Open', 'Resolved'] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                  statusFilter === st ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Split Ledger & Root-Cause Diff */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <section className="lg:col-span-6 bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="max-h-[640px] overflow-y-auto divide-y divide-slate-200">
            {filtered.map((def) => {
              const selected = activeDefect?.id === def.id;
              return (
                <button
                  key={def.id}
                  type="button"
                  onClick={() => setSelectedId(def.id)}
                  className={`w-full text-left px-4 py-3 transition-colors flex items-start justify-between gap-3 ${
                    selected ? 'bg-blue-50/60' : 'bg-white hover:bg-slate-50'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span className="font-mono font-semibold text-slate-800">{def.id}</span>
                      <span aria-hidden="true">·</span>
                      <span>{def.category}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono">{def.table}</span>
                      <span aria-hidden="true">·</span>
                      <span className={def.severity === 'Critical' ? 'text-red-700 font-medium' : 'text-slate-600'}>
                        {def.severity}
                      </span>
                    </div>
                    <div className="text-sm font-medium text-slate-900 mt-0.5">{def.title}</div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap">
                      {def.status === 'Open' ? (
                        <>
                          <AlertTriangle className="w-3.5 h-3.5 text-red-700" />
                          <span className="text-red-700">Open</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                          <span className="text-emerald-700">Resolved</span>
                        </>
                      )}
                    </div>
                    <div className="text-[11px] font-mono tabular-nums text-slate-500 mt-0.5">
                      {def.affectedRows.toLocaleString()} rows
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Defect Root-Cause & S3 vs Redshift Sample Diff */}
        <section className="lg:col-span-6 bg-white border border-slate-200 rounded-lg p-6 lg:sticky lg:top-20">
          {activeDefect ? (
            <div className="space-y-5">
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                  <span className="font-mono font-semibold text-slate-800">
                    {activeDefect.id} · {activeDefect.category} · {activeDefect.severity}
                  </span>
                  <span className="font-mono">
                    {activeDefect.detectedByRuleId} / {activeDefect.detectedByTestId}
                  </span>
                </div>
                <h2 className="text-base font-semibold text-slate-900 mt-1">{activeDefect.title}</h2>
                <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">{activeDefect.description}</p>
              </div>

              <div>
                <div className="text-xs font-semibold text-slate-900 mb-2">
                  S3 Source vs. Redshift Target Record Diff
                </div>
                <div className="border border-slate-200 rounded-md overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                        <th className="py-2 px-3">Record Key</th>
                        <th className="py-2 px-3">S3 / Databricks</th>
                        <th className="py-2 px-3">Redshift Target</th>
                        <th className="py-2 px-3">Diagnosis</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 font-mono">
                      {activeDefect.sampleDiff.map((row, idx) => (
                        <tr key={idx}>
                          <td className="py-2 px-3 text-slate-900 whitespace-nowrap">{row.recordKey}</td>
                          <td className="py-2 px-3 text-slate-700">{row.s3SourceValue}</td>
                          <td className="py-2 px-3 text-red-700">{row.redshiftTargetValue}</td>
                          <td className="py-2 px-3 font-sans text-slate-600">{row.issueNote}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-md">
                <div className="text-xs font-semibold text-slate-900">Recommended Glue / Databricks Fix</div>
                <div className="text-xs text-slate-700 mt-1 leading-relaxed">{activeDefect.remediationHint}</div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                <div className="text-xs font-mono tabular-nums text-slate-600">
                  Affected records: {activeDefect.affectedRows.toLocaleString()} in <span className="text-slate-900">{activeDefect.table}</span>
                </div>
                <button
                  type="button"
                  disabled={busy || activeDefect.status === 'Resolved'}
                  onClick={() => onResolveDefect(activeDefect.id)}
                  className="px-4 py-2 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-50 rounded-md transition-colors whitespace-nowrap shrink-0"
                >
                  {activeDefect.status === 'Resolved' ? 'Resolved' : 'Resolve & Re-Run Pipeline'}
                </button>
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
