import type {
  DatabricksCell,
  DefectCategory,
  DefectRecord,
  GlueJobRun,
  LambdaTriggerEvent,
  PipelineRunSummary,
  PipelineSnapshot,
  PytestCase,
  QualityDimension,
  QualityRule,
  ReconciliationMethod,
  SourceTableMetric,
  SqlExecutionResponse,
  TestScenario,
} from '../shared/types.ts';

interface BaseTableConfig {
  tableName: string;
  s3Path: string;
  fileFormat: 'parquet' | 'csv' | 'json';
  s3Records: number;
  primaryKey: string;
  lastRefreshUtc: string;
}

const BASE_TABLES: BaseTableConfig[] = [
  {
    tableName: 'customers',
    s3Path: 's3://raw-enterprise-lake/inbound/customers/raw_customers_20261120.parquet',
    fileFormat: 'parquet',
    s3Records: 8420,
    primaryKey: 'customer_id',
    lastRefreshUtc: '2026-11-20T18:45:12Z',
  },
  {
    tableName: 'products',
    s3Path: 's3://raw-enterprise-lake/inbound/products/raw_products_20261120.csv',
    fileFormat: 'csv',
    s3Records: 2160,
    primaryKey: 'product_id',
    lastRefreshUtc: '2026-11-20T18:46:04Z',
  },
  {
    tableName: 'orders',
    s3Path: 's3://raw-enterprise-lake/inbound/orders/raw_orders_20261120.json',
    fileFormat: 'json',
    s3Records: 15840,
    primaryKey: 'order_id',
    lastRefreshUtc: '2026-11-20T18:47:39Z',
  },
  {
    tableName: 'order_items',
    s3Path: 's3://raw-enterprise-lake/inbound/order_items/raw_order_items_20261120.parquet',
    fileFormat: 'parquet',
    s3Records: 16320,
    primaryKey: 'order_item_id',
    lastRefreshUtc: '2026-11-20T18:48:18Z',
  },
  {
    tableName: 'payments',
    s3Path: 's3://raw-enterprise-lake/inbound/payments/raw_payments_20261120.csv',
    fileFormat: 'csv',
    s3Records: 5410,
    primaryKey: 'payment_id',
    lastRefreshUtc: '2026-11-20T18:49:02Z',
  },
  {
    tableName: 'shipments',
    s3Path: 's3://raw-enterprise-lake/inbound/shipments/raw_shipments_20261120.parquet',
    fileFormat: 'parquet',
    s3Records: 4330,
    primaryKey: 'shipment_id',
    lastRefreshUtc: '2026-11-19T19:12:40Z',
  },
];

