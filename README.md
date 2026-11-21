# Cloud Data Pipeline Testing Platform

An end-to-end data quality and reconciliation testing framework that verifies data moved from **AWS S3** landing files through **AWS Lambda**, **AWS Glue**, and **Databricks** into **Amazon Redshift** arrives complete and correct.

---

## Key Highlights

- **S3-to-Redshift Pipeline Verification**: Processes and reconciles **52,480+ records** across **6 source tables** (`customers`, `products`, `orders`, `order_items`, `payments`, `shipments`) in Parquet, CSV, and JSON formats.
- **Databricks Transformation Checks**: Inspectable 6-cell PySpark and Spark SQL QA notebook (`/Workspace/QA/s3_redshift_transformation_checks.py`) validating schemas, deduplication windows, null thresholds, join parity, and refresh watermarks.
- **44 Data Quality Rules (6 Dimensions)**: Reconciles source and warehouse tables via SQL **joins**, **filters**, and **aggregations** across **Completeness**, **Accuracy**, **Consistency**, **Uniqueness**, **Validity**, and **Timeliness**.
- **64 Automated `pytest` Cases (4 Scenarios)**: Covers **Positive (20)**, **Negative (16)**, **Boundary (14)**, and **Failure (14)** test scenarios with inspectable Python test code and downloadable `.py` suite export.
- **28 Tracked Defects & Live Remediation**: Surfaces **Duplicate Records**, **Null Violations**, **Broken Refreshes**, **Referential Mismatches**, and **Validity & Boundary** issues with side-by-side S3 vs. Redshift sample record diffs and one-click Glue fix re-runs.
- **Multi-Sheet Excel Run Summaries (`.xlsx`)**: Generates formatted 5-sheet Excel workbooks (`Run Summary`, `Table Reconciliation`, `Quality Rules (44)`, `Pytest Cases (64)`, `Defect Log`) for every pipeline execution.

---

## Architecture & Pipeline Flow

```text
AWS S3 Landing Zone (6 Source Tables, 52,480+ Records)
        │
        ▼  s3:ObjectCreated:Put
AWS Lambda Dispatcher (fn-s3-ingest-dispatcher)
        │
        ▼  PySpark ETL & Type Casting
AWS Glue Jobs (glue-etl-*)
        │
        ▼  Transformation & Quality Checks
Databricks QA Notebook (s3_redshift_transformation_checks.py)
        │
        ▼  COPY / MERGE Staging Swap
Amazon Redshift Warehouse (analytics_dw.public.*)
        │
        ├──▶ SQL Reconciliation Engine (44 Rules / 6 Dimensions)
        ├──▶ pytest Validation Suite (64 Test Cases)
        └──▶ Excel Run Summary Exporter (.xlsx)
```

---

## Source Tables Covered

| Table | Format | S3 Baseline Records | Primary Key |
| :--- | :--- | ---: | :--- |
| `customers` | `parquet` | 8,420 | `customer_id` |
| `products` | `csv` | 2,160 | `product_id` |
| `orders` | `json` | 15,840 | `order_id` |
| `order_items` | `parquet` | 16,320 | `order_item_id` |
| `payments` | `csv` | 5,410 | `payment_id` |
| `shipments` | `parquet` | 4,330 | `shipment_id` |
| **Total** | | **52,480** | |

---

## Tech Stack

- **Data & Pipeline Ecosystem**: AWS S3, AWS Glue, AWS Lambda, Amazon Redshift, Databricks, Python, `pytest`, SQL, Excel (`exceljs`)
- **Application Frontend**: React 19, TypeScript, Tailwind CSS v4, Lucide Icons
- **Backend Server**: Node.js, Express, `tsx`, Vite

---

## Project Structure

```text
├── server.ts                       # Express API server & Vite middleware entry point
├── server/
│   ├── pipelineData.ts             # Pipeline state engine (tables, 44 rules, 64 tests, 28 defects, SQL runner)
│   └── excelExport.ts              # Multi-sheet .xlsx workbook generator using ExcelJS
├── shared/
│   └── types.ts                    # Shared TypeScript interfaces across server and client
├── src/
│   ├── App.tsx                     # Workspace shell, sidebar navigation, top action bar
│   ├── main.tsx                    # React entry point
│   ├── index.css                   # Tailwind CSS v4 & typography configuration
│   └── components/
│       ├── OverviewView.tsx        # KPIs, 5-stage pipeline topology, 6-table matrix, run history
│       ├── QualitySqlView.tsx      # 6 quality dimensions, 44 rules, interactive SQL reconciliation console
│       ├── DatabricksEtlView.tsx   # Databricks notebook, Glue/Lambda telemetry, S3 CSV/JSON uploader, fault simulator
│       ├── PytestSuiteView.tsx     # 64 pytest test cases & Python assertion code inspector
│       ├── DefectsView.tsx         # 28 defect ledger, S3 vs Redshift sample diffs, remediation actions
│       └── ExcelReportView.tsx     # 5-sheet Excel workbook preview & .xlsx download
├── index.html
├── metadata.json
├── package.json
└── tsconfig.json
```

---

## API Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/pipeline/state` | Returns the active pipeline snapshot, tables, rules, tests, defects, and run history |
| `POST` | `/api/pipeline/run` | Executes a new end-to-end validation run and appends it to run history |
| `POST` | `/api/pipeline/fix-defect` | Resolves a single defect (`{ defectId }`) and re-runs reconciliation |
| `POST` | `/api/pipeline/fix-all` | Applies all Glue/Databricks fixes and runs full verification |
| `POST` | `/api/pipeline/inject-fault` | Simulates `duplicates`, `nulls`, `broken_refresh`, or `reset_baseline` |
| `POST` | `/api/pipeline/upload-source` | Ingests custom CSV/JSON rows into a selected S3 source table and validates anomalies |
| `POST` | `/api/sql/execute` | Runs SQL reconciliation queries (`{ query }`) and returns tabular results |
| `GET` | `/api/runs/:runId/excel` | Downloads a formatted 5-sheet `.xlsx` summary workbook for the specified run |
| `GET` | `/api/export/pytest` | Downloads the complete 64-case `test_s3_redshift_pipeline.py` file |
| `GET` | `/api/export/databricks` | Downloads the Databricks notebook script `s3_redshift_transformation_checks.py` |

---

## Getting Started

### Prerequisites

- **Node.js** `v22+`
- **npm**

### Installation & Local Development

```bash
# Install dependencies
npm install

# Start the development server (Express + Vite on port 3000)
npm run dev
```

Open `http://localhost:3000` in your browser.

### Available Scripts

| Command | Description |
| :--- | :--- |
| `npm run dev` | Runs `tsx server.ts` on port `3000` with Vite dev middleware |
| `npm run build` | Builds the production frontend bundle into `dist/` |
| `npm start` | Starts the production server via `node server.ts` |
| `npm run lint` | Runs TypeScript type checking (`tsc --noEmit`) |
