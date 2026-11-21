import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { pipelineEngine } from './server/pipelineData.ts';
import { generateRunExcelBuffer } from './server/excelExport.ts';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '2mb' }));

  // Current pipeline state
  app.get('/api/pipeline/state', (_req, res) => {
    res.json(pipelineEngine.getSnapshot());
  });

  // Trigger a fresh S3 -> Lambda -> Glue -> Databricks -> Redshift test run
  app.post('/api/pipeline/run', (req, res) => {
    const triggerSource = typeof req.body?.triggerSource === 'string'
      ? req.body.triggerSource
      : 'Manual QA Trigger';
    const notes = typeof req.body?.notes === 'string' ? req.body.notes : undefined;
    const snapshot = pipelineEngine.triggerNewRun(
      triggerSource as 'Lambda S3 Put' | 'Manual QA Trigger' | 'Scheduled Regression' | 'Custom S3 Upload',
      notes
    );
    res.json(snapshot);
  });

  // Resolve a single defect
  app.post('/api/pipeline/fix-defect', (req, res) => {
    const defectId = typeof req.body?.defectId === 'string' ? req.body.defectId : '';
    if (!defectId) {
      res.status(400).json({ error: 'defectId is required' });
      return;
    }
    res.json(pipelineEngine.resolveDefect(defectId));
  });

  // Resolve all defects
  app.post('/api/pipeline/fix-all', (_req, res) => {
    res.json(pipelineEngine.resolveAllDefects());
  });

  // Inject fault or reset baseline
  app.post('/api/pipeline/inject-fault', (req, res) => {
    const faultType = req.body?.faultType;
    if (
      faultType !== 'duplicates' &&
      faultType !== 'nulls' &&
      faultType !== 'broken_refresh' &&
      faultType !== 'reset_baseline'
    ) {
      res.status(400).json({ error: 'Invalid faultType' });
      return;
    }
    res.json(pipelineEngine.injectFault(faultType));
  });

  // Upload custom CSV/JSON source data into one of the 6 S3 source tables
  app.post('/api/pipeline/upload-source', (req, res) => {
    const tableName = typeof req.body?.tableName === 'string' ? req.body.tableName : 'orders';
    const content = typeof req.body?.content === 'string' ? req.body.content : '';
    const format = req.body?.format === 'json' ? 'json' : 'csv';
    if (!content.trim()) {
      res.status(400).json({ error: 'Uploaded file content cannot be empty' });
      return;
    }
    res.json(pipelineEngine.ingestCustomSource(tableName, content, format));
  });

  // Execute reconciliation SQL query
  app.post('/api/sql/execute', (req, res) => {
    const query = typeof req.body?.query === 'string' ? req.body.query : '';
    if (!query.trim()) {
      res.status(400).json({ error: 'SQL query cannot be empty' });
      return;
    }
    res.json(pipelineEngine.executeSql(query));
  });

  // Download multi-sheet Excel (.xlsx) summary for a run
  app.get('/api/runs/:runId/excel', async (req, res) => {
    try {
      const runId = req.params.runId;
      const snap = pipelineEngine.getSnapshotForRun(runId);
      const buffer = await generateRunExcelBuffer(snap);
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="pipeline_qa_summary_${snap.currentRun.runId}.xlsx"`
      );
      res.send(buffer);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to generate Excel workbook',
      });
    }
  });

  // Download executable Python pytest suite file
  app.get('/api/export/pytest', (_req, res) => {
    const snap = pipelineEngine.getSnapshot();
    const header = `"""Cloud Data Pipeline Testing Platform - Automated pytest Suite\nGenerated for ${snap.currentRun.runId} (${snap.currentRun.totalTests} test cases across 6 source tables)\n"""\nimport pytest\n\n`;
    const body = snap.pytestCases
      .map((tc) => `# ${tc.id} [${tc.scenario}] (${tc.table})\n${tc.pythonCode}`)
      .join('\n');
    res.setHeader('Content-Type', 'text/x-python; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="test_s3_redshift_pipeline.py"');
    res.send(header + body);
  });

  // Download Databricks transformation notebook script
  app.get('/api/export/databricks', (_req, res) => {
    const snap = pipelineEngine.getSnapshot();
    const header = `# Databricks notebook source\n# Cloud Data Pipeline Transformation & QA Checks\n# Run: ${snap.currentRun.runId}\n\n`;
    const body = snap.databricksNotebook
      .map((c) => `# COMMAND ----------\n# Cell ${c.cellNumber}: ${c.title} (${c.language})\n${c.language === 'sql' ? `%sql\n${c.code}` : c.code}\n`)
      .join('\n');
    res.setHeader('Content-Type', 'text/x-python; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="s3_redshift_transformation_checks.py"');
    res.send(header + body);
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Cloud Data Pipeline Testing Platform listening on http://localhost:${PORT}`);
  });
}

startServer();