function createInitialDefects(): DefectRecord[] {
  return [
    {
      id: 'DEF-001',
      category: 'Duplicate Records',
      severity: 'Critical',
      table: 'orders',
      title: 'Duplicate order_id rows ingested after Glue retry',
      description: 'AWS Glue job glue-etl-orders re-processed partition dt=2026-11-20 without upsert staging merge, yielding 38 duplicate order_id keys in Redshift.',
      affectedRows: 38,
      detectedByRuleId: 'DQ-24',
      detectedByTestId: 'TC-026',
      status: 'Open',
      remediationHint: 'Add ROW_NUMBER() OVER (PARTITION BY order_id ORDER BY updated_at DESC) = 1 deduplication in Databricks staging before Redshift MERGE.',
      sampleDiff: [
        { recordKey: 'ORD-904112', s3SourceValue: '1 row ($184.50, status=PAID)', redshiftTargetValue: '2 rows ($184.50 x 2)', issueNote: 'Duplicate PK inflated SUM(total_amount)' },
        { recordKey: 'ORD-904189', s3SourceValue: '1 row ($62.00, status=PAID)', redshiftTargetValue: '2 rows ($62.00 x 2)', issueNote: 'Duplicate PK from retry shard' },
      ],
    },
    {
      id: 'DEF-002',
      category: 'Duplicate Records',
      severity: 'High',
      table: 'customers',
      title: 'Duplicate customer email addresses across regional feeds',
      description: 'Customer accounts exported from EU and US S3 prefixes share identical normalized email values with distinct surrogate keys.',
      affectedRows: 24,
      detectedByRuleId: 'DQ-22',
      detectedByTestId: 'TC-022',
      status: 'Open',
      remediationHint: 'Normalize LOWER(TRIM(email)) and enforce composite uniqueness check in Databricks transformation notebook.',
      sampleDiff: [
        { recordKey: 'CUST-10492', s3SourceValue: 'elena.v@northstar.io', redshiftTargetValue: 'CUST-10492 & CUST-88310', issueNote: 'Duplicate normalized email' },
        { recordKey: 'CUST-11804', s3SourceValue: 'm.patel@harborlabs.com', redshiftTargetValue: 'CUST-11804 & CUST-89002', issueNote: 'Case mismatch bypassed exact match' },
      ],
    },
    {
      id: 'DEF-003',
      category: 'Duplicate Records',
      severity: 'Critical',
      table: 'payments',
      title: 'Repeated payment_id settlement lines in Redshift',
      description: 'Stripe webhook CSV drop contained overlapping settlement windows; 19 payment_id records were appended twice into analytics_dw.public.payments.',
      affectedRows: 19,
      detectedByRuleId: 'DQ-26',
      detectedByTestId: 'TC-031',
      status: 'Open',
      remediationHint: 'Filter by settlement_batch_id watermark and enforce primary key staging delete-insert.',
      sampleDiff: [
        { recordKey: 'PAY-77301', s3SourceValue: '1 settled row ($410.00)', redshiftTargetValue: '2 rows ($820.00 net)', issueNote: 'Double counted settlement revenue' },
      ],
    },
    {
      id: 'DEF-004',
      category: 'Duplicate Records',
      severity: 'Medium',
      table: 'products',
      title: 'Duplicate SKU entries with trailing whitespace',
      description: 'CSV catalog feed includes 11 SKUs differing only by trailing spaces, passing raw string equality into Redshift.',
      affectedRows: 11,
      detectedByRuleId: 'DQ-23',
      detectedByTestId: 'TC-024',
      status: 'Open',
      remediationHint: 'Apply TRIM(UPPER(sku)) during Glue DynamicFrame mapping.',
      sampleDiff: [
        { recordKey: 'SKU-4409', s3SourceValue: '"SKU-4409 "', redshiftTargetValue: '"SKU-4409" & "SKU-4409 "', issueNote: 'Trailing space created duplicate catalog row' },
      ],
    },
    {
      id: 'DEF-005',
      category: 'Duplicate Records',
      severity: 'High',
      table: 'order_items',
      title: 'Composite (order_id, product_id) duplicate line items',
      description: 'Line item parquet export emitted duplicate item rows without line_seq discriminator.',
      affectedRows: 29,
      detectedByRuleId: 'DQ-25',
      detectedByTestId: 'TC-028',
      status: 'Open',
      remediationHint: 'Aggregate quantity by (order_id, product_id) or enforce deterministic order_item_id hash.',
      sampleDiff: [
        { recordKey: 'OI-551902', s3SourceValue: 'ORD-90122 / PROD-312 qty=1', redshiftTargetValue: '2 identical rows qty=1', issueNote: 'Duplicate line item inflates unit volume' },
      ],
    },
    {
      id: 'DEF-006',
      category: 'Duplicate Records',
      severity: 'Medium',
      table: 'shipments',
      title: 'Duplicate tracking_number across carrier manifest updates',
      description: 'Carrier update file re-sent 14 tracking numbers without marking prior label event as superseded.',
      affectedRows: 14,
      detectedByRuleId: 'DQ-27',
      detectedByTestId: 'TC-034',
      status: 'Open',
      remediationHint: 'Retain latest carrier_event_ts per tracking_number in Databricks Gold check.',
      sampleDiff: [
        { recordKey: 'TRK-1Z999041', s3SourceValue: 'IN_TRANSIT (2026-11-19)', redshiftTargetValue: 'LABEL_CREATED + IN_TRANSIT', issueNote: '2 active rows for 1 tracking_number' },
      ],
    },
    {
      id: 'DEF-007',
      category: 'Duplicate Records',
      severity: 'Medium',
      table: 'customers',
      title: 'Duplicate phone_hash identifiers in loyalty segment',
      description: '7 loyalty members exist under duplicate customer_id records sharing identical E.164 phone numbers.',
      affectedRows: 7,
      detectedByRuleId: 'DQ-28',
      detectedByTestId: 'TC-036',
      status: 'Open',
      remediationHint: 'Merge customer master records using phone_hash survivorship rules.',
      sampleDiff: [
        { recordKey: 'CUST-44219', s3SourceValue: '+14155550194', redshiftTargetValue: '2 active customer profiles', issueNote: 'Split loyalty spend across 2 IDs' },
      ],
    },
    {
      id: 'DEF-008',
      category: 'Null Violations',
      severity: 'Critical',
      table: 'orders',
      title: 'Null customer_id values in guest checkout JSON events',
      description: 'JSON schema drift allowed 64 guest checkout events with missing customer_id into Redshift orders table.',
      affectedRows: 64,
      detectedByRuleId: 'DQ-03',
      detectedByTestId: 'TC-021',
      status: 'Open',
      remediationHint: 'Quarantine null customer_id records in Glue or map guest_profile_id fallback.',
      sampleDiff: [
        { recordKey: 'ORD-910044', s3SourceValue: 'customer_id: null', redshiftTargetValue: 'customer_id: NULL', issueNote: 'Breaks INNER JOIN with customers' },
        { recordKey: 'ORD-910118', s3SourceValue: 'customer_id: ""', redshiftTargetValue: 'customer_id: NULL', issueNote: 'Empty string coerced to NULL by COPY' },
      ],
    },
    {
      id: 'DEF-009',
      category: 'Null Violations',
      severity: 'High',
      table: 'customers',
      title: 'Null email field on 31 newly onboarded B2B accounts',
      description: 'Mandatory contact email column is NULL in Redshift despite non-null warehouse constraint expectation.',
      affectedRows: 31,
      detectedByRuleId: 'DQ-02',
      detectedByTestId: 'TC-023',
      status: 'Open',
      remediationHint: 'Route incomplete B2B rows to s3://raw-enterprise-lake/quarantine/customers/.',
      sampleDiff: [
        { recordKey: 'CUST-88912', s3SourceValue: 'email: null', redshiftTargetValue: 'email: NULL', issueNote: 'Required outreach column missing' },
      ],
    },
    {
      id: 'DEF-010',
      category: 'Null Violations',
      severity: 'High',
      table: 'payments',
      title: 'Null payment_method on 18 Apple Pay wallet transactions',
      description: 'New wallet_type JSON attribute was not mapped in Glue CSV parser, leaving payment_method NULL.',
      affectedRows: 18,
      detectedByRuleId: 'DQ-05',
      detectedByTestId: 'TC-025',
      status: 'Open',
      remediationHint: 'Update Glue catalog classifier to map wallet_type -> payment_method.',
      sampleDiff: [
        { recordKey: 'PAY-79102', s3SourceValue: 'wallet_type: APPLE_PAY', redshiftTargetValue: 'payment_method: NULL', issueNote: 'Unmapped column dropped during ETL' },
      ],
    },
    {
      id: 'DEF-011',
      category: 'Null Violations',
      severity: 'Critical',
      table: 'order_items',
      title: 'Null unit_price in promotional bundle items',
      description: '42 promotional bundle order items arrived with NULL unit_price instead of 0.00 decimal value.',
      affectedRows: 42,
      detectedByRuleId: 'DQ-04',
      detectedByTestId: 'TC-027',
      status: 'Open',
      remediationHint: 'Coalesce NULL promotional unit_price to 0.00 in Databricks transformation check.',
      sampleDiff: [
        { recordKey: 'OI-560412', s3SourceValue: 'unit_price: null, promo=FREE', redshiftTargetValue: 'unit_price: NULL', issueNote: 'Causes NULL propagation in line_total' },
      ],
    },
    {
      id: 'DEF-012',
      category: 'Null Violations',
      severity: 'Medium',
      table: 'products',
      title: 'Null category_name for 15 seasonal hardware SKUs',
      description: 'New product department code lacked lookup entry in Glue dimension mapping, writing NULL category_name.',
      affectedRows: 15,
      detectedByRuleId: 'DQ-06',
      detectedByTestId: 'TC-029',
      status: 'Open',
      remediationHint: 'Refresh product_category_map.json in S3 reference bucket before Glue run.',
      sampleDiff: [
        { recordKey: 'PROD-2091', s3SourceValue: 'dept_code: HW-99', redshiftTargetValue: 'category_name: NULL', issueNote: 'Missing reference lookup entry' },
      ],
    },
    {
      id: 'DEF-013',
      category: 'Null Violations',
      severity: 'High',
      table: 'shipments',
      title: 'Null shipped_at timestamp on fulfilled manifest rows',
      description: '27 rows marked status=SHIPPED lack a shipped_at UTC timestamp.',
      affectedRows: 27,
      detectedByRuleId: 'DQ-07',
      detectedByTestId: 'TC-030',
      status: 'Open',
      remediationHint: 'Enforce conditional check: status = SHIPPED => shipped_at IS NOT NULL.',
      sampleDiff: [
        { recordKey: 'SHP-30192', s3SourceValue: 'status=SHIPPED, shipped_at=""', redshiftTargetValue: 'status=SHIPPED, shipped_at=NULL', issueNote: 'Transit SLA calculation yields NULL' },
      ],
    },
    {
      id: 'DEF-014',
      category: 'Null Violations',
      severity: 'Medium',
      table: 'orders',
      title: 'Null currency_code defaulting to missing FX conversion',
      description: '12 cross-border orders arrived with NULL currency_code, failing USD normalization.',
      affectedRows: 12,
      detectedByRuleId: 'DQ-08',
      detectedByTestId: 'TC-032',
      status: 'Open',
      remediationHint: 'Derive currency_code from billing_country ISO lookup when NULL.',
      sampleDiff: [
        { recordKey: 'ORD-915502', s3SourceValue: 'country=CA, currency=null', redshiftTargetValue: 'currency_code=NULL, usd_amt=NULL', issueNote: 'Excluded from USD revenue rollup' },
      ],
    },
    {
      id: 'DEF-015',
      category: 'Broken Refresh',
      severity: 'Critical',
      table: 'shipments',
      title: 'Broken Redshift refresh on shipments table (23h stale)',
      description: 'Redshift COPY manifest for shipments stopped at 2026-11-19T19:12:40Z due to IAM role session expiry, leaving 420 new S3 records unloaded.',
      affectedRows: 420,
      detectedByRuleId: 'DQ-38',
      detectedByTestId: 'TC-051',
      status: 'Open',
      remediationHint: 'Rotate Redshift COPY IAM role credentials and re-trigger Lambda -> Glue shipments batch.',
      sampleDiff: [
        { recordKey: 'BATCH-20261120', s3SourceValue: '4,330 rows (latest 2026-11-20 18:49Z)', redshiftTargetValue: '3,910 rows (latest 2026-11-19 19:12Z)', issueNote: '420 records missing from Redshift' },
      ],
    },
    {
      id: 'DEF-016',
      category: 'Broken Refresh',
      severity: 'Critical',
      table: 'orders',
      title: 'Truncated hourly partition in Redshift orders refresh',
      description: '18:00 UTC Lambda trigger fired before multi-part S3 JSON upload finished, causing 112 orders to be skipped in Redshift.',
      affectedRows: 112,
      detectedByRuleId: 'DQ-01',
      detectedByTestId: 'TC-052',
      status: 'Open',
      remediationHint: 'Trigger Lambda only on _SUCCESS marker file instead of partial part-*.json uploads.',
      sampleDiff: [
        { recordKey: 'PART-1800Z', s3SourceValue: '15,840 records across 4 shards', redshiftTargetValue: '15,728 records (3 shards loaded)', issueNote: 'Shard 4 missed by premature trigger' },
      ],
    },
    {
      id: 'DEF-017',
      category: 'Broken Refresh',
      severity: 'High',
      table: 'payments',
      title: 'Stale watermark lag > 90 mins on payments warehouse view',
      description: 'Payments Redshift materialized refresh lagged 94 minutes behind S3 landing timestamp after Glue worker OOM restart.',
      affectedRows: 85,
      detectedByRuleId: 'DQ-40',
      detectedByTestId: 'TC-055',
      status: 'Open',
      remediationHint: 'Increase Glue worker type from G.1X to G.2X and refresh Redshift MV.',
      sampleDiff: [
        { recordKey: 'MAX(updated_at)', s3SourceValue: '2026-11-20T18:49:02Z', redshiftTargetValue: '2026-11-20T17:15:00Z', issueNote: '94 min SLA breach (threshold <= 60 min)' },
      ],
    },
    {
      id: 'DEF-018',
      category: 'Broken Refresh',
      severity: 'High',
      table: 'order_items',
      title: 'Uncommitted Redshift staging swap left delta rows out',
      description: 'Staging swap transaction rolled back on lock timeout, leaving 48 delta rows unmerged.',
      affectedRows: 48,
      detectedByRuleId: 'DQ-42',
      detectedByTestId: 'TC-058',
      status: 'Open',
      remediationHint: 'Configure lock_timeout = 30000ms and retry swap in Redshift Stored Procedure.',
      sampleDiff: [
        { recordKey: 'STG-SWAP-04', s3SourceValue: '16,320 rows staged', redshiftTargetValue: '16,272 rows live', issueNote: '48 rows stranded in stg_order_items' },
      ],
    },
    {
      id: 'DEF-019',
      category: 'Referential Mismatch',
      severity: 'Critical',
      table: 'order_items',
      title: 'Orphan product_id keys absent from products dimension',
      description: 'LEFT JOIN order_items -> products identified 23 line items referencing retired SKUs missing from products.',
      affectedRows: 23,
      detectedByRuleId: 'DQ-17',
      detectedByTestId: 'TC-053',
      status: 'Open',
      remediationHint: 'Load archived_products.csv into products dimension with is_active=false.',
      sampleDiff: [
        { recordKey: 'OI-558210', s3SourceValue: 'product_id=PROD-9904', redshiftTargetValue: 'products.product_id IS NULL', issueNote: 'Orphan FK drops line item in BI join' },
      ],
    },
    {
      id: 'DEF-020',
      category: 'Referential Mismatch',
      severity: 'Critical',
      table: 'orders',
      title: 'Order total_amount diverges from sum of order_items',
      description: 'Aggregation join between orders and order_items shows 34 orders where header total_amount differs from SUM(qty * unit_price) + tax - discount.',
      affectedRows: 34,
      detectedByRuleId: 'DQ-11',
      detectedByTestId: 'TC-041',
      status: 'Open',
      remediationHint: 'Reconcile discount rounding precision (DECIMAL(12,2)) in Databricks notebook.',
      sampleDiff: [
        { recordKey: 'ORD-908411', s3SourceValue: 'header=$129.99, items_sum=$134.99', redshiftTargetValue: 'variance = -$5.00', issueNote: 'Coupon discount omitted from line items' },
      ],
    },
    {
      id: 'DEF-021',
      category: 'Referential Mismatch',
      severity: 'High',
      table: 'payments',
      title: 'Settled payments referencing missing order_id in Redshift',
      description: '19 payments belong to orders skipped in shard 4 premature Lambda load, creating orphan payment rows.',
      affectedRows: 19,
      detectedByRuleId: 'DQ-18',
      detectedByTestId: 'TC-054',
      status: 'Open',
      remediationHint: 'Enforce parent-first DAG ordering: orders -> order_items -> payments.',
      sampleDiff: [
        { recordKey: 'PAY-80412', s3SourceValue: 'order_id=ORD-919801', redshiftTargetValue: 'orders.order_id IS NULL', issueNote: 'Child loaded before parent shard' },
      ],
    },
    {
      id: 'DEF-022',
      category: 'Referential Mismatch',
      severity: 'High',
      table: 'shipments',
      title: 'Status mismatch between orders (DELIVERED) and shipments (PENDING)',
      description: 'Cross-table consistency check flagged 36 orders marked DELIVERED while linked shipment remains PENDING.',
      affectedRows: 36,
      detectedByRuleId: 'DQ-19',
      detectedByTestId: 'TC-057',
      status: 'Open',
      remediationHint: 'Restore shipments incremental refresh to sync latest carrier delivery events.',
      sampleDiff: [
        { recordKey: 'ORD-902114', s3SourceValue: 'orders.status=DELIVERED', redshiftTargetValue: 'shipments.status=PENDING', issueNote: 'Cross-table state conflict' },
      ],
    },
    {
      id: 'DEF-023',
      category: 'Referential Mismatch',
      severity: 'Medium',
      table: 'payments',
      title: 'Paid amount exceeds order total_amount beyond tolerance',
      description: '9 orders have captured payment totals exceeding order_amount + $0.05 rounding tolerance.',
      affectedRows: 9,
      detectedByRuleId: 'DQ-13',
      detectedByTestId: 'TC-043',
      status: 'Open',
      remediationHint: 'Separate tip/refund adjustments into payment_adjustments column.',
      sampleDiff: [
        { recordKey: 'ORD-907731', s3SourceValue: 'order_total=$94.00', redshiftTargetValue: 'paid_sum=$104.00', issueNote: '+$10.00 unattributed over-capture' },
      ],
    },
    {
      id: 'DEF-024',
      category: 'Validity & Boundary',
      severity: 'High',
      table: 'products',
      title: 'Negative unit_price values in clearance CSV upload',
      description: '9 clearance SKUs were uploaded with negative unit_price (-14.50) instead of positive price + discount_pct.',
      affectedRows: 9,
      detectedByRuleId: 'DQ-29',
      detectedByTestId: 'TC-033',
      status: 'Open',
      remediationHint: 'Reject negative unit_price < 0 in Glue schema validator and alert merchandiser.',
      sampleDiff: [
        { recordKey: 'PROD-1844', s3SourceValue: 'unit_price: -14.50', redshiftTargetValue: 'unit_price: -14.50', issueNote: 'Violates CHECK (unit_price >= 0)' },
      ],
    },
    {
      id: 'DEF-025',
      category: 'Validity & Boundary',
      severity: 'Medium',
      table: 'customers',
      title: 'Malformed email syntax failing RFC-5322 regex check',
      description: '22 customer records contain spaces or missing TLD dots (e.g., user@domaincom) in email column.',
      affectedRows: 22,
      detectedByRuleId: 'DQ-30',
      detectedByTestId: 'TC-035',
      status: 'Open',
      remediationHint: 'Validate email regex in Databricks and flag invalid contacts for CRM cleanup.',
      sampleDiff: [
        { recordKey: 'CUST-51029', s3SourceValue: 'email: "j.doe@gmailcom"', redshiftTargetValue: 'email: "j.doe@gmailcom"', issueNote: 'Missing TLD separator' },
      ],
    },
    {
      id: 'DEF-026',
      category: 'Validity & Boundary',
      severity: 'High',
      table: 'orders',
      title: 'Boundary violation: future order_created_at timestamps',
      description: '13 orders contain timezone-shifted timestamps > NOW() + 5 minutes due to local IST/UTC offset bug.',
      affectedRows: 13,
      detectedByRuleId: 'DQ-43',
      detectedByTestId: 'TC-045',
      status: 'Open',
      remediationHint: 'Force explicit UTC conversion to_utc_timestamp() in PySpark Glue script.',
      sampleDiff: [
        { recordKey: 'ORD-918204', s3SourceValue: '2026-11-21T00:14:00Z', redshiftTargetValue: '2026-11-21T00:14:00Z', issueNote: '+5h30m ahead of UTC pipeline clock' },
      ],
    },
    {
      id: 'DEF-027',
      category: 'Validity & Boundary',
      severity: 'Medium',
      table: 'order_items',
      title: 'Boundary error: quantity = 0 on active non-cancelled lines',
      description: '16 order_items rows have quantity = 0 while parent order status is CONFIRMED.',
      affectedRows: 16,
      detectedByRuleId: 'DQ-32',
      detectedByTestId: 'TC-042',
      status: 'Open',
      remediationHint: 'Filter or reject quantity <= 0 for non-cancelled orders.',
      sampleDiff: [
        { recordKey: 'OI-561904', s3SourceValue: 'qty: 0, order=CONFIRMED', redshiftTargetValue: 'qty: 0', issueNote: 'Zero quantity violates min boundary >= 1' },
      ],
    },
    {
      id: 'DEF-028',
      category: 'Validity & Boundary',
      severity: 'Medium',
      table: 'payments',
      title: 'Invalid enum value in payment_status column',
      description: '6 rows contain legacy status "SETTLED_V1" outside allowed domain (AUTHORIZED, CAPTURED, REFUNDED, FAILED).',
      affectedRows: 6,
      detectedByRuleId: 'DQ-34',
      detectedByTestId: 'TC-037',
      status: 'Open',
      remediationHint: 'Map legacy SETTLED_V1 -> CAPTURED in Glue dictionary transform.',
      sampleDiff: [
        { recordKey: 'PAY-79921', s3SourceValue: 'status: SETTLED_V1', redshiftTargetValue: 'status: SETTLED_V1', issueNote: 'Breaks warehouse BI enum grouping' },
      ],
    },
  ];
}

interface RuleBlueprint {
  id: string;
  dimension: QualityDimension;
  table: string;
  ruleName: string;
  reconciliationMethod: ReconciliationMethod;
  sqlQuery: string;
  expectedValue: string;
  passActualValue: string;
  failActualValue: string;
  linkedDefectIds: string[];
}

