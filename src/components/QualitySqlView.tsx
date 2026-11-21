import { useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Play, Search } from 'lucide-react';
import type { QualityDimension, QualityRule, SqlExecutionResponse } from '../../shared/types.ts';

interface QualitySqlViewProps {
  rules: QualityRule[];
  onExecuteSql: (query: string) => Promise<SqlExecutionResponse>;
  onJumpToDefect: (defectId: string) => void;
}

const DIMENSIONS: Array<'All' | QualityDimension> = [
  'All',
  'Completeness',
  'Accuracy',
  'Consistency',
  'Uniqueness',
  'Validity',
  'Timeliness',
];

const PRESET_QUERIES: Array<{ label: string; sql: string }> = [
  {
    label: '6-Table S3 vs Redshift Parity',
    sql: 'SELECT table_name, s3_records, glue_processed, redshift_loaded, delta, refresh_status FROM reconciliation_summary;',
  },
  {
    label: 'Join Orders & Order Items Variance',
    sql: 'SELECT o.order_id, o.total_amount, SUM(oi.quantity * oi.unit_price) AS items_sum FROM public.orders o JOIN public.order_items oi ON o.order_id = oi.order_id GROUP BY 1,2 HAVING ABS(o.total_amount - items_sum) > 0.01;',
  },
  {
    label: 'Group By Duplicate PK Audit',
    sql: 'SELECT table_name, COUNT(*) AS duplicate_rows FROM duplicate_audit GROUP BY table_name HAVING COUNT(*) > 1;',
  },
  {
    label: 'Active QA Defect Summary',
    sql: 'SELECT defect_id, table_name, category, severity, affected_rows, status FROM qa_defect_log;',
  },
];

