export type QualityDimension =
  | 'Completeness'
  | 'Accuracy'
  | 'Consistency'
  | 'Uniqueness'
  | 'Validity'
  | 'Timeliness';

export type TestScenario = 'Positive' | 'Negative' | 'Boundary' | 'Failure';

export type DefectCategory =
  | 'Duplicate Records'
  | 'Null Violations'
  | 'Broken Refresh'
  | 'Referential Mismatch'
  | 'Validity & Boundary';

export type DefectSeverity = 'Critical' | 'High' | 'Medium';

export type CheckStatus = 'Passed' | 'Failed';

export type ReconciliationMethod = 'Join' | 'Filter' | 'Aggregation';

export interface SourceTableMetric {
  tableName: string;
  s3Path: string;
  fileFormat: 'parquet' | 'csv' | 'json';
  s3Records: number;
  glueProcessed: number;
  databricksChecked: number;
  redshiftLoaded: number;
  deltaRecords: number;
  nullCount: number;
  duplicateCount: number;
  lastRefreshUtc: string;
  refreshLagMinutes: number;
  refreshStatus: 'Healthy' | 'Broken Refresh' | 'Stale SLA';
  primaryKey: string;
}

export interface LambdaTriggerEvent {
  eventId: string;
  timestampUtc: string;
  s3Bucket: string;
  s3Key: string;
  objectSizeMb: number;
  functionName: string;
  targetGlueJob: string;
  durationMs: number;
  status: 'Succeeded' | 'Retried' | 'Timeout Warning';
}

export interface GlueJobRun {
  jobName: string;
  runId: string;
  sourceTable: string;
  dpuAllocated: number;
  recordsRead: number;
  recordsWritten: number;
  recordsQuarantined: number;
  durationSec: number;
  sparkVersion: string;
  status: 'Succeeded' | 'Succeeded with Warnings' | 'Partial Load';
}

export interface DatabricksCell {
  cellNumber: number;
  title: string;
  language: 'python' | 'sql';
  tableScope: string;
  code: string;
  outputSummary: string;
  rowsChecked: number;
  anomaliesFound: number;
  executionSec: number;
  status: CheckStatus;
}

export interface QualityRule {
  id: string;
  dimension: QualityDimension;
  table: string;
  ruleName: string;
  reconciliationMethod: ReconciliationMethod;
  sqlQuery: string;
  expectedValue: string;
  actualValue: string;
  failedRowCount: number;
  status: CheckStatus;
  linkedDefectIds: string[];
}

export interface PytestCase {
  id: string;
  scenario: TestScenario;
  table: string;
  nodeId: string;
  title: string;
  description: string;
  pythonCode: string;
  expectedResult: string;
  actualResult: string;
  durationMs: number;
  status: CheckStatus;
  linkedRuleId: string;
}

export interface SampleDiffRow {
  recordKey: string;
  s3SourceValue: string;
  redshiftTargetValue: string;
  issueNote: string;
}

export interface DefectRecord {
  id: string;
  category: DefectCategory;
  severity: DefectSeverity;
  table: string;
  title: string;
  description: string;
  affectedRows: number;
  detectedByRuleId: string;
  detectedByTestId: string;
  status: 'Open' | 'Resolved';
  remediationHint: string;
  sampleDiff: SampleDiffRow[];
}

export interface PipelineRunSummary {
  runId: string;
  executedAtUtc: string;
  triggerSource: 'Lambda S3 Put' | 'Manual QA Trigger' | 'Scheduled Regression' | 'Custom S3 Upload';
  totalRecordsProcessed: number;
  tablesValidated: number;
  totalRules: number;
  rulesPassed: number;
  rulesFailed: number;
  totalTests: number;
  testsPassed: number;
  testsFailed: number;
  openDefects: number;
  resolvedDefects: number;
  passRatePct: number;
  durationSec: number;
  notes: string;
}

export interface PipelineSnapshot {
  projectMeta: {
    name: string;
    releaseDate: string;
    description: string;
    techStack: string[];
  };
  currentRun: PipelineRunSummary;
  tables: SourceTableMetric[];
  lambdaEvents: LambdaTriggerEvent[];
  glueJobs: GlueJobRun[];
  databricksNotebook: DatabricksCell[];
  qualityRules: QualityRule[];
  pytestCases: PytestCase[];
  defects: DefectRecord[];
  runHistory: PipelineRunSummary[];
}

export interface SqlExecutionResponse {
  query: string;
  executionMs: number;
  rowCount: number;
  columns: string[];
  rows: Array<Record<string, string | number>>;
  sourceEngine: string;
}