const RULE_BLUEPRINTS: RuleBlueprint[] = [
  // Completeness (8)
  {
    id: 'DQ-01',
    dimension: 'Completeness',
    table: 'orders',
    ruleName: 'S3 vs Redshift exact row count parity (orders)',
    reconciliationMethod: 'Aggregation',
    sqlQuery: 'SELECT s.cnt AS s3_count, r.cnt AS redshift_count, (s.cnt - r.cnt) AS delta FROM stg_s3_orders_cnt s CROSS JOIN (SELECT COUNT(*) AS cnt FROM public.orders) r;',
    expectedValue: 'delta = 0 (15,840)',
    passActualValue: 'delta = 0 (15,840)',
    failActualValue: 'delta = 74 (15,766)',
    linkedDefectIds: ['DEF-001', 'DEF-016'],
  },
  {
    id: 'DQ-02',
    dimension: 'Completeness',
    table: 'customers',
    ruleName: 'Zero NULL values in customers.email',
    reconciliationMethod: 'Filter',
    sqlQuery: 'SELECT COUNT(*) AS null_emails FROM public.customers WHERE email IS NULL OR TRIM(email) = \'\';',
    expectedValue: '0 nulls',
    passActualValue: '0 nulls',
    failActualValue: '31 nulls',
    linkedDefectIds: ['DEF-009'],
  },
  {
    id: 'DQ-03',
    dimension: 'Completeness',
    table: 'orders',
    ruleName: 'Zero NULL values in orders.customer_id FK',
    reconciliationMethod: 'Filter',
    sqlQuery: 'SELECT COUNT(*) AS null_fks FROM public.orders WHERE customer_id IS NULL;',
    expectedValue: '0 nulls',
    passActualValue: '0 nulls',
    failActualValue: '64 nulls',
    linkedDefectIds: ['DEF-008'],
  },
  {
    id: 'DQ-04',
    dimension: 'Completeness',
    table: 'order_items',
    ruleName: 'Zero NULL values in order_items.unit_price',
    reconciliationMethod: 'Filter',
    sqlQuery: 'SELECT COUNT(*) AS null_prices FROM public.order_items WHERE unit_price IS NULL;',
    expectedValue: '0 nulls',
    passActualValue: '0 nulls',
    failActualValue: '42 nulls',
    linkedDefectIds: ['DEF-011'],
  },
  {
    id: 'DQ-05',
    dimension: 'Completeness',
    table: 'payments',
    ruleName: 'Zero NULL values in payments.payment_method',
    reconciliationMethod: 'Filter',
    sqlQuery: 'SELECT COUNT(*) AS null_methods FROM public.payments WHERE payment_method IS NULL;',
    expectedValue: '0 nulls',
    passActualValue: '0 nulls',
    failActualValue: '18 nulls',
    linkedDefectIds: ['DEF-010'],
  },
  {
    id: 'DQ-06',
    dimension: 'Completeness',
    table: 'products',
    ruleName: 'Zero NULL values in products.category_name',
    reconciliationMethod: 'Filter',
    sqlQuery: 'SELECT COUNT(*) AS null_cats FROM public.products WHERE category_name IS NULL;',
    expectedValue: '0 nulls',
    passActualValue: '0 nulls',
    failActualValue: '15 nulls',
    linkedDefectIds: ['DEF-012'],
  },
  {
    id: 'DQ-07',
    dimension: 'Completeness',
    table: 'shipments',
    ruleName: 'Conditional completeness: SHIPPED requires shipped_at',
    reconciliationMethod: 'Filter',
    sqlQuery: 'SELECT COUNT(*) AS missing_ts FROM public.shipments WHERE status = \'SHIPPED\' AND shipped_at IS NULL;',
    expectedValue: '0 missing timestamps',
    passActualValue: '0 missing timestamps',
    failActualValue: '27 missing timestamps',
    linkedDefectIds: ['DEF-013'],
  },
  {
    id: 'DQ-08',
    dimension: 'Completeness',
    table: 'orders',
    ruleName: 'Zero NULL values in orders.currency_code',
    reconciliationMethod: 'Filter',
    sqlQuery: 'SELECT COUNT(*) AS null_currency FROM public.orders WHERE currency_code IS NULL;',
    expectedValue: '0 nulls',
    passActualValue: '0 nulls',
    failActualValue: '12 nulls',
    linkedDefectIds: ['DEF-014'],
  },

  // Accuracy (8)
  {
    id: 'DQ-09',
    dimension: 'Accuracy',
    table: 'orders',
    ruleName: 'Total gross revenue parity S3 vs Redshift',
    reconciliationMethod: 'Aggregation',
    sqlQuery: 'SELECT SUM(s.total_amount) AS s3_sum, SUM(r.total_amount) AS dw_sum FROM stg_orders s FULL OUTER JOIN public.orders r ON s.order_id = r.order_id;',
    expectedValue: 'Variance <= $0.01',
    passActualValue: 'Variance $0.00',
    failActualValue: 'Variance +$6,842.10 (dups/missing)',
    linkedDefectIds: ['DEF-001', 'DEF-016'],
  },
  {
    id: 'DQ-10',
    dimension: 'Accuracy',
    table: 'payments',
    ruleName: 'Settled payment sum matches Glue staging aggregate',
    reconciliationMethod: 'Aggregation',
    sqlQuery: 'SELECT ROUND(ABS(s.settled_sum - r.settled_sum), 2) AS variance FROM stg_payments_agg s, (SELECT SUM(amount) AS settled_sum FROM public.payments WHERE status=\'CAPTURED\') r;',
    expectedValue: 'Variance = $0.00',
    passActualValue: 'Variance = $0.00',
    failActualValue: 'Variance = $4,190.50',
    linkedDefectIds: ['DEF-003'],
  },
  {
    id: 'DQ-11',
    dimension: 'Accuracy',
    table: 'orders',
    ruleName: 'Order header total equals sum of item line totals + tax',
    reconciliationMethod: 'Join',
    sqlQuery: 'SELECT o.order_id, o.total_amount, SUM(oi.quantity * oi.unit_price) + o.tax_amount - o.discount_amount AS calc_total FROM public.orders o JOIN public.order_items oi ON o.order_id = oi.order_id GROUP BY 1,2,o.tax_amount,o.discount_amount HAVING ABS(o.total_amount - calc_total) > 0.01;',
    expectedValue: '0 mismatched orders',
    passActualValue: '0 mismatched orders',
    failActualValue: '34 mismatched orders',
    linkedDefectIds: ['DEF-020'],
  },
  {
    id: 'DQ-12',
    dimension: 'Accuracy',
    table: 'order_items',
    ruleName: 'Order item quantity sum parity S3 vs Redshift',
    reconciliationMethod: 'Aggregation',
    sqlQuery: 'SELECT SUM(quantity) AS total_units FROM public.order_items;',
    expectedValue: '38,914 units',
    passActualValue: '38,914 units',
    failActualValue: '38,995 units (+81 dup/-48 swap)',
    linkedDefectIds: ['DEF-005', 'DEF-018'],
  },
  {
    id: 'DQ-13',
    dimension: 'Accuracy',
    table: 'payments',
    ruleName: 'Captured payments sum <= order total + rounding tolerance',
    reconciliationMethod: 'Join',
    sqlQuery: 'SELECT o.order_id, o.total_amount, SUM(p.amount) AS paid FROM public.orders o JOIN public.payments p ON o.order_id = p.order_id GROUP BY 1,2 HAVING SUM(p.amount) > o.total_amount + 0.05;',
    expectedValue: '0 over-captured orders',
    passActualValue: '0 over-captured orders',
    failActualValue: '9 over-captured orders',
    linkedDefectIds: ['DEF-023'],
  },
  {
    id: 'DQ-14',
    dimension: 'Accuracy',
    table: 'customers',
    ruleName: 'Customer lifetime value aggregate parity',
    reconciliationMethod: 'Join',
    sqlQuery: 'SELECT COUNT(*) FROM public.customers c LEFT JOIN (SELECT customer_id, SUM(total_amount) AS ltv FROM public.orders GROUP BY 1) o ON c.customer_id = o.customer_id WHERE o.ltv < 0;',
    expectedValue: '0 negative LTV customers',
    passActualValue: '0 negative LTV customers',
    failActualValue: '0 negative LTV customers',
    linkedDefectIds: [],
  },
  {
    id: 'DQ-15',
    dimension: 'Accuracy',
    table: 'products',
    ruleName: 'Catalog average unit_price within 0.01% of S3 CSV',
    reconciliationMethod: 'Aggregation',
    sqlQuery: 'SELECT ROUND(AVG(unit_price), 4) AS avg_price FROM public.products;',
    expectedValue: '$64.8200',
    passActualValue: '$64.8200',
    failActualValue: '$64.8200',
    linkedDefectIds: [],
  },
  {
    id: 'DQ-16',
    dimension: 'Accuracy',
    table: 'shipments',
    ruleName: 'Average carrier transit weight accuracy check',
    reconciliationMethod: 'Aggregation',
    sqlQuery: 'SELECT ROUND(SUM(package_weight_kg), 2) AS total_kg FROM public.shipments;',
    expectedValue: '12,418.40 kg',
    passActualValue: '12,418.40 kg',
    failActualValue: '11,210.85 kg (broken refresh)',
    linkedDefectIds: ['DEF-015'],
  },

  // Consistency (7)
  {
    id: 'DQ-17',
    dimension: 'Consistency',
    table: 'order_items',
    ruleName: 'All order_items.product_id exist in products dimension',
    reconciliationMethod: 'Join',
    sqlQuery: 'SELECT COUNT(*) AS orphan_items FROM public.order_items oi LEFT JOIN public.products p ON oi.product_id = p.product_id WHERE p.product_id IS NULL;',
    expectedValue: '0 orphan rows',
    passActualValue: '0 orphan rows',
    failActualValue: '23 orphan rows',
    linkedDefectIds: ['DEF-019'],
  },
  {
    id: 'DQ-18',
    dimension: 'Consistency',
    table: 'payments',
    ruleName: 'All payments.order_id exist in orders table',
    reconciliationMethod: 'Join',
    sqlQuery: 'SELECT COUNT(*) AS orphan_payments FROM public.payments p LEFT JOIN public.orders o ON p.order_id = o.order_id WHERE o.order_id IS NULL;',
    expectedValue: '0 orphan payments',
    passActualValue: '0 orphan payments',
    failActualValue: '19 orphan payments',
    linkedDefectIds: ['DEF-021'],
  },
  {
    id: 'DQ-19',
    dimension: 'Consistency',
    table: 'shipments',
    ruleName: 'Order DELIVERED status aligns with shipment status',
    reconciliationMethod: 'Join',
    sqlQuery: 'SELECT COUNT(*) AS conflicts FROM public.orders o JOIN public.shipments s ON o.order_id = s.order_id WHERE o.status = \'DELIVERED\' AND s.status = \'PENDING\';',
    expectedValue: '0 state conflicts',
    passActualValue: '0 state conflicts',
    failActualValue: '36 state conflicts',
    linkedDefectIds: ['DEF-022'],
  },
  {
    id: 'DQ-20',
    dimension: 'Consistency',
    table: 'orders',
    ruleName: 'All orders.customer_id exist in customers dimension',
    reconciliationMethod: 'Join',
    sqlQuery: 'SELECT COUNT(*) AS orphan_orders FROM public.orders o LEFT JOIN public.customers c ON o.customer_id = c.customer_id WHERE o.customer_id IS NOT NULL AND c.customer_id IS NULL;',
    expectedValue: '0 orphan orders',
    passActualValue: '0 orphan orders',
    failActualValue: '0 orphan orders',
    linkedDefectIds: [],
  },
  {
    id: 'DQ-21',
    dimension: 'Consistency',
    table: 'order_items',
    ruleName: 'All order_items.order_id exist in parent orders',
    reconciliationMethod: 'Join',
    sqlQuery: 'SELECT COUNT(*) AS orphan_lines FROM public.order_items oi LEFT JOIN public.orders o ON oi.order_id = o.order_id WHERE o.order_id IS NULL;',
    expectedValue: '0 orphan lines',
    passActualValue: '0 orphan lines',
    failActualValue: '0 orphan lines',
    linkedDefectIds: [],
  },
  {
    id: 'DQ-22',
    dimension: 'Consistency',
    table: 'customers',
    ruleName: 'Normalized lowercase email uniqueness across regions',
    reconciliationMethod: 'Aggregation',
    sqlQuery: 'SELECT LOWER(TRIM(email)) AS norm_email, COUNT(*) FROM public.customers WHERE email IS NOT NULL GROUP BY 1 HAVING COUNT(*) > 1;',
    expectedValue: '0 duplicate emails',
    passActualValue: '0 duplicate emails',
    failActualValue: '24 duplicate emails',
    linkedDefectIds: ['DEF-002'],
  },
  {
    id: 'DQ-23',
    dimension: 'Consistency',
    table: 'products',
    ruleName: 'Trimmed uppercase SKU consistency across catalog',
    reconciliationMethod: 'Aggregation',
    sqlQuery: 'SELECT TRIM(UPPER(sku)), COUNT(*) FROM public.products GROUP BY 1 HAVING COUNT(*) > 1;',
    expectedValue: '0 duplicate SKUs',
    passActualValue: '0 duplicate SKUs',
    failActualValue: '11 duplicate SKUs',
    linkedDefectIds: ['DEF-004'],
  },

  // Uniqueness (7)
  {
    id: 'DQ-24',
    dimension: 'Uniqueness',
    table: 'orders',
    ruleName: 'Primary key uniqueness on orders.order_id',
    reconciliationMethod: 'Aggregation',
    sqlQuery: 'SELECT order_id, COUNT(*) AS dup_cnt FROM public.orders GROUP BY 1 HAVING COUNT(*) > 1;',
    expectedValue: '0 duplicate keys',
    passActualValue: '0 duplicate keys',
    failActualValue: '38 duplicate keys',
    linkedDefectIds: ['DEF-001'],
  },
  {
    id: 'DQ-25',
    dimension: 'Uniqueness',
    table: 'order_items',
    ruleName: 'Composite key uniqueness (order_id, product_id)',
    reconciliationMethod: 'Aggregation',
    sqlQuery: 'SELECT order_id, product_id, COUNT(*) FROM public.order_items GROUP BY 1,2 HAVING COUNT(*) > 1;',
    expectedValue: '0 composite duplicates',
    passActualValue: '0 composite duplicates',
    failActualValue: '29 composite duplicates',
    linkedDefectIds: ['DEF-005'],
  },
  {
    id: 'DQ-26',
    dimension: 'Uniqueness',
    table: 'payments',
    ruleName: 'Primary key uniqueness on payments.payment_id',
    reconciliationMethod: 'Aggregation',
    sqlQuery: 'SELECT payment_id, COUNT(*) FROM public.payments GROUP BY 1 HAVING COUNT(*) > 1;',
    expectedValue: '0 duplicate keys',
    passActualValue: '0 duplicate keys',
    failActualValue: '19 duplicate keys',
    linkedDefectIds: ['DEF-003'],
  },
  {
    id: 'DQ-27',
    dimension: 'Uniqueness',
    table: 'shipments',
    ruleName: 'Unique active tracking_number per shipment',
    reconciliationMethod: 'Aggregation',
    sqlQuery: 'SELECT tracking_number, COUNT(*) FROM public.shipments WHERE is_active = TRUE GROUP BY 1 HAVING COUNT(*) > 1;',
    expectedValue: '0 duplicate tracking numbers',
    passActualValue: '0 duplicate tracking numbers',
    failActualValue: '14 duplicate tracking numbers',
    linkedDefectIds: ['DEF-006'],
  },
  {
    id: 'DQ-28',
    dimension: 'Uniqueness',
    table: 'customers',
    ruleName: 'Unique phone_hash across active loyalty profiles',
    reconciliationMethod: 'Aggregation',
    sqlQuery: 'SELECT phone_hash, COUNT(*) FROM public.customers WHERE phone_hash IS NOT NULL GROUP BY 1 HAVING COUNT(*) > 1;',
    expectedValue: '0 duplicate phones',
    passActualValue: '0 duplicate phones',
    failActualValue: '7 duplicate phones',
    linkedDefectIds: ['DEF-007'],
  },
  {
    id: 'DQ-29b',
    dimension: 'Uniqueness',
    table: 'customers',
    ruleName: 'Primary key uniqueness on customers.customer_id',
    reconciliationMethod: 'Aggregation',
    sqlQuery: 'SELECT customer_id, COUNT(*) FROM public.customers GROUP BY 1 HAVING COUNT(*) > 1;',
    expectedValue: '0 duplicate customer_id',
    passActualValue: '0 duplicate customer_id',
    failActualValue: '0 duplicate customer_id',
    linkedDefectIds: [],
  },
  {
    id: 'DQ-30b',
    dimension: 'Uniqueness',
    table: 'products',
    ruleName: 'Primary key uniqueness on products.product_id',
    reconciliationMethod: 'Aggregation',
    sqlQuery: 'SELECT product_id, COUNT(*) FROM public.products GROUP BY 1 HAVING COUNT(*) > 1;',
    expectedValue: '0 duplicate product_id',
    passActualValue: '0 duplicate product_id',
    failActualValue: '0 duplicate product_id',
    linkedDefectIds: [],
  },

  // Validity (7)
  {
    id: 'DQ-29',
    dimension: 'Validity',
    table: 'products',
    ruleName: 'Non-negative products.unit_price (>= 0)',
    reconciliationMethod: 'Filter',
    sqlQuery: 'SELECT COUNT(*) AS negative_prices FROM public.products WHERE unit_price < 0;',
    expectedValue: '0 negative prices',
    passActualValue: '0 negative prices',
    failActualValue: '9 negative prices',
    linkedDefectIds: ['DEF-024'],
  },
  {
    id: 'DQ-30',
    dimension: 'Validity',
    table: 'customers',
    ruleName: 'RFC-5322 regex validation on customers.email',
    reconciliationMethod: 'Filter',
    sqlQuery: 'SELECT COUNT(*) AS bad_emails FROM public.customers WHERE email IS NOT NULL AND email !~ \'^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$\';',
    expectedValue: '0 invalid emails',
    passActualValue: '0 invalid emails',
    failActualValue: '22 invalid emails',
    linkedDefectIds: ['DEF-025'],
  },
  {
    id: 'DQ-32',
    dimension: 'Validity',
    table: 'order_items',
    ruleName: 'Positive quantity boundary (>= 1) on confirmed lines',
    reconciliationMethod: 'Join',
    sqlQuery: 'SELECT COUNT(*) FROM public.order_items oi JOIN public.orders o ON oi.order_id = o.order_id WHERE o.status = \'CONFIRMED\' AND oi.quantity <= 0;',
    expectedValue: '0 zero-qty rows',
    passActualValue: '0 zero-qty rows',
    failActualValue: '16 zero-qty rows',
    linkedDefectIds: ['DEF-027'],
  },
  {
    id: 'DQ-34',
    dimension: 'Validity',
    table: 'payments',
    ruleName: 'Allowed enum check on payments.status',
    reconciliationMethod: 'Filter',
    sqlQuery: 'SELECT COUNT(*) FROM public.payments WHERE status NOT IN (\'AUTHORIZED\', \'CAPTURED\', \'REFUNDED\', \'FAILED\');',
    expectedValue: '0 invalid enum rows',
    passActualValue: '0 invalid enum rows',
    failActualValue: '6 invalid enum rows',
    linkedDefectIds: ['DEF-028'],
  },
  {
    id: 'DQ-35',
    dimension: 'Validity',
    table: 'orders',
    ruleName: 'ISO-4217 currency code domain check',
    reconciliationMethod: 'Filter',
    sqlQuery: 'SELECT COUNT(*) FROM public.orders WHERE currency_code IS NOT NULL AND currency_code NOT IN (\'USD\', \'EUR\', \'GBP\', \'CAD\', \'INR\');',
    expectedValue: '0 invalid currencies',
    passActualValue: '0 invalid currencies',
    failActualValue: '0 invalid currencies',
    linkedDefectIds: [],
  },
  {
    id: 'DQ-36',
    dimension: 'Validity',
    table: 'shipments',
    ruleName: 'Carrier code whitelist validation (UPS, FEDEX, DHL, USPS)',
    reconciliationMethod: 'Filter',
    sqlQuery: 'SELECT COUNT(*) FROM public.shipments WHERE carrier_code NOT IN (\'UPS\', \'FEDEX\', \'DHL\', \'USPS\');',
    expectedValue: '0 invalid carriers',
    passActualValue: '0 invalid carriers',
    failActualValue: '0 invalid carriers',
    linkedDefectIds: [],
  },
  {
    id: 'DQ-37',
    dimension: 'Validity',
    table: 'products',
    ruleName: 'SKU pattern format validation (^SKU-[0-9]{4,8}$)',
    reconciliationMethod: 'Filter',
    sqlQuery: 'SELECT COUNT(*) FROM public.products WHERE TRIM(UPPER(sku)) !~ \'^SKU-[0-9]{4,8}$\';',
    expectedValue: '0 malformed SKUs',
    passActualValue: '0 malformed SKUs',
    failActualValue: '0 malformed SKUs',
    linkedDefectIds: [],
  },

  // Timeliness (7)
  {
    id: 'DQ-38',
    dimension: 'Timeliness',
    table: 'shipments',
    ruleName: 'Shipments warehouse refresh SLA <= 60 mins from S3 drop',
    reconciliationMethod: 'Aggregation',
    sqlQuery: 'SELECT DATEDIFF(minute, MAX(updated_at), GETDATE()) AS lag_minutes FROM public.shipments;',
    expectedValue: '<= 60 mins lag',
    passActualValue: '12 mins lag',
    failActualValue: '1,413 mins lag (Broken Refresh)',
    linkedDefectIds: ['DEF-015'],
  },
  {
    id: 'DQ-39',
    dimension: 'Timeliness',
    table: 'customers',
    ruleName: 'Customers table refresh SLA <= 60 mins',
    reconciliationMethod: 'Aggregation',
    sqlQuery: 'SELECT DATEDIFF(minute, MAX(updated_at), GETDATE()) AS lag_minutes FROM public.customers;',
    expectedValue: '<= 60 mins lag',
    passActualValue: '14 mins lag',
    failActualValue: '14 mins lag',
    linkedDefectIds: [],
  },
  {
    id: 'DQ-40',
    dimension: 'Timeliness',
    table: 'payments',
    ruleName: 'Payments materialized refresh SLA <= 60 mins',
    reconciliationMethod: 'Aggregation',
    sqlQuery: 'SELECT DATEDIFF(minute, MAX(settled_at), GETDATE()) AS lag_minutes FROM public.payments;',
    expectedValue: '<= 60 mins lag',
    passActualValue: '18 mins lag',
    failActualValue: '94 mins lag',
    linkedDefectIds: ['DEF-017'],
  },
  {
    id: 'DQ-41',
    dimension: 'Timeliness',
    table: 'products',
    ruleName: 'Products catalog daily refresh SLA <= 120 mins',
    reconciliationMethod: 'Aggregation',
    sqlQuery: 'SELECT DATEDIFF(minute, MAX(updated_at), GETDATE()) AS lag_minutes FROM public.products;',
    expectedValue: '<= 120 mins lag',
    passActualValue: '15 mins lag',
    failActualValue: '15 mins lag',
    linkedDefectIds: [],
  },
  {
    id: 'DQ-42',
    dimension: 'Timeliness',
    table: 'order_items',
    ruleName: 'Order items staging-to-live commit freshness',
    reconciliationMethod: 'Join',
    sqlQuery: 'SELECT COUNT(*) AS unmerged_rows FROM stg_order_items s LEFT JOIN public.order_items r ON s.order_item_id = r.order_item_id WHERE r.order_item_id IS NULL;',
    expectedValue: '0 unmerged rows',
    passActualValue: '0 unmerged rows',
    failActualValue: '48 unmerged rows',
    linkedDefectIds: ['DEF-018'],
  },
  {
    id: 'DQ-43',
    dimension: 'Timeliness',
    table: 'orders',
    ruleName: 'No future order_created_at timestamps beyond +5m clock skew',
    reconciliationMethod: 'Filter',
    sqlQuery: 'SELECT COUNT(*) FROM public.orders WHERE created_at > DATEADD(minute, 5, GETDATE());',
    expectedValue: '0 future timestamps',
    passActualValue: '0 future timestamps',
    failActualValue: '13 future timestamps',
    linkedDefectIds: ['DEF-026'],
  },
  {
    id: 'DQ-44',
    dimension: 'Timeliness',
    table: 'orders',
    ruleName: 'Orders latest partition timestamp within 30 mins of Lambda event',
    reconciliationMethod: 'Aggregation',
    sqlQuery: 'SELECT MAX(loaded_at) AS last_load FROM public.orders;',
    expectedValue: '<= 30 mins lag',
    passActualValue: '9 mins lag',
    failActualValue: '9 mins lag',
    linkedDefectIds: [],
  },
];

