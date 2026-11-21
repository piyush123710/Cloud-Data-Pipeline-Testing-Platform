import ExcelJS from 'exceljs';
import type { PipelineSnapshot } from '../shared/types.ts';

function styleHeaderRow(row: ExcelJS.Row): void {
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E3A8A' },
    };
    cell.alignment = { vertical: 'middle', horizontal: 'left' };
    cell.border = {
      bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    };
  });
  row.height = 24;
}

export async function generateRunExcelBuffer(snapshot: PipelineSnapshot): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Cloud Data Pipeline Testing Platform';
  workbook.created = new Date();

  const { currentRun, tables, qualityRules, pytestCases, defects } = snapshot;

  // Sheet 1: Run Summary
  const summarySheet = workbook.addWorksheet('Run Summary');
  summarySheet.columns = [
    { header: 'Metric', key: 'metric', width: 36 },
    { header: 'Value', key: 'value', width: 48 },
    { header: 'Notes', key: 'notes', width: 54 },
  ];
  styleHeaderRow(summarySheet.getRow(1));

  summarySheet.addRows([
    { metric: 'Project', value: snapshot.projectMeta.name, notes: snapshot.projectMeta.releaseDate },
    { metric: 'Run ID', value: currentRun.runId, notes: currentRun.triggerSource },
    { metric: 'Executed At (UTC)', value: currentRun.executedAtUtc, notes: `Duration: ${currentRun.durationSec}s` },
    { metric: 'Total Records Processed', value: currentRun.totalRecordsProcessed, notes: 'Across 6 AWS S3 source tables' },
    { metric: 'Source Tables Validated', value: currentRun.tablesValidated, notes: 'customers, products, orders, order_items, payments, shipments' },
    { metric: 'Quality Rules Evaluated', value: `${currentRun.rulesPassed} / ${currentRun.totalRules} Passed`, notes: `${currentRun.rulesFailed} failed across 6 dimensions` },
    { metric: 'Pytest Suite Results', value: `${currentRun.testsPassed} / ${currentRun.totalTests} Passed (${currentRun.passRatePct}%)`, notes: 'Positive, Negative, Boundary, and Failure scenarios' },
    { metric: 'Open Defects Caught', value: currentRun.openDefects, notes: `${currentRun.resolvedDefects} resolved` },
    { metric: 'Pipeline Tech Stack', value: snapshot.projectMeta.techStack.join(', '), notes: 'S3 -> Lambda -> Glue -> Databricks -> Redshift' },
    { metric: 'Run Notes', value: currentRun.notes, notes: '' },
  ]);

  // Sheet 2: Table Reconciliation
  const tableSheet = workbook.addWorksheet('Table Reconciliation');
  tableSheet.columns = [
    { header: 'Table', key: 'tableName', width: 18 },
    { header: 'Format', key: 'fileFormat', width: 10 },
    { header: 'S3 Records', key: 's3Records', width: 14 },
    { header: 'Glue Processed', key: 'glueProcessed', width: 16 },
    { header: 'Databricks Checked', key: 'databricksChecked', width: 18 },
    { header: 'Redshift Loaded', key: 'redshiftLoaded', width: 16 },
    { header: 'Delta', key: 'deltaRecords', width: 12 },
    { header: 'Nulls', key: 'nullCount', width: 10 },
    { header: 'Duplicates', key: 'duplicateCount', width: 12 },
    { header: 'Refresh Lag (min)', key: 'refreshLagMinutes', width: 18 },
    { header: 'Refresh Status', key: 'refreshStatus', width: 18 },
  ];
  styleHeaderRow(tableSheet.getRow(1));
  tables.forEach((t) => tableSheet.addRow(t));

  // Sheet 3: Quality Rules
  const rulesSheet = workbook.addWorksheet('Quality Rules (44)');
  rulesSheet.columns = [
    { header: 'Rule ID', key: 'id', width: 12 },
    { header: 'Dimension', key: 'dimension', width: 16 },
    { header: 'Table', key: 'table', width: 16 },
    { header: 'Method', key: 'reconciliationMethod', width: 14 },
    { header: 'Rule Name', key: 'ruleName', width: 46 },
    { header: 'Expected', key: 'expectedValue', width: 24 },
    { header: 'Actual', key: 'actualValue', width: 30 },
    { header: 'Failed Rows', key: 'failedRowCount', width: 14 },
    { header: 'Status', key: 'status', width: 12 },
  ];
  styleHeaderRow(rulesSheet.getRow(1));
  qualityRules.forEach((r) => rulesSheet.addRow(r));

  // Sheet 4: Pytest Cases
  const pytestSheet = workbook.addWorksheet('Pytest Cases (64)');
  pytestSheet.columns = [
    { header: 'Test ID', key: 'id', width: 12 },
    { header: 'Scenario', key: 'scenario', width: 14 },
    { header: 'Table', key: 'table', width: 16 },
    { header: 'Pytest Node ID', key: 'nodeId', width: 52 },
    { header: 'Title', key: 'title', width: 42 },
    { header: 'Expected', key: 'expectedResult', width: 26 },
    { header: 'Actual', key: 'actualResult', width: 34 },
    { header: 'Duration (ms)', key: 'durationMs', width: 14 },
    { header: 'Status', key: 'status', width: 12 },
  ];
  styleHeaderRow(pytestSheet.getRow(1));
  pytestCases.forEach((tc) => pytestSheet.addRow(tc));

  // Sheet 5: Defect Log
  const defectSheet = workbook.addWorksheet('Defect Log');
  defectSheet.columns = [
    { header: 'Defect ID', key: 'id', width: 12 },
    { header: 'Category', key: 'category', width: 22 },
    { header: 'Severity', key: 'severity', width: 12 },
    { header: 'Table', key: 'table', width: 16 },
    { header: 'Affected Rows', key: 'affectedRows', width: 15 },
    { header: 'Rule ID', key: 'detectedByRuleId', width: 12 },
    { header: 'Test ID', key: 'detectedByTestId', width: 12 },
    { header: 'Status', key: 'status', width: 12 },
    { header: 'Title', key: 'title', width: 44 },
    { header: 'Remediation Hint', key: 'remediationHint', width: 54 },
  ];
  styleHeaderRow(defectSheet.getRow(1));
  defects.forEach((d) => defectSheet.addRow(d));

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
