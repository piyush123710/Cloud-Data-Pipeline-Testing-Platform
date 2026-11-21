import { useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Download, Search } from 'lucide-react';
import type { PytestCase, TestScenario } from '../../shared/types.ts';

interface PytestSuiteViewProps {
  testCases: PytestCase[];
}

const SCENARIOS: Array<'All' | TestScenario> = ['All', 'Positive', 'Negative', 'Boundary', 'Failure'];

export function PytestSuiteView({ testCases }: PytestSuiteViewProps) {
  const [scenarioFilter, setScenarioFilter] = useState<'All' | TestScenario>('All');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Passed' | 'Failed'>('All');
  const [tableFilter, setTableFilter] = useState<string>('All');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string>(testCases[0]?.id ?? 'TC-001');

  const scenarioCounts = useMemo(() => {
    const map: Record<string, { total: number; passed: number }> = {
      All: { total: testCases.length, passed: testCases.filter((t) => t.status === 'Passed').length },
    };
    (['Positive', 'Negative', 'Boundary', 'Failure'] as const).forEach((sc) => {
      const subset = testCases.filter((t) => t.scenario === sc);
      map[sc] = { total: subset.length, passed: subset.filter((t) => t.status === 'Passed').length };
    });
    return map;
  }, [testCases]);

  const filtered = useMemo(() => {
    return testCases.filter((tc) => {
      if (scenarioFilter !== 'All' && tc.scenario !== scenarioFilter) return false;
      if (statusFilter !== 'All' && tc.status !== statusFilter) return false;
      if (tableFilter !== 'All' && tc.table !== tableFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          tc.id.toLowerCase().includes(q) ||
          tc.title.toLowerCase().includes(q) ||
          tc.nodeId.toLowerCase().includes(q) ||
          tc.table.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [testCases, scenarioFilter, statusFilter, tableFilter, search]);

  const selectedTest = useMemo(() => {
    return filtered.find((t) => t.id === selectedId) ?? filtered[0] ?? testCases[0];
  }, [filtered, selectedId, testCases]);

  return (
    <div className="space-y-6">
      {/* Header & Scenario Filter Tabs */}
      <section className="bg-white border border-slate-200 rounded-lg p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">
              Automated pytest Suite ({testCases.length} Test Cases)
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Python pytest test coverage across positive, negative, boundary, and failure scenarios for all 6 source tables.
            </p>
          </div>
          <a
            href="/api/export/pytest"
            download="test_s3_redshift_pipeline.py"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap shrink-0 self-start sm:self-auto"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download pytest Suite (.py)</span>
          </a>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {SCENARIOS.map((sc) => {
              const info = scenarioCounts[sc];
              const active = scenarioFilter === sc;
              return (
                <button
                  key={sc}
                  type="button"
                  onClick={() => setScenarioFilter(sc)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    active ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {sc} ({info.passed}/{info.total})
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search test ID or node..."
                className="pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-md bg-white text-slate-900 w-52"
              />
            </div>

            <select
              value={tableFilter}
              onChange={(e) => setTableFilter(e.target.value)}
              aria-label="Filter tests by table"
              className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-md bg-white text-slate-700"
            >
              <option value="All">All Tables</option>
              <option value="customers">customers</option>
              <option value="products">products</option>
              <option value="orders">orders</option>
              <option value="order_items">order_items</option>
              <option value="payments">payments</option>
              <option value="shipments">shipments</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'All' | 'Passed' | 'Failed')}
              aria-label="Filter tests by outcome"
              className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-md bg-white text-slate-700"
            >
              <option value="All">All Statuses</option>
              <option value="Passed">Passed</option>
              <option value="Failed">Failed</option>
            </select>
          </div>
        </div>
      </section>

      {/* Master-Detail Split Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Test List */}
        <section className="lg:col-span-7 bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="max-h-[640px] overflow-y-auto divide-y divide-slate-200">
            {filtered.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No pytest cases match the active filter.
              </div>
            ) : (
              filtered.map((tc) => {
                const isSelected = selectedTest?.id === tc.id;
                return (
                  <button
                    key={tc.id}
                    type="button"
                    onClick={() => setSelectedId(tc.id)}
                    className={`w-full text-left px-4 py-3 transition-colors flex items-start justify-between gap-3 ${
                      isSelected ? 'bg-blue-50/60' : 'bg-white hover:bg-slate-50'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <span className="font-mono font-semibold text-slate-800">{tc.id}</span>
                        <span aria-hidden="true">·</span>
                        <span>{tc.scenario}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono">{tc.table}</span>
                      </div>
                      <div className="text-sm font-medium text-slate-900 mt-0.5 truncate">
                        {tc.title}
                      </div>
                      <div className="text-[11px] font-mono text-slate-500 mt-0.5 truncate">
                        {tc.nodeId}
                      </div>
                    </div>

                    <div className="shrink-0 text-right">
                      <div className="inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap">
                        {tc.status === 'Passed' ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                            <span className="text-emerald-700">Passed</span>
                          </>
                        ) : (
                          <>
                            <AlertCircle className="w-3.5 h-3.5 text-red-700" />
                            <span className="text-red-700">Failed</span>
                          </>
                        )}
                      </div>
                      <div className="text-[11px] font-mono tabular-nums text-slate-500 mt-0.5">
                        {tc.durationMs} ms
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </section>

        {/* Code & Assertion Inspector */}
        <section className="lg:col-span-5 bg-white border border-slate-200 rounded-lg p-5 lg:sticky lg:top-20">
          {selectedTest ? (
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                  <span className="font-mono font-semibold text-slate-800">
                    {selectedTest.id} · {selectedTest.scenario}
                  </span>
                  <span className="font-mono">Rule {selectedTest.linkedRuleId}</span>
                </div>
                <h2 className="text-base font-semibold text-slate-900 mt-1">
                  {selectedTest.title}
                </h2>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  {selectedTest.description}
                </p>
              </div>

              <div>
                <div className="text-xs font-medium text-slate-700 mb-1.5">Python pytest Implementation</div>
                <pre className="bg-slate-950 text-slate-100 text-xs font-mono p-3.5 rounded-md overflow-x-auto leading-relaxed">
                  <code>{selectedTest.pythonCode}</code>
                </pre>
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-200 text-xs">
                <div className="flex items-start justify-between gap-3">
                  <span className="text-slate-500 shrink-0">Expected</span>
                  <span className="font-mono text-slate-900 text-right">{selectedTest.expectedResult}</span>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <span className="text-slate-500 shrink-0">Actual</span>
                  <span
                    className={`font-mono text-right ${
                      selectedTest.status === 'Passed' ? 'text-emerald-700' : 'text-red-700 font-medium'
                    }`}
                  >
                    {selectedTest.actualResult}
                  </span>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <span className="text-slate-500 shrink-0">Execution Time</span>
                  <span className="font-mono tabular-nums text-slate-700">{selectedTest.durationMs} ms</span>
                </div>
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