interface PytestBlueprint {
  id: string;
  scenario: TestScenario;
  table: string;
  nodeId: string;
  title: string;
  description: string;
  linkedRuleId: string;
  expectedResult: string;
  durationMs: number;
  pythonCode: string;
}

function buildPytestBlueprints(): PytestBlueprint[] {
  const tables = ['customers', 'products', 'orders', 'order_items', 'payments', 'shipments'];
  const specs: Array<{
    scenario: TestScenario;
    table: string;
    fn: string;
    title: string;
    desc: string;
    ruleId: string;
    expected: string;
    durationMs: number;
    assertSnippet: string;
  }> = [
    // 20 Positive scenarios
    { scenario: 'Positive', table: 'customers', fn: 'test_customers_schema_mapping', title: 'Customers Parquet schema matches Redshift DDL', desc: 'Verifies all 14 columns and data types map cleanly from S3 Parquet to Redshift.', ruleId: 'DQ-29b', expected: '14/14 columns matched', durationMs: 142, assertSnippet: 'assert set(s3_df.columns) == set(redshift_cols)' },
    { scenario: 'Positive', table: 'customers', fn: 'test_customers_row_parity', title: 'Customers total row count parity', desc: 'Validates 8,420 S3 rows reconcile with Redshift public.customers.', ruleId: 'DQ-29b', expected: '8,420 == 8,420', durationMs: 185, assertSnippet: 'assert s3_count == redshift_count == 8420' },
    { scenario: 'Positive', table: 'customers', fn: 'test_customers_pk_uniqueness', title: 'Customers primary key uniqueness', desc: 'Asserts zero duplicate customer_id values in Redshift.', ruleId: 'DQ-29b', expected: '0 duplicates', durationMs: 118, assertSnippet: 'assert rs.scalar("SELECT COUNT(*) - COUNT(DISTINCT customer_id) FROM customers") == 0' },
    { scenario: 'Positive', table: 'customers', fn: 'test_customers_refresh_sla', title: 'Customers SLA freshness check', desc: 'Asserts max(updated_at) lag is within 60 minutes.', ruleId: 'DQ-39', expected: 'Lag <= 60 min', durationMs: 96, assertSnippet: 'assert lag_minutes <= 60' },
    { scenario: 'Positive', table: 'products', fn: 'test_products_row_parity', title: 'Products CSV row count parity', desc: 'Validates 2,160 S3 CSV records arrived in Redshift.', ruleId: 'DQ-30b', expected: '2,160 == 2,160', durationMs: 110, assertSnippet: 'assert s3_count == redshift_count == 2160' },
    { scenario: 'Positive', table: 'products', fn: 'test_products_avg_price_parity', title: 'Products average price aggregate parity', desc: 'Verifies AVG(unit_price) matches S3 source to 4 decimals.', ruleId: 'DQ-15', expected: '$64.8200', durationMs: 134, assertSnippet: 'assert abs(s3_avg - rs_avg) < 0.0001' },
    { scenario: 'Positive', table: 'products', fn: 'test_products_sku_regex', title: 'Products SKU format matches pattern', desc: 'Validates trimmed SKUs match ^SKU-[0-9]{4,8}$.', ruleId: 'DQ-37', expected: '0 regex violations', durationMs: 121, assertSnippet: 'assert bad_sku_count == 0' },
    { scenario: 'Positive', table: 'products', fn: 'test_products_refresh_window', title: 'Products catalog refresh timeliness', desc: 'Asserts catalog refresh completed within 120-minute window.', ruleId: 'DQ-41', expected: 'Lag <= 120 min', durationMs: 88, assertSnippet: 'assert catalog_lag <= 120' },
    { scenario: 'Positive', table: 'orders', fn: 'test_orders_customer_fk_join', title: 'Orders customer_id referential join integrity', desc: 'Verifies non-null customer_ids exist in customers table.', ruleId: 'DQ-20', expected: '0 orphan FKs', durationMs: 245, assertSnippet: 'assert orphan_orders == 0' },
    { scenario: 'Positive', table: 'orders', fn: 'test_orders_currency_domain', title: 'Orders ISO-4217 currency whitelist', desc: 'Validates currency codes belong to supported FX set.', ruleId: 'DQ-35', expected: '0 invalid currencies', durationMs: 130, assertSnippet: 'assert invalid_currencies == 0' },
    { scenario: 'Positive', table: 'orders', fn: 'test_orders_latest_partition_loaded', title: 'Orders latest Lambda partition timestamp', desc: 'Asserts latest partition loaded within 30 minutes of trigger.', ruleId: 'DQ-44', expected: 'Lag <= 30 min', durationMs: 112, assertSnippet: 'assert partition_lag_mins <= 30' },
    { scenario: 'Positive', table: 'orders', fn: 'test_orders_ltv_non_negative', title: 'Customer LTV rollup non-negative check', desc: 'Joins customers and orders to assert non-negative LTV.', ruleId: 'DQ-14', expected: '0 negative LTV', durationMs: 215, assertSnippet: 'assert neg_ltv_customers == 0' },
    { scenario: 'Positive', table: 'order_items', fn: 'test_order_items_parent_order_join', title: 'Order items parent order_id FK parity', desc: 'Asserts every line item maps to a valid order header.', ruleId: 'DQ-21', expected: '0 orphan lines', durationMs: 260, assertSnippet: 'assert orphan_lines == 0' },
    { scenario: 'Positive', table: 'order_items', fn: 'test_order_items_parquet_partitioning', title: 'Order items Glue dynamic partitioning check', desc: 'Verifies Parquet partitions match dt=YYYY-MM-DD layout.', ruleId: 'DQ-21', expected: 'All partitions valid', durationMs: 154, assertSnippet: 'assert len(invalid_partitions) == 0' },
    { scenario: 'Positive', table: 'payments', fn: 'test_payments_glue_type_casting', title: 'Payments DECIMAL(12,2) precision cast', desc: 'Verifies string currency fields cast cleanly to DECIMAL(12,2).', ruleId: 'DQ-35', expected: '0 cast errors', durationMs: 129, assertSnippet: 'assert cast_failures == 0' },
    { scenario: 'Positive', table: 'payments', fn: 'test_payments_settlement_batch_id', title: 'Payments batch manifest ID propagation', desc: 'Confirms Lambda batch_id is stamped on every Redshift row.', ruleId: 'DQ-35', expected: '100% batch_id coverage', durationMs: 119, assertSnippet: 'assert missing_batch_ids == 0' },
    { scenario: 'Positive', table: 'shipments', fn: 'test_shipments_carrier_whitelist', title: 'Shipments carrier_code domain compliance', desc: 'Validates all carrier codes are in (UPS, FEDEX, DHL, USPS).', ruleId: 'DQ-36', expected: '0 unknown carriers', durationMs: 105, assertSnippet: 'assert invalid_carriers == 0' },
    { scenario: 'Positive', table: 'shipments', fn: 'test_shipments_lambda_event_ack', title: 'Lambda S3 Put trigger acknowledgement', desc: 'Verifies S3 ObjectCreated event triggered Glue job within 5s.', ruleId: 'DQ-36', expected: 'Trigger < 5,000 ms', durationMs: 92, assertSnippet: 'assert lambda_trigger_ms < 5000' },
    { scenario: 'Positive', table: 'orders', fn: 'test_orders_databricks_notebook_pass', title: 'Databricks orders staging check passed', desc: 'Confirms Databricks transformation cell 3 executed cleanly.', ruleId: 'DQ-20', expected: 'Notebook exit 0', durationMs: 198, assertSnippet: 'assert notebook_status == "SUCCEEDED"' },
    { scenario: 'Positive', table: 'products', fn: 'test_products_pk_uniqueness', title: 'Products primary key uniqueness check', desc: 'Verifies zero duplicate product_id keys in Redshift.', ruleId: 'DQ-30b', expected: '0 duplicates', durationMs: 94, assertSnippet: 'assert dup_products == 0' },

    // 16 Negative scenarios
    { scenario: 'Negative', table: 'orders', fn: 'test_orders_rejects_null_customer_id', title: 'Rejects NULL customer_id in guest orders', desc: 'Negative test verifying NULL customer_id detection in orders.', ruleId: 'DQ-03', expected: '0 NULL customer_id', durationMs: 148, assertSnippet: 'assert null_customer_ids == 0, f"Found {null_customer_ids} null customer_id rows"' },
    { scenario: 'Negative', table: 'customers', fn: 'test_customers_rejects_duplicate_emails', title: 'Detects duplicate normalized customer emails', desc: 'Negative test checking cross-region duplicate email ingestion.', ruleId: 'DQ-22', expected: '0 duplicate emails', durationMs: 162, assertSnippet: 'assert dup_email_count == 0' },
    { scenario: 'Negative', table: 'customers', fn: 'test_customers_rejects_null_email', title: 'Flags NULL email on B2B customer accounts', desc: 'Negative test asserting mandatory contact email presence.', ruleId: 'DQ-02', expected: '0 NULL emails', durationMs: 131, assertSnippet: 'assert null_emails == 0' },
    { scenario: 'Negative', table: 'products', fn: 'test_products_rejects_whitespace_sku_dups', title: 'Catches trailing-space duplicate SKUs', desc: 'Negative test ensuring TRIM(UPPER(sku)) is unique.', ruleId: 'DQ-23', expected: '0 trimmed SKU dups', durationMs: 117, assertSnippet: 'assert dup_skus == 0' },
    { scenario: 'Negative', table: 'payments', fn: 'test_payments_rejects_null_payment_method', title: 'Flags unmapped NULL payment_method rows', desc: 'Negative test catching Apple Pay wallet schema omission.', ruleId: 'DQ-05', expected: '0 NULL payment_method', durationMs: 124, assertSnippet: 'assert null_methods == 0' },
    { scenario: 'Negative', table: 'orders', fn: 'test_orders_rejects_duplicate_order_id', title: 'Catches duplicate order_id after Glue retry', desc: 'Negative test detecting non-idempotent Glue retry appends.', ruleId: 'DQ-24', expected: '0 duplicate order_id', durationMs: 194, assertSnippet: 'assert dup_order_ids == 0' },
    { scenario: 'Negative', table: 'order_items', fn: 'test_order_items_rejects_null_unit_price', title: 'Flags NULL unit_price on promo line items', desc: 'Negative test ensuring NULL promo prices are coalesced.', ruleId: 'DQ-04', expected: '0 NULL unit_price', durationMs: 144, assertSnippet: 'assert null_unit_prices == 0' },
    { scenario: 'Negative', table: 'order_items', fn: 'test_order_items_rejects_composite_dups', title: 'Detects duplicate (order_id, product_id) rows', desc: 'Negative test asserting composite key uniqueness.', ruleId: 'DQ-25', expected: '0 composite dups', durationMs: 176, assertSnippet: 'assert dup_composite == 0' },
    { scenario: 'Negative', table: 'products', fn: 'test_products_rejects_null_category', title: 'Flags NULL category_name from missing lookup', desc: 'Negative test validating Glue category map completeness.', ruleId: 'DQ-06', expected: '0 NULL categories', durationMs: 112, assertSnippet: 'assert null_categories == 0' },
    { scenario: 'Negative', table: 'shipments', fn: 'test_shipments_rejects_null_shipped_at', title: 'Flags SHIPPED rows with NULL shipped_at', desc: 'Negative conditional check on shipment dispatch timestamp.', ruleId: 'DQ-07', expected: '0 missing timestamps', durationMs: 128, assertSnippet: 'assert missing_shipped_at == 0' },
    { scenario: 'Negative', table: 'payments', fn: 'test_payments_rejects_duplicate_payment_id', title: 'Catches duplicate payment_id settlements', desc: 'Negative test detecting overlapping Stripe CSV settlements.', ruleId: 'DQ-26', expected: '0 duplicate payment_id', durationMs: 159, assertSnippet: 'assert dup_payments == 0' },
    { scenario: 'Negative', table: 'orders', fn: 'test_orders_rejects_null_currency', title: 'Flags NULL currency_code in foreign orders', desc: 'Negative check ensuring cross-border currency mapping.', ruleId: 'DQ-08', expected: '0 NULL currency_code', durationMs: 121, assertSnippet: 'assert null_currencies == 0' },
    { scenario: 'Negative', table: 'products', fn: 'test_products_rejects_negative_unit_price', title: 'Rejects negative unit_price clearance SKUs', desc: 'Negative validation catching unit_price < 0.', ruleId: 'DQ-29', expected: '0 negative prices', durationMs: 109, assertSnippet: 'assert neg_prices == 0' },
    { scenario: 'Negative', table: 'shipments', fn: 'test_shipments_rejects_duplicate_tracking', title: 'Detects duplicate active tracking_number rows', desc: 'Negative test checking tracking_number survivorship.', ruleId: 'DQ-27', expected: '0 duplicate tracking', durationMs: 138, assertSnippet: 'assert dup_tracking == 0' },
    { scenario: 'Negative', table: 'customers', fn: 'test_customers_rejects_malformed_email', title: 'Flags malformed emails failing RFC-5322', desc: 'Negative regex check on customer contact emails.', ruleId: 'DQ-30', expected: '0 malformed emails', durationMs: 147, assertSnippet: 'assert bad_emails == 0' },
    { scenario: 'Negative', table: 'customers', fn: 'test_customers_rejects_duplicate_phone_hash', title: 'Catches duplicate loyalty phone_hash rows', desc: 'Negative uniqueness check on loyalty phone identifiers.', ruleId: 'DQ-28', expected: '0 duplicate phone_hash', durationMs: 133, assertSnippet: 'assert dup_phones == 0' },

    // 14 Boundary scenarios
    { scenario: 'Boundary', table: 'payments', fn: 'test_payments_rejects_legacy_enum_value', title: 'Boundary enum check on payments.status', desc: 'Tests exact domain boundary for allowed payment statuses.', ruleId: 'DQ-34', expected: '0 out-of-domain enums', durationMs: 115, assertSnippet: 'assert invalid_enums == 0' },
    { scenario: 'Boundary', table: 'orders', fn: 'test_orders_50k_batch_chunk_boundary', title: '50,000+ record memory & Glue chunk boundary', desc: 'Validates Glue PySpark partition sizing above 50,000 rows.', ruleId: 'DQ-09', expected: 'Processed >= 50,000 rows', durationMs: 310, assertSnippet: 'assert total_pipeline_rows >= 50000' },
    { scenario: 'Boundary', table: 'orders', fn: 'test_orders_zero_discount_boundary', title: 'Zero-dollar discount & free shipping boundary', desc: 'Tests order total calculation when discount_amount == 0.00.', ruleId: 'DQ-11', expected: 'Exact match at 0.00', durationMs: 139, assertSnippet: 'assert zero_disc_mismatches == 0' },
    { scenario: 'Boundary', table: 'orders', fn: 'test_orders_header_vs_items_rounding_boundary', title: 'Order vs order_items 0.01 rounding boundary', desc: 'Reconciles header total_amount against line items within $0.01.', ruleId: 'DQ-11', expected: '0 variances > $0.01', durationMs: 274, assertSnippet: 'assert mismatched_orders == 0' },
    { scenario: 'Boundary', table: 'order_items', fn: 'test_order_items_min_quantity_boundary', title: 'Minimum quantity >= 1 boundary on confirmed lines', desc: 'Catches boundary violations where confirmed quantity == 0.', ruleId: 'DQ-32', expected: '0 zero-qty lines', durationMs: 152, assertSnippet: 'assert zero_qty_lines == 0' },
    { scenario: 'Boundary', table: 'payments', fn: 'test_payments_overcapture_tolerance_boundary', title: 'Payment sum <= order total + $0.05 tolerance', desc: 'Tests upper capture boundary across multi-tender orders.', ruleId: 'DQ-13', expected: '0 over-captures > $0.05', durationMs: 186, assertSnippet: 'assert over_captured == 0' },
    { scenario: 'Boundary', table: 'order_items', fn: 'test_order_items_total_units_aggregation', title: 'Order items exact unit volume boundary', desc: 'Validates SUM(quantity) across 16,320 line items.', ruleId: 'DQ-12', expected: '38,914 units', durationMs: 204, assertSnippet: 'assert total_units == 38914' },
    { scenario: 'Boundary', table: 'orders', fn: 'test_orders_future_timestamp_skew_boundary', title: 'Timestamp upper bound <= NOW() + 5 min skew', desc: 'Detects timezone offset bugs pushing timestamps into future.', ruleId: 'DQ-43', expected: '0 future timestamps', durationMs: 141, assertSnippet: 'assert future_orders == 0' },
    { scenario: 'Boundary', table: 'customers', fn: 'test_customers_varchar_max_length_255', title: 'Redshift VARCHAR(255) truncation boundary', desc: 'Verifies no strings exceed Redshift column width limits.', ruleId: 'DQ-30', expected: '0 truncated fields', durationMs: 118, assertSnippet: 'assert max_len_violations == 0' },
    { scenario: 'Boundary', table: 'products', fn: 'test_products_zero_price_bundle_boundary', title: 'Unit price == 0.00 boundary allowed for gift SKUs', desc: 'Confirms $0.00 gift items pass while < 0 fails.', ruleId: 'DQ-29', expected: '0.00 allowed, < 0 rejected', durationMs: 102, assertSnippet: 'assert neg_prices == 0' },
    { scenario: 'Boundary', table: 'orders', fn: 'test_orders_utc_midnight_partition_cutoff', title: 'UTC midnight boundary partition split', desc: 'Checks 23:59:59Z vs 00:00:00Z orders do not double-load.', ruleId: 'DQ-44', expected: '0 boundary overlaps', durationMs: 165, assertSnippet: 'assert midnight_overlaps == 0' },
    { scenario: 'Boundary', table: 'payments', fn: 'test_payments_decimal_half_even_rounding', title: 'Tax & FX half-even decimal rounding boundary', desc: 'Validates Spark round(val, 2) matches Redshift NUMERIC.', ruleId: 'DQ-10', expected: '0 rounding drifts', durationMs: 144, assertSnippet: 'assert rounding_drifts == 0' },
    { scenario: 'Boundary', table: 'shipments', fn: 'test_shipments_weight_zero_digital_sku', title: 'Package weight boundary >= 0.00 kg', desc: 'Tests digital vs physical package weight lower bound.', ruleId: 'DQ-16', expected: '0 negative weights', durationMs: 97, assertSnippet: 'assert neg_weights == 0' },
    { scenario: 'Boundary', table: 'customers', fn: 'test_customers_unicode_diacritics_utf8', title: 'UTF-8 multibyte character encoding boundary', desc: 'Ensures Parquet UTF-8 names load cleanly in Redshift.', ruleId: 'DQ-29b', expected: '0 encoding errors', durationMs: 126, assertSnippet: 'assert encoding_errors == 0' },

    // 14 Failure scenarios
    { scenario: 'Failure', table: 'shipments', fn: 'test_shipments_detects_broken_refresh', title: 'Detects broken shipments table refresh (23h lag)', desc: 'Failure scenario catching stale IAM token blocking Redshift COPY.', ruleId: 'DQ-38', expected: 'Lag <= 60 mins', durationMs: 224, assertSnippet: 'assert shipments_lag_mins <= 60, "Broken Refresh detected on public.shipments"' },
    { scenario: 'Failure', table: 'orders', fn: 'test_orders_detects_partial_shard_load', title: 'Catches premature Lambda trigger missing shard 4', desc: 'Failure scenario detecting incomplete S3 multipart load.', ruleId: 'DQ-01', expected: '15,840 == 15,840', durationMs: 210, assertSnippet: 'assert s3_orders_cnt == rs_orders_cnt' },
    { scenario: 'Failure', table: 'order_items', fn: 'test_order_items_orphan_product_fk_failure', title: 'Fails on orphan product_id foreign keys', desc: 'Failure scenario catching retired SKUs missing in products.', ruleId: 'DQ-17', expected: '0 orphan product_ids', durationMs: 238, assertSnippet: 'assert orphan_product_fks == 0' },
    { scenario: 'Failure', table: 'payments', fn: 'test_payments_orphan_order_fk_failure', title: 'Fails on payments missing parent order_id', desc: 'Failure scenario catching child-before-parent DAG race.', ruleId: 'DQ-18', expected: '0 orphan order_ids', durationMs: 196, assertSnippet: 'assert orphan_order_fks == 0' },
    { scenario: 'Failure', table: 'payments', fn: 'test_payments_detects_oom_sla_breach', title: 'Flags Glue OOM restart causing > 60m SLA breach', desc: 'Failure scenario monitoring payments refresh watermark.', ruleId: 'DQ-40', expected: 'Lag <= 60 mins', durationMs: 174, assertSnippet: 'assert payments_lag_mins <= 60' },
    { scenario: 'Failure', table: 'orders', fn: 'test_orders_revenue_reconciliation_failure', title: 'Fails when S3 vs Redshift gross revenue diverges', desc: 'Failure scenario asserting aggregate SUM(total_amount) parity.', ruleId: 'DQ-09', expected: 'Variance <= $0.01', durationMs: 268, assertSnippet: 'assert revenue_variance <= 0.01' },
    { scenario: 'Failure', table: 'shipments', fn: 'test_shipments_cross_table_status_conflict', title: 'Fails on DELIVERED order with PENDING shipment', desc: 'Failure scenario checking cross-table fulfillment state.', ruleId: 'DQ-19', expected: '0 status conflicts', durationMs: 229, assertSnippet: 'assert status_conflicts == 0' },
    { scenario: 'Failure', table: 'order_items', fn: 'test_order_items_staging_swap_rollback', title: 'Detects unmerged staging rows after lock timeout', desc: 'Failure scenario verifying staging-to-live swap parity.', ruleId: 'DQ-42', expected: '0 unmerged rows', durationMs: 201, assertSnippet: 'assert unmerged_staging_rows == 0' },
    { scenario: 'Failure', table: 'payments', fn: 'test_payments_settled_sum_divergence', title: 'Fails on settled payment sum inflation', desc: 'Failure scenario catching double-counted settlement CSVs.', ruleId: 'DQ-10', expected: 'Variance = $0.00', durationMs: 189, assertSnippet: 'assert payment_variance == 0' },
    { scenario: 'Failure', table: 'shipments', fn: 'test_shipments_total_weight_mismatch', title: 'Fails on shipment weight aggregate shortfall', desc: 'Failure scenario catching missing 420 rows in Redshift.', ruleId: 'DQ-16', expected: '12,418.40 kg', durationMs: 172, assertSnippet: 'assert abs(rs_weight - s3_weight) < 0.01' },
    { scenario: 'Failure', table: 'orders', fn: 'test_orders_s3_manifest_missing_abort', title: 'Verifies pipeline aborts cleanly on missing manifest', desc: 'Simulated failure test ensuring zero partial commits on missing _SUCCESS.', ruleId: 'DQ-44', expected: 'Clean abort & alert', durationMs: 132, assertSnippet: 'assert manifest_guard.abort_on_missing() is True' },
    { scenario: 'Failure', table: 'customers', fn: 'test_customers_glue_schema_drift_quarantine', title: 'Routes unexpected S3 schema columns to quarantine', desc: 'Simulated failure verifying unexpected columns do not crash COPY.', ruleId: 'DQ-29b', expected: 'Quarantine exit 0', durationMs: 145, assertSnippet: 'assert quarantine_handler.isolated_count >= 0' },
    { scenario: 'Failure', table: 'products', fn: 'test_products_lambda_dead_letter_queue', title: 'Lambda DLQ captures malformed CSV encoding', desc: 'Simulated failure verifying SQS DLQ capture on corrupt UTF-16.', ruleId: 'DQ-30b', expected: 'DLQ retry success', durationMs: 121, assertSnippet: 'assert dlq_recovery_ok is True' },
    { scenario: 'Failure', table: 'order_items', fn: 'test_order_items_redshift_wlm_retry', title: 'Redshift WLM queue timeout automatic backoff', desc: 'Simulated failure validating exponential backoff on WLM contention.', ruleId: 'DQ-21', expected: '3 retries succeed', durationMs: 158, assertSnippet: 'assert wlm_client.retries <= 3' },
  ];

  // Verify all 6 tables represented
  void tables;

  return specs.map((spec, idx) => {
    const num = String(idx + 1).padStart(3, '0');
    const pythonCode = `@pytest.mark.${spec.scenario.toLowerCase()}\n@pytest.mark.table("${spec.table}")\ndef ${spec.fn}(s3_staging, redshift_conn, databricks_qa):\n    """${spec.desc}"""\n    # Linked Data Quality Rule: ${spec.ruleId}\n    result = redshift_conn.execute_reconciliation("${spec.ruleId}")\n    ${spec.assertSnippet}\n`;
    return {
      id: `TC-${num}`,
      scenario: spec.scenario,
      table: spec.table,
      nodeId: `tests/test_${spec.table}_pipeline.py::${spec.fn}`,
      title: spec.title,
      description: spec.desc,
      pythonCode,
      expectedResult: spec.expected,
      durationMs: spec.durationMs,
      linkedRuleId: spec.ruleId,
    };
  });
}

