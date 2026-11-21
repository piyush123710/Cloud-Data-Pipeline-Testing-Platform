import { useState, type ChangeEvent } from 'react';
import { AlertTriangle, CheckCircle2, Download, Upload } from 'lucide-react';
import type { DatabricksCell, GlueJobRun, LambdaTriggerEvent } from '../../shared/types.ts';

interface DatabricksEtlViewProps {
  cells: DatabricksCell[];
  glueJobs: GlueJobRun[];
  lambdaEvents: LambdaTriggerEvent[];
  onInjectFault: (faultType: 'duplicates' | 'nulls' | 'broken_refresh' | 'reset_baseline') => Promise<void>;
  onUploadSource: (tableName: string, content: string, format: 'csv' | 'json') => Promise<void>;
  busy: boolean;
}

const SAMPLE_CSV = `order_id,customer_id,total_amount,currency_code
ORD-991001,CUST-1042,149.99,USD
ORD-991001,CUST-1042,149.99,USD
ORD-991002,,89.50,USD
ORD-991003,CUST-1088,-24.00,USD`;

export function DatabricksEtlView({
  cells,
  glueJobs,
  lambdaEvents,
  onInjectFault,
  onUploadSource,
  busy,
}: DatabricksEtlViewProps) {
  const [uploadTable, setUploadTable] = useState('orders');
  const [uploadFormat, setUploadFormat] = useState<'csv' | 'json'>('csv');
  const [uploadContent, setUploadContent] = useState(SAMPLE_CSV);
  const [uploadNotice, setUploadNotice] = useState<string | null>(null);

  function handleFilePick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.name.endsWith('.json')) setUploadFormat('json');
    else setUploadFormat('csv');
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setUploadContent(reader.result);
        setUploadNotice(`Loaded ${file.name} (${file.size.toLocaleString()} bytes) ready for S3 ingestion.`);
      }
    };
    reader.readAsText(file);
  }

  async function handleIngest() {
    setUploadNotice(null);
    await onUploadSource(uploadTable, uploadContent, uploadFormat);
    setUploadNotice(`Uploaded to s3://raw-enterprise-lake/inbound/${uploadTable}/ and executed Lambda -> Glue -> Redshift validation.`);
  }

  return (
    <div className="space-y-8">
      {/* Databricks Notebook Checks */}
      <section className="bg-white border border-slate-200 rounded-lg p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">
              Databricks Transformation Checks Notebook
            </h1>
            <p className="text-xs text-slate-500 mt-0.5 font-mono">
              /Workspace/QA/s3_redshift_transformation_checks.py
            </p>
          </div>
          <a
            href="/api/export/databricks"
            download="s3_redshift_transformation_checks.py"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap shrink-0 self-start sm:self-auto"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download Notebook (.py)</span>
          </a>
        </div>

        <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg overflow-hidden">
          {cells.map((cell) => (
            <div key={cell.cellNumber} className="p-4 bg-white">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2.5">
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-mono font-semibold text-slate-500">In [{cell.cellNumber}]</span>
                  <span className="font-semibold text-slate-900">{cell.title}</span>
                  <span className="text-slate-400" aria-hidden="true">·</span>
                  <span className="font-mono text-slate-500">{cell.language}</span>
                </div>
                <div className="inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap">
                  {cell.status === 'Passed' ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                      <span className="text-emerald-700">Passed ({cell.executionSec}s)</span>
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="w-3.5 h-3.5 text-red-700 shrink-0" />
                      <span className="text-red-700">
                        {cell.anomaliesFound} Anomalies ({cell.executionSec}s)
                      </span>
                    </>
                  )}
                </div>
              </div>

              <pre className="bg-slate-950 text-slate-100 text-xs font-mono p-3.5 rounded-md overflow-x-auto leading-relaxed">
                <code>{cell.code}</code>
              </pre>

              <div className="mt-2.5 text-xs font-mono text-slate-700 bg-slate-50 border border-slate-200 rounded px-3 py-2">
                Out [{cell.cellNumber}]: {cell.outputSummary}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Live S3 File Drop & Fault Simulation */}
      <section className="bg-white border border-slate-200 rounded-lg p-6">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
          <div className="flex-1 space-y-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Simulate S3 Landing File Drop (CSV / JSON)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Upload a local CSV/JSON file or edit the payload below to trigger Lambda, Glue, and pytest validation on real rows.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <select
                value={uploadTable}
                onChange={(e) => setUploadTable(e.target.value)}
                aria-label="Target S3 source table"
                className="px-3 py-1.5 text-xs border border-slate-300 rounded-md bg-white text-slate-900 font-mono"
              >
                <option value="orders">orders</option>
                <option value="customers">customers</option>
                <option value="products">products</option>
                <option value="order_items">order_items</option>
                <option value="payments">payments</option>
                <option value="shipments">shipments</option>
              </select>

              <select
                value={uploadFormat}
                onChange={(e) => setUploadFormat(e.target.value as 'csv' | 'json')}
                aria-label="Source file format"
                className="px-3 py-1.5 text-xs border border-slate-300 rounded-md bg-white text-slate-900 font-mono"
              >
                <option value="csv">CSV</option>
                <option value="json">JSON</option>
              </select>

              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md cursor-pointer transition-colors">
                <Upload className="w-3.5 h-3.5" />
                <span>Choose Local File</span>
                <input type="file" accept=".csv,.json,.txt" onChange={handleFilePick} className="hidden" />
              </label>
            </div>

            <textarea
              value={uploadContent}
              onChange={(e) => setUploadContent(e.target.value)}
              rows={5}
              aria-label="S3 source file content"
              className="w-full font-mono text-xs bg-slate-950 text-slate-100 p-3 rounded-md border border-slate-800"
            />

            <div className="flex items-center justify-between gap-4">
              <div className="text-xs text-slate-600">{uploadNotice ?? 'Sample payload contains 1 duplicate, 1 null, and 1 negative amount.'}</div>
              <button
                type="button"
                disabled={busy}
                onClick={handleIngest}
                className="px-4 py-2 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-50 rounded-md transition-colors whitespace-nowrap shrink-0"
              >
                {busy ? 'Ingesting...' : 'Upload to S3 & Run Tests'}
              </button>
            </div>
          </div>

          <div className="lg:w-80 shrink-0 space-y-3 pt-4 lg:pt-0 lg:pl-6 border-t lg:border-t-0 lg:border-l border-slate-200">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Failure Scenario Simulator</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Inject realistic pipeline faults or reset to the 28-defect baseline snapshot.
              </p>
            </div>
            <div className="space-y-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => onInjectFault('duplicates')}
                className="w-full text-left px-3.5 py-2 text-xs font-medium text-slate-800 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-md transition-colors"
              >
                Inject Duplicate Keys (Glue Retry)
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => onInjectFault('nulls')}
                className="w-full text-left px-3.5 py-2 text-xs font-medium text-slate-800 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-md transition-colors"
              >
                Inject Mandatory Column Nulls
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => onInjectFault('broken_refresh')}
                className="w-full text-left px-3.5 py-2 text-xs font-medium text-slate-800 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-md transition-colors"
              >
                Simulate Broken Redshift Refresh
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => onInjectFault('reset_baseline')}
                className="w-full text-left px-3.5 py-2 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-md transition-colors"
              >
                Reset to 28-Defect Baseline Run
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* AWS Glue & Lambda Telemetry Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200">
            <h2 className="text-sm font-semibold text-slate-900">AWS Glue PySpark Jobs</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                  <th className="py-2.5 px-4">Job Name</th>
                  <th className="py-2.5 px-2 text-right">DPU</th>
                  <th className="py-2.5 px-2 text-right">Read</th>
                  <th className="py-2.5 px-2 text-right">Written</th>
                  <th className="py-2.5 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {glueJobs.map((j) => (
                  <tr key={j.runId} className="hover:bg-slate-50">
                    <td className="py-2.5 px-4 font-mono text-slate-900">{j.jobName}</td>
                    <td className="py-2.5 px-2 text-right font-mono tabular-nums text-slate-600">{j.dpuAllocated}</td>
                    <td className="py-2.5 px-2 text-right font-mono tabular-nums text-slate-800">{j.recordsRead.toLocaleString()}</td>
                    <td className="py-2.5 px-2 text-right font-mono tabular-nums text-slate-800">{j.recordsWritten.toLocaleString()}</td>
                    <td className="py-2.5 px-4 text-slate-700 whitespace-nowrap">{j.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200">
            <h2 className="text-sm font-semibold text-slate-900">AWS Lambda S3 Event Triggers</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                  <th className="py-2.5 px-4">S3 Key</th>
                  <th className="py-2.5 px-2 text-right">Size</th>
                  <th className="py-2.5 px-2 text-right">Duration</th>
                  <th className="py-2.5 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {lambdaEvents.map((ev) => (
                  <tr key={ev.eventId} className="hover:bg-slate-50">
                    <td className="py-2.5 px-4 font-mono text-slate-900 truncate max-w-[200px]">
                      {ev.s3Key.replace('inbound/', '')}
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono tabular-nums text-slate-600">
                      {ev.objectSizeMb} MB
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono tabular-nums text-slate-700">
                      {ev.durationMs} ms
                    </td>
                    <td className="py-2.5 px-4 text-slate-700 whitespace-nowrap">{ev.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