export function QualitySqlView({ rules, onExecuteSql, onJumpToDefect }: QualitySqlViewProps) {
  const [selectedDimension, setSelectedDimension] = useState<'All' | QualityDimension>('All');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Passed' | 'Failed'>('All');
  const [tableFilter, setTableFilter] = useState<string>('All');
  const [search, setSearch] = useState('');

  const [sqlText, setSqlText] = useState(PRESET_QUERIES[0].sql);
  const [sqlResult, setSqlResult] = useState<SqlExecutionResponse | null>(null);
  const [sqlRunning, setSqlRunning] = useState(false);
  const [sqlError, setSqlError] = useState<string | null>(null);

  const dimensionStats = useMemo(() => {
    return DIMENSIONS.filter((d): d is QualityDimension => d !== 'All').map((dim) => {
      const items = rules.filter((r) => r.dimension === dim);
      const passed = items.filter((r) => r.status === 'Passed').length;
      return { dimension: dim, total: items.length, passed, failed: items.length - passed };
    });
  }, [rules]);

  const filteredRules = useMemo(() => {
    return rules.filter((r) => {
      if (selectedDimension !== 'All' && r.dimension !== selectedDimension) return false;
      if (statusFilter !== 'All' && r.status !== statusFilter) return false;
      if (tableFilter !== 'All' && r.table !== tableFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          r.id.toLowerCase().includes(q) ||
          r.ruleName.toLowerCase().includes(q) ||
          r.table.toLowerCase().includes(q) ||
          r.sqlQuery.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [rules, selectedDimension, statusFilter, tableFilter, search]);

  async function runQuery(queryToRun: string) {
    setSqlText(queryToRun);
    setSqlRunning(true);
    setSqlError(null);
    try {
      const res = await onExecuteSql(queryToRun);
      setSqlResult(res);
    } catch (err) {
      setSqlError(err instanceof Error ? err.message : 'SQL execution failed');
    } finally {
      setSqlRunning(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* 6 Data Quality Dimensions Overview */}
      <section className="bg-white border border-slate-200 rounded-lg p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">
              Data Quality Reconciliation ({rules.length} Rules across 6 Dimensions)
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Source-to-warehouse SQL checks using joins, filters, and aggregations across completeness, accuracy, consistency, uniqueness, validity, and timeliness.
            </p>
          </div>
          <div className="text-xs font-mono tabular-nums text-slate-600 shrink-0">
            {rules.filter((r) => r.status === 'Passed').length} Passed · {rules.filter((r) => r.status === 'Failed').length} Failed
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {dimensionStats.map((stat) => {
            const active = selectedDimension === stat.dimension;
            return (
              <button
                key={stat.dimension}
                type="button"
                onClick={() => setSelectedDimension(active ? 'All' : stat.dimension)}
                className={`text-left p-3.5 rounded-lg border transition-colors ${
                  active
                    ? 'border-blue-700 bg-blue-50/60'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <div className="text-xs font-medium text-slate-600 truncate">{stat.dimension}</div>
                <div className="text-lg font-bold font-mono tabular-nums text-slate-900 mt-1">
                  {stat.passed}/{stat.total}
                </div>
                <div className="text-xs mt-1 text-slate-500">
                  {stat.failed === 0 ? 'All passing' : `${stat.failed} failed`}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Interactive SQL Reconciliation Console */}
      <section className="bg-white border border-slate-200 rounded-lg p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 mb-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Interactive SQL Reconciliation Runner
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Click &ldquo;Run SQL&rdquo; on any rule below or run a custom Redshift/S3 reconciliation query.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {PRESET_QUERIES.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => runQuery(preset.sql)}
                className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap shrink-0"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <textarea
            value={sqlText}
            onChange={(e) => setSqlText(e.target.value)}
            rows={3}
            aria-label="SQL reconciliation query editor"
            className="w-full font-mono text-xs bg-slate-950 text-slate-100 p-3.5 rounded-lg border border-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
          <div className="flex items-center justify-between gap-4">
            <div className="text-xs text-slate-500">
              {sqlResult
                ? `${sqlResult.sourceEngine} · ${sqlResult.rowCount} rows returned in ${sqlResult.executionMs}ms`
                : 'Target: Amazon Redshift & S3 Spectrum Staging'}
            </div>
            <button
              type="button"
              onClick={() => runQuery(sqlText)}
              disabled={sqlRunning}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-50 rounded-md transition-colors whitespace-nowrap shrink-0"
            >
              <Play className="w-3.5 h-3.5" />
              <span>{sqlRunning ? 'Executing...' : 'Execute SQL'}</span>
            </button>
          </div>
        </div>

        {sqlError && (
          <div className="mt-4 p-3 rounded-md bg-red-50 border border-red-200 text-xs text-red-800">
            {sqlError}
          </div>
        )}

        {sqlResult && sqlResult.rows.length > 0 && (
          <div className="mt-4 border border-slate-200 rounded-md overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                  {sqlResult.columns.map((col) => (
                    <th key={col} className="py-2 px-3 font-mono whitespace-nowrap">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs font-mono">
                {sqlResult.rows.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-50">
                    {sqlResult.columns.map((col) => (
                      <td key={col} className="py-2 px-3 tabular-nums text-slate-800 whitespace-nowrap">
                        {String(row[col] ?? '')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 44-Rule Table */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter rule ID, SQL, or table..."
                className="pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-md bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 w-60"
              />
            </div>

            <select
              value={tableFilter}
              onChange={(e) => setTableFilter(e.target.value)}
              aria-label="Filter by table"
              className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-md bg-white text-slate-700"
            >
              <option value="All">All 6 Tables</option>
              <option value="customers">customers</option>
              <option value="products">products</option>
              <option value="orders">orders</option>
              <option value="order_items">order_items</option>
              <option value="payments">payments</option>
              <option value="shipments">shipments</option>
            </select>

            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-md">
              {(['All', 'Passed', 'Failed'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                    statusFilter === st
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          <div className="text-xs text-slate-500 font-mono tabular-nums">
            Showing {filteredRules.length} of {rules.length} rules
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                <th className="py-2.5 px-4">Rule</th>
                <th className="py-2.5 px-3">Dimension · Method</th>
                <th className="py-2.5 px-3">Table</th>
                <th className="py-2.5 px-3">Expected vs Actual</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs">
              {filteredRules.map((rule) => (
                <tr key={rule.id} className="hover:bg-slate-50/80 transition-colors align-top">
                  <td className="py-3 px-4 max-w-md">
                    <div className="font-medium text-slate-900">
                      <span className="font-mono text-slate-500 mr-1.5">{rule.id}</span>
                      {rule.ruleName}
                    </div>
                    <div className="font-mono text-[11px] text-slate-500 mt-1 truncate max-w-md">
                      {rule.sqlQuery}
                    </div>
                  </td>
                  <td className="py-3 px-3 whitespace-nowrap text-slate-700">
                    <div>{rule.dimension}</div>
                    <div className="text-[11px] text-slate-500">{rule.reconciliationMethod}</div>
                  </td>
                  <td className="py-3 px-3 font-mono text-slate-800 whitespace-nowrap">{rule.table}</td>
                  <td className="py-3 px-3 font-mono tabular-nums">
                    <div className="text-slate-600">Exp: {rule.expectedValue}</div>
                    <div className={rule.status === 'Passed' ? 'text-emerald-700' : 'text-red-700 font-medium'}>
                      Act: {rule.actualValue}
                    </div>
                  </td>
                  <td className="py-3 px-3 whitespace-nowrap">
                    <div className="inline-flex items-center gap-1.5 font-medium">
                      {rule.status === 'Passed' ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                          <span className="text-emerald-700">Passed</span>
                        </>
                      ) : (
                        <>
                          <AlertCircle className="w-3.5 h-3.5 text-red-700 shrink-0" />
                          <span className="text-red-700">Failed</span>
                        </>
                      )}
                    </div>
                    {rule.linkedDefectIds.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {rule.linkedDefectIds.map((defId) => (
                          <button
                            key={defId}
                            type="button"
                            onClick={() => onJumpToDefect(defId)}
                            className="font-mono text-[11px] text-blue-700 hover:underline"
                          >
                            {defId}
                          </button>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => runQuery(rule.sqlQuery)}
                      className="px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50 border border-blue-200 rounded transition-colors"
                    >
                      Run SQL
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