const PYTEST_BLUEPRINTS = buildPytestBlueprints();

export class PipelineEngine {
  private defects: DefectRecord[];
  private customAddedRecords: Record<string, number>;
  private runHistory: PipelineRunSummary[];
  private runCounter: number;

  constructor() {
    this.defects = createInitialDefects();
    this.customAddedRecords = {
      customers: 0,
      products: 0,
      orders: 0,
      order_items: 0,
      payments: 0,
      shipments: 0,
    };
    this.runCounter = 104;
    this.runHistory = [
      {
        runId: 'RUN-2026-102',
        executedAtUtc: '2026-11-19T19:15:00Z',
        triggerSource: 'Scheduled Regression',
        totalRecordsProcessed: 51920,
        tablesValidated: 6,
        totalRules: 44,
        rulesPassed: 23,
        rulesFailed: 21,
        totalTests: 64,
        testsPassed: 36,
        testsFailed: 28,
        openDefects: 24,
        resolvedDefects: 4,
        passRatePct: 56.3,
        durationSec: 46.2,
        notes: 'Previous nightly regression prior to Black Friday S3 volume surge.',
      },
      {
        runId: 'RUN-2026-103',
        executedAtUtc: '2026-11-20T06:30:00Z',
        triggerSource: 'Lambda S3 Put',
        totalRecordsProcessed: 52110,
        tablesValidated: 6,
        totalRules: 44,
        rulesPassed: 20,
        rulesFailed: 24,
        totalTests: 64,
        testsPassed: 32,
        testsFailed: 32,
        openDefects: 26,
        resolvedDefects: 2,
        passRatePct: 50.0,
        durationSec: 48.9,
        notes: 'Morning S3 ingestion; detected initial shipments IAM refresh lag.',
      },
    ];
    // Push baseline RUN-2026-104
    const initialRun = this.computeRunSummary('Lambda S3 Put', 'Baseline S3-to-Redshift validation run across 52,480 records and 6 source tables.');
    this.runHistory.push(initialRun);
  }

  private getOpenDefectSet(): Set<string> {
    return new Set(this.defects.filter((d) => d.status === 'Open').map((d) => d.id));
  }

  private computeTables(): SourceTableMetric[] {
    const openIds = this.getOpenDefectSet();
    return BASE_TABLES.map((cfg) => {
      const added = this.customAddedRecords[cfg.tableName] ?? 0;
      const s3Records = cfg.s3Records + added;
      const tableDefects = this.defects.filter((d) => d.table === cfg.tableName && d.status === 'Open');

      const dupCount = tableDefects
        .filter((d) => d.category === 'Duplicate Records')
        .reduce((acc, d) => acc + d.affectedRows, 0);

      const nullCount = tableDefects
        .filter((d) => d.category === 'Null Violations')
        .reduce((acc, d) => acc + d.affectedRows, 0);

      const brokenRows = tableDefects
        .filter((d) => d.category === 'Broken Refresh')
        .reduce((acc, d) => acc + d.affectedRows, 0);

      // Glue processes all S3 records + any duplicate retry inflation
      const glueProcessed = s3Records;
      const databricksChecked = s3Records;
      const redshiftLoaded = Math.max(0, s3Records + dupCount - brokenRows);
      const deltaRecords = redshiftLoaded - s3Records;

      let refreshStatus: 'Healthy' | 'Broken Refresh' | 'Stale SLA' = 'Healthy';
      let refreshLagMinutes = 12;
      let lastRefreshUtc = cfg.lastRefreshUtc;

      if (cfg.tableName === 'shipments' && openIds.has('DEF-015')) {
        refreshStatus = 'Broken Refresh';
        refreshLagMinutes = 1413;
      } else if (cfg.tableName === 'payments' && openIds.has('DEF-017')) {
        refreshStatus = 'Stale SLA';
        refreshLagMinutes = 94;
      } else if (cfg.tableName === 'shipments') {
        lastRefreshUtc = '2026-11-20T18:50:10Z';
        refreshLagMinutes = 11;
      }

      return {
        tableName: cfg.tableName,
        s3Path: cfg.s3Path,
        fileFormat: cfg.fileFormat,
        s3Records,
        glueProcessed,
        databricksChecked,
        redshiftLoaded,
        deltaRecords,
        nullCount,
        duplicateCount: dupCount,
        lastRefreshUtc,
        refreshLagMinutes,
        refreshStatus,
        primaryKey: cfg.primaryKey,
      };
    });
  }

  private computeRules(): QualityRule[] {
    const openIds = this.getOpenDefectSet();
    return RULE_BLUEPRINTS.map((bp) => {
      const activeLinked = bp.linkedDefectIds.filter((id) => openIds.has(id));
      const dynamicCustomFailed = this.defects
        .filter((d) => d.status === 'Open' && d.detectedByRuleId === bp.id && !bp.linkedDefectIds.includes(d.id));
      const allOpenForRule = [...activeLinked, ...dynamicCustomFailed.map((d) => d.id)];
      const failed = allOpenForRule.length > 0;
      const failedRowCount = this.defects
        .filter((d) => allOpenForRule.includes(d.id))
        .reduce((acc, d) => acc + d.affectedRows, 0);

      let actualValue = failed ? bp.failActualValue : bp.passActualValue;
      if (dynamicCustomFailed.length > 0 && activeLinked.length === 0) {
        actualValue = `${failedRowCount} rows flagged by rule`;
      }

      return {
        id: bp.id,
        dimension: bp.dimension,
        table: bp.table,
        ruleName: bp.ruleName,
        reconciliationMethod: bp.reconciliationMethod,
        sqlQuery: bp.sqlQuery,
        expectedValue: bp.expectedValue,
        actualValue,
        failedRowCount,
        status: failed ? 'Failed' : 'Passed',
        linkedDefectIds: allOpenForRule,
      };
    });
  }

  private computePytestCases(rules: QualityRule[]): PytestCase[] {
    const ruleMap = new Map(rules.map((r) => [r.id, r]));
    return PYTEST_BLUEPRINTS.map((bp) => {
      const linkedRule = ruleMap.get(bp.linkedRuleId);
      const isFailed = linkedRule ? linkedRule.status === 'Failed' : false;
      const actualResult = isFailed
        ? `AssertionError: ${linkedRule?.actualValue ?? 'Constraint violated'}`
        : bp.expectedResult;

      return {
        id: bp.id,
        scenario: bp.scenario,
        table: bp.table,
        nodeId: bp.nodeId,
        title: bp.title,
        description: bp.description,
        pythonCode: bp.pythonCode,
        expectedResult: bp.expectedResult,
        actualResult,
        durationMs: bp.durationMs,
        status: isFailed ? 'Failed' : 'Passed',
        linkedRuleId: bp.linkedRuleId,
      };
    });
  }

  private computeDatabricksCells(tables: SourceTableMetric[], rules: QualityRule[]): DatabricksCell[] {
    const totalRows = tables.reduce((acc, t) => acc + t.s3Records, 0);
    const dupTotal = tables.reduce((acc, t) => acc + t.duplicateCount, 0);
    const nullTotal = tables.reduce((acc, t) => acc + t.nullCount, 0);
    const failedAccuracy = rules.filter((r) => r.dimension === 'Accuracy' && r.status === 'Failed').length;
    const failedConsistency = rules.filter((r) => r.dimension === 'Consistency' && r.status === 'Failed').length;
    const failedTimeliness = rules.filter((r) => r.dimension === 'Timeliness' && r.status === 'Failed').length;

    return [
      {
        cellNumber: 1,
        title: 'Ingest S3 Parquet/CSV/JSON Staging Manifests into Spark DataFrames',
        language: 'python',
        tableScope: 'All 6 Source Tables',
        code: `from pyspark.sql import functions as F\ntables = ["customers", "products", "orders", "order_items", "payments", "shipments"]\ns3_dfs = {t: spark.read.parquet(f"s3://raw-enterprise-lake/staged/{t}/dt=2026-11-20/") for t in tables}\ntotal_rows = sum(df.count() for df in s3_dfs.values())\nprint(f"Loaded {total_rows:,} records across {len(tables)} tables")`,
        outputSummary: `Loaded ${totalRows.toLocaleString()} records across 6 tables. Schema drift check: 0 breaking types.`,
        rowsChecked: totalRows,
        anomaliesFound: 0,
        executionSec: 4.8,
        status: 'Passed',
      },
      {
        cellNumber: 2,
        title: 'Deduplication & Primary/Composite Key Window Check',
        language: 'python',
        tableScope: 'orders, customers, payments, products, order_items, shipments',
        code: `from pyspark.sql.window import Window\nfor tbl, pk in [("orders", "order_id"), ("payments", "payment_id"), ("customers", "email")]:\n    dups = s3_dfs[tbl].groupBy(pk).count().filter(F.col("count") > 1)\n    assert dups.count() == 0, f"Duplicates found in {tbl}: {dups.count()}"`,
        outputSummary: dupTotal > 0 ? `Detected ${dupTotal} duplicate rows across Redshift target vs deduplicated S3 window.` : '0 duplicate keys detected across all 6 tables.',
        rowsChecked: totalRows,
        anomaliesFound: dupTotal,
        executionSec: 3.2,
        status: dupTotal > 0 ? 'Failed' : 'Passed',
      },
      {
        cellNumber: 3,
        title: 'Null & Mandatory Schema Completeness Transformation Check',
        language: 'python',
        tableScope: 'orders, customers, order_items, payments, products, shipments',
        code: `mandatory_cols = {"orders": ["customer_id", "currency_code"], "customers": ["email"], "order_items": ["unit_price"], "payments": ["payment_method"]}\nfor tbl, cols in mandatory_cols.items():\n    for c in cols:\n        null_cnt = s3_dfs[tbl].filter(F.col(c).isNull() | (F.trim(F.col(c)) == "")).count()`,
        outputSummary: nullTotal > 0 ? `Flagged ${nullTotal} mandatory NULL field violations across 6 source tables.` : 'All mandatory fields populated (0 NULL violations).',
        rowsChecked: totalRows,
        anomaliesFound: nullTotal,
        executionSec: 2.6,
        status: nullTotal > 0 ? 'Failed' : 'Passed',
      },
      {
        cellNumber: 4,
        title: 'Cross-Table Join & Aggregation Accuracy Reconciliation',
        language: 'sql',
        tableScope: 'orders, order_items, payments, products',
        code: `SELECT o.order_id, o.total_amount, SUM(oi.quantity * oi.unit_price) + o.tax_amount - o.discount_amount AS calc_total\nFROM orders o JOIN order_items oi ON o.order_id = oi.order_id\nGROUP BY o.order_id, o.total_amount, o.tax_amount, o.discount_amount\nHAVING ABS(o.total_amount - calc_total) > 0.01`,
        outputSummary: failedAccuracy + failedConsistency > 0
          ? `${failedAccuracy} accuracy and ${failedConsistency} referential consistency rules failed reconciliation.`
          : '100% join parity and aggregate sum accuracy verified.',
        rowsChecked: (tables.find((t) => t.tableName === 'orders')?.s3Records ?? 15840) + (tables.find((t) => t.tableName === 'order_items')?.s3Records ?? 16320),
        anomaliesFound: failedAccuracy + failedConsistency,
        executionSec: 5.4,
        status: failedAccuracy + failedConsistency > 0 ? 'Failed' : 'Passed',
      },
      {
        cellNumber: 5,
        title: 'Warehouse Refresh Watermark & Broken Refresh SLA Check',
        language: 'python',
        tableScope: 'shipments, payments, orders, order_items',
        code: `for tbl in tables:\n    lag_mins = get_redshift_refresh_lag_minutes(tbl)\n    if lag_mins > 60:\n        raise ValueError(f"SLA Breach / Broken Refresh on {tbl}: {lag_mins} mins")`,
        outputSummary: failedTimeliness > 0
          ? `${failedTimeliness} timeliness rules failed (shipments broken refresh at 1,413 mins lag).`
          : 'All 6 Redshift warehouse tables refreshed within SLA window.',
        rowsChecked: 6,
        anomaliesFound: failedTimeliness,
        executionSec: 1.9,
        status: failedTimeliness > 0 ? 'Failed' : 'Passed',
      },
      {
        cellNumber: 6,
        title: 'Write Reconciliation Summary Artifact for pytest & Excel Exporter',
        language: 'python',
        tableScope: 'Pipeline Summary',
        code: `summary_df.write.mode("overwrite").json("s3://raw-enterprise-lake/qa-reports/latest_run.json")\nprint("Exported reconciliation artifact for pytest and Excel workbook generation.")`,
        outputSummary: 'Artifact written to s3://raw-enterprise-lake/qa-reports/latest_run.json (ready for pytest & Excel).',
        rowsChecked: 44,
        anomaliesFound: 0,
        executionSec: 1.1,
        status: 'Passed',
      },
    ];
  }

  private computeLambdaEvents(tables: SourceTableMetric[]): LambdaTriggerEvent[] {
    return tables.map((t, i) => ({
      eventId: `evt-lambda-${20261120}-${i + 1}`,
      timestampUtc: t.tableName === 'shipments' ? '2026-11-20T18:49:10Z' : t.lastRefreshUtc,
      s3Bucket: 'raw-enterprise-lake',
      s3Key: t.s3Path.replace('s3://raw-enterprise-lake/', ''),
      objectSizeMb: Number(((t.s3Records * 0.42) / 100).toFixed(2)),
      functionName: 'fn-s3-ingest-dispatcher',
      targetGlueJob: `glue-etl-${t.tableName.replace('_', '-')}`,
      durationMs: 310 + i * 74,
      status: t.refreshStatus === 'Broken Refresh' ? 'Timeout Warning' : t.refreshStatus === 'Stale SLA' ? 'Retried' : 'Succeeded',
    }));
  }

  private computeGlueJobs(tables: SourceTableMetric[]): GlueJobRun[] {
    return tables.map((t, i) => ({
      jobName: `glue-etl-${t.tableName.replace('_', '-')}`,
      runId: `jr_${20261120}_${100 + i}`,
      sourceTable: t.tableName,
      dpuAllocated: t.s3Records > 10000 ? 10 : 4,
      recordsRead: t.s3Records,
      recordsWritten: t.redshiftLoaded,
      recordsQuarantined: t.nullCount,
      durationSec: Number((12.4 + t.s3Records / 1100).toFixed(1)),
      sparkVersion: 'Glue 4.0 (Spark 3.3, Python 3.10)',
      status:
        t.refreshStatus === 'Broken Refresh'
          ? 'Partial Load'
          : t.duplicateCount > 0 || t.nullCount > 0
            ? 'Succeeded with Warnings'
            : 'Succeeded',
    }));
  }

  private computeRunSummary(triggerSource: PipelineRunSummary['triggerSource'], notes: string): PipelineRunSummary {
    const tables = this.computeTables();
    const rules = this.computeRules();
    const tests = this.computePytestCases(rules);

    const totalRecordsProcessed = tables.reduce((acc, t) => acc + t.s3Records, 0);
    const rulesPassed = rules.filter((r) => r.status === 'Passed').length;
    const rulesFailed = rules.length - rulesPassed;
    const testsPassed = tests.filter((t) => t.status === 'Passed').length;
    const testsFailed = tests.length - testsPassed;
    const openDefects = this.defects.filter((d) => d.status === 'Open').length;
    const resolvedDefects = this.defects.length - openDefects;
    const passRatePct = Number(((testsPassed / tests.length) * 100).toFixed(1));

    return {
      runId: `RUN-2026-${this.runCounter}`,
      executedAtUtc: new Date().toISOString(),
      triggerSource,
      totalRecordsProcessed,
      tablesValidated: tables.length,
      totalRules: rules.length,
      rulesPassed,
      rulesFailed,
      totalTests: tests.length,
      testsPassed,
      testsFailed,
      openDefects,
      resolvedDefects,
      passRatePct,
      durationSec: Number((38.4 + Math.random() * 6.5).toFixed(1)),
      notes,
    };
  }

  public getSnapshot(): PipelineSnapshot {
    const tables = this.computeTables();
    const qualityRules = this.computeRules();
    const pytestCases = this.computePytestCases(qualityRules);
    const databricksNotebook = this.computeDatabricksCells(tables, qualityRules);
    const lambdaEvents = this.computeLambdaEvents(tables);
    const glueJobs = this.computeGlueJobs(tables);
    const currentRun = this.runHistory[this.runHistory.length - 1];

    return {
      projectMeta: {
        name: 'Cloud Data Pipeline Testing Platform',
        releaseDate: 'November 2026',
        description: 'Testing framework that verifies data moved from files into a cloud warehouse arrives complete and correct.',
        techStack: ['AWS S3', 'Glue', 'Lambda', 'Redshift', 'Databricks', 'Python', 'pytest', 'SQL', 'Excel'],
      },
      currentRun,
      tables,
      lambdaEvents,
      glueJobs,
      databricksNotebook,
      qualityRules,
      pytestCases,
      defects: [...this.defects],
      runHistory: [...this.runHistory].reverse(),
    };
  }

  public getSnapshotForRun(runId: string): PipelineSnapshot {
    const snap = this.getSnapshot();
    const found = this.runHistory.find((r) => r.runId === runId);
    if (found) {
      return {
        ...snap,
        currentRun: found,
      };
    }
    return snap;
  }

  public triggerNewRun(triggerSource: PipelineRunSummary['triggerSource'] = 'Manual QA Trigger', notes?: string): PipelineSnapshot {
    this.runCounter += 1;
    const summary = this.computeRunSummary(
      triggerSource,
      notes ?? 'Full S3-to-Redshift reconciliation across 6 source tables, 44 quality rules, and 64 pytest scenarios.'
    );
    this.runHistory.push(summary);
    return this.getSnapshot();
  }

  public resolveDefect(defectId: string): PipelineSnapshot {
    this.defects = this.defects.map((d) => (d.id === defectId ? { ...d, status: 'Resolved' } : d));
    return this.triggerNewRun('Manual QA Trigger', `Remediated defect ${defectId} in Glue/Databricks transform and re-verified Redshift.`);
  }

  public resolveAllDefects(): PipelineSnapshot {
    this.defects = this.defects.map((d) => ({ ...d, status: 'Resolved' }));
    return this.triggerNewRun('Manual QA Trigger', 'Applied all 28 Glue deduplication, null-handling, and Redshift refresh fixes.');
  }

  public injectFault(faultType: 'duplicates' | 'nulls' | 'broken_refresh' | 'reset_baseline'): PipelineSnapshot {
    if (faultType === 'reset_baseline') {
      this.defects = createInitialDefects();
      this.customAddedRecords = {
        customers: 0,
        products: 0,
        orders: 0,
        order_items: 0,
        payments: 0,
        shipments: 0,
      };
      return this.triggerNewRun('Scheduled Regression', 'Reset to baseline 28-defect S3-to-Redshift regression snapshot.');
    }

    if (faultType === 'duplicates') {
      this.defects = this.defects.map((d) =>
        d.category === 'Duplicate Records' ? { ...d, status: 'Open' } : d
      );
      return this.triggerNewRun('Lambda S3 Put', 'Injected duplicate primary keys in S3 landing feed (Glue upsert disabled).');
    }

    if (faultType === 'nulls') {
      this.defects = this.defects.map((d) =>
        d.category === 'Null Violations' ? { ...d, status: 'Open' } : d
      );
      return this.triggerNewRun('Lambda S3 Put', 'Injected mandatory column NULL violations from malformed S3 drop.');
    }

    this.defects = this.defects.map((d) =>
      d.category === 'Broken Refresh' ? { ...d, status: 'Open' } : d
    );
    return this.triggerNewRun('Lambda S3 Put', 'Simulated broken Redshift COPY refresh and watermark SLA breach.');
  }

  public ingestCustomSource(tableName: string, rawContent: string, format: 'csv' | 'json'): PipelineSnapshot {
    const validTable = BASE_TABLES.some((t) => t.tableName === tableName);
    const targetTable = validTable ? tableName : 'orders';
    let rows: Array<Record<string, unknown>> = [];

    if (format === 'json') {
      try {
        const parsed = JSON.parse(rawContent);
        rows = Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        rows = rawContent
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean)
          .map((line, i) => {
            try {
              return JSON.parse(line) as Record<string, unknown>;
            } catch {
              return { raw_line: line, row_idx: i };
            }
          });
      }
    } else {
      const lines = rawContent.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      if (lines.length >= 2) {
        const headers = lines[0].split(',').map((h) => h.trim());
        rows = lines.slice(1).map((line) => {
          const vals = line.split(',').map((v) => v.trim());
          const obj: Record<string, unknown> = {};
          headers.forEach((h, idx) => {
            obj[h] = vals[idx] ?? '';
          });
          return obj;
        });
      } else if (lines.length === 1) {
        rows = [{ value: lines[0] }];
      }
    }

    const rowCount = Math.max(1, rows.length);
    this.customAddedRecords[targetTable] = (this.customAddedRecords[targetTable] ?? 0) + rowCount;

    // Inspect uploaded data for real nulls, duplicates, or negative values
    let nullFound = 0;
    let negFound = 0;
    const seenKeys = new Set<string>();
    let dupFound = 0;
    const pkCol = BASE_TABLES.find((t) => t.tableName === targetTable)?.primaryKey ?? 'id';

    rows.forEach((r, idx) => {
      const pkVal = String(r[pkCol] ?? r['id'] ?? `${targetTable}-${idx}`);
      if (seenKeys.has(pkVal)) dupFound += 1;
      seenKeys.add(pkVal);

      Object.values(r).forEach((v) => {
        if (v === null || v === undefined || String(v).trim() === '' || String(v).toLowerCase() === 'null') {
          nullFound += 1;
        }
        const num = Number(v);
        if (!Number.isNaN(num) && num < 0) {
          negFound += 1;
        }
      });
    });

    const nextIdx = this.defects.length + 1;
    if (dupFound > 0) {
      this.defects.unshift({
        id: `DEF-${String(nextIdx).padStart(3, '0')}`,
        category: 'Duplicate Records',
        severity: 'Critical',
        table: targetTable,
        title: `Custom S3 upload contained ${dupFound} duplicate ${pkCol} keys`,
        description: `Uploaded ${format.toUpperCase()} drop into ${targetTable} triggered duplicate key failure in Glue pre-flight.`,
        affectedRows: dupFound,
        detectedByRuleId: targetTable === 'orders' ? 'DQ-24' : targetTable === 'payments' ? 'DQ-26' : 'DQ-22',
        detectedByTestId: 'TC-026',
        status: 'Open',
        remediationHint: `Deduplicate uploaded ${pkCol} keys before Redshift COPY.`,
        sampleDiff: [
          { recordKey: pkCol, s3SourceValue: `${rowCount} uploaded rows (${dupFound} dups)`, redshiftTargetValue: 'Blocked / Quarantined', issueNote: 'Detected in live S3 file upload' },
        ],
      });
    }

    if (nullFound > 0) {
      this.defects.unshift({
        id: `DEF-${String(this.defects.length + 1).padStart(3, '0')}`,
        category: 'Null Violations',
        severity: 'High',
        table: targetTable,
        title: `Custom S3 upload contained ${nullFound} empty/NULL cells`,
        description: `Uploaded ${format.toUpperCase()} file for ${targetTable} had blank or null fields.`,
        affectedRows: nullFound,
        detectedByRuleId: targetTable === 'customers' ? 'DQ-02' : targetTable === 'products' ? 'DQ-06' : 'DQ-03',
        detectedByTestId: 'TC-021',
        status: 'Open',
        remediationHint: 'Fill required fields in source file or apply Glue COALESCE fallback.',
        sampleDiff: [
          { recordKey: 'UPLOAD_CELL', s3SourceValue: `${nullFound} null/empty cells`, redshiftTargetValue: 'NULL in staging', issueNote: 'Detected in live S3 file upload' },
        ],
      });
    }

    if (negFound > 0) {
      this.defects.unshift({
        id: `DEF-${String(this.defects.length + 1).padStart(3, '0')}`,
        category: 'Validity & Boundary',
        severity: 'High',
        table: targetTable,
        title: `Custom S3 upload contained ${negFound} negative numeric values`,
        description: `Uploaded ${format.toUpperCase()} file for ${targetTable} failed non-negative numeric boundary check.`,
        affectedRows: negFound,
        detectedByRuleId: 'DQ-29',
        detectedByTestId: 'TC-033',
        status: 'Open',
        remediationHint: 'Reject negative amounts/prices in Glue validator.',
        sampleDiff: [
          { recordKey: 'NUMERIC_VAL', s3SourceValue: `${negFound} negative values`, redshiftTargetValue: 'Failed CHECK >= 0', issueNote: 'Detected in live S3 file upload' },
        ],
      });
    }

    return this.triggerNewRun(
      'Custom S3 Upload',
      `Ingested ${rowCount} custom ${format.toUpperCase()} rows into s3://raw-enterprise-lake/inbound/${targetTable}/ (${dupFound} dups, ${nullFound} nulls, ${negFound} negative values).`
    );
  }

  public executeSql(rawQuery: string): SqlExecutionResponse {
    const start = Date.now();
    const query = rawQuery.trim();
    const lower = query.toLowerCase();
    const snap = this.getSnapshot();

    // Check if query matches one of the 44 rule SQL queries
    const matchedRule = snap.qualityRules.find(
      (r) => r.sqlQuery.trim().toLowerCase() === lower
    );

    if (matchedRule) {
      const linkedDefects = snap.defects.filter((d) => matchedRule.linkedDefectIds.includes(d.id));
      const rows = linkedDefects.length > 0
        ? linkedDefects.map((d) => ({
            rule_id: matchedRule.id,
            table_name: d.table,
            defect_id: d.id,
            category: d.category,
            affected_rows: d.affectedRows,
            expected: matchedRule.expectedValue,
            actual: matchedRule.actualValue,
            status: matchedRule.status,
          }))
        : [
            {
              rule_id: matchedRule.id,
              table_name: matchedRule.table,
              dimension: matchedRule.dimension,
              reconciliation_method: matchedRule.reconciliationMethod,
              expected: matchedRule.expectedValue,
              actual: matchedRule.actualValue,
              failed_rows: 0,
              status: 'Passed',
            },
          ];
      return {
        query,
        executionMs: Math.max(14, Date.now() - start + 28),
        rowCount: rows.length,
        columns: Object.keys(rows[0]),
        rows,
        sourceEngine: 'Amazon Redshift + S3 Spectrum Staging',
      };
    }

    // Handle reconciliation summary / joins / aggregations / defects queries
    if (lower.includes('defect') || lower.includes('issue')) {
      const rows = snap.defects.slice(0, 15).map((d) => ({
        defect_id: d.id,
        table_name: d.table,
        category: d.category,
        severity: d.severity,
        affected_rows: d.affectedRows,
        rule_id: d.detectedByRuleId,
        status: d.status,
      }));
      return {
        query,
        executionMs: 34,
        rowCount: rows.length,
        columns: Object.keys(rows[0]),
        rows,
        sourceEngine: 'Amazon Redshift QA Audit Schema',
      };
    }

    if (lower.includes('join') && lower.includes('order_items')) {
      const orderDefect = snap.defects.find((d) => d.id === 'DEF-020');
      const rows =
        orderDefect?.status === 'Open'
          ? [
              { order_id: 'ORD-908411', header_total: 129.99, items_calc_total: 134.99, variance: -5.0, issue: 'Coupon discount omitted' },
              { order_id: 'ORD-909102', header_total: 248.50, items_calc_total: 249.00, variance: -0.5, issue: 'Tax rounding drift' },
              { order_id: 'ORD-911408', header_total: 88.20, items_calc_total: 90.20, variance: -2.0, issue: 'Promo shipping offset' },
            ]
          : [{ result: '0 mismatched orders between orders and order_items (100% reconciled)' }];
      return {
        query,
        executionMs: 62,
        rowCount: rows.length,
        columns: Object.keys(rows[0]),
        rows,
        sourceEngine: 'Amazon Redshift + S3 Spectrum Staging',
      };
    }

    if (lower.includes('group by') || lower.includes('having') || lower.includes('duplicate')) {
      const dupDefects = snap.defects.filter((d) => d.category === 'Duplicate Records' && d.status === 'Open');
      const rows =
        dupDefects.length > 0
          ? dupDefects.map((d) => ({
              table_name: d.table,
              defect_id: d.id,
              duplicate_rows: d.affectedRows,
              sample_key: d.sampleDiff[0]?.recordKey ?? 'N/A',
              status: d.status,
            }))
          : [{ table_name: 'all_tables', duplicate_rows: 0, status: 'Passed (0 duplicates)' }];
      return {
        query,
        executionMs: 41,
        rowCount: rows.length,
        columns: Object.keys(rows[0]),
        rows,
        sourceEngine: 'Amazon Redshift + S3 Spectrum Staging',
      };
    }

    // Default: table-by-table S3 vs Redshift reconciliation breakdown
    const filteredTables = snap.tables.filter((t) => lower.includes(t.tableName));
    const targetList = filteredTables.length > 0 ? filteredTables : snap.tables;
    const rows = targetList.map((t) => ({
      table_name: t.tableName,
      s3_records: t.s3Records,
      glue_processed: t.glueProcessed,
      redshift_loaded: t.redshiftLoaded,
      delta: t.deltaRecords,
      null_violations: t.nullCount,
      duplicates: t.duplicateCount,
      refresh_status: t.refreshStatus,
    }));

    return {
      query,
      executionMs: 39,
      rowCount: rows.length,
      columns: Object.keys(rows[0]),
      rows,
      sourceEngine: 'Amazon Redshift + S3 Spectrum Staging',
    };
  }
}

export const pipelineEngine = new PipelineEngine();
