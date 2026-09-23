param(
  [string]$DbHost = "100.71.81.102",
  [int]$DbPort = 5432,
  [string]$DbName = "groland",
  [string]$DbUser = "postgres",
  [string]$DbPassword = $env:PGPASSWORD,
  [switch]$IncludeObjects,
  [switch]$IncludeRowEstimates,
  [switch]$NoTableGuide,
  [string]$OutputFile
)

$ErrorActionPreference = "Stop"

function Invoke-PsqlCsvData {
  param(
    [string]$Title,
    [string]$Sql,
    [switch]$ShowOutput
  )

  $raw = & psql -w -h $DbHost -p $DbPort -U $DbUser -d $DbName -P pager=off --csv -c $Sql
  if ($LASTEXITCODE -ne 0) {
    throw "psql failed at step: $Title"
  }

  if ($ShowOutput) {
    Write-Host ""
    Write-Host "=== $Title ==="
    if ($raw) {
      $raw | ForEach-Object { Write-Host $_ }
    }
  }

  if (-not $raw) {
    return @()
  }

  return ($raw | ConvertFrom-Csv)
}

function Build-MarkdownReport {
  param(
    [object[]]$Rows,
    [string]$Path
  )

  $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  $lines = New-Object System.Collections.Generic.List[string]

  $lines.Add("# groland Layered Data and Table Guide")
  $lines.Add("")
  $lines.Add(("Generated at: {0}" -f $timestamp))
  $lines.Add("")
  $lines.Add("## Layer Definitions")
  $lines.Add("- `ods`: raw ingestion layer, keeps source-level detail.")
  $lines.Add("- `dwd`: detailed modeled layer, unified business grain.")
  $lines.Add("- `dws`: subject summary layer, period/topic aggregations.")
  $lines.Add("- `ads`: application service layer for reports and dashboards.")

  foreach ($schema in @("ods", "dwd", "dws", "ads")) {
    $schemaRows = @($Rows | Where-Object { $_.schema_name -eq $schema })
    if ($schemaRows.Count -eq 0) {
      continue
    }

    $lines.Add("")
    $lines.Add(("## {0}" -f $schema))

    foreach ($row in $schemaRows) {
      $name = "{0}.{1}" -f $row.schema_name, $row.object_name
      $comment = if ([string]::IsNullOrWhiteSpace($row.table_comment)) { "(no table comment)" } else { $row.table_comment }
      $pkText = if ([string]::IsNullOrWhiteSpace($row.pk_columns)) { "none" } else { $row.pk_columns }

      if ([string]::IsNullOrWhiteSpace($row.sample_commented_columns)) {
        $fieldText = $row.sample_columns
      }
      else {
        $fieldText = $row.sample_commented_columns
      }

      if ([string]::IsNullOrWhiteSpace($fieldText)) {
        $fieldText = "(no columns found)"
      }

      $lines.Add(("- `{0}` (`{1}`): {2}" -f $name, $row.object_type, $comment))
      $lines.Add(("  - Usage: {0}" -f $row.usage_hint))
      $lines.Add(("  - PK: {0}; Estimated rows: {1}" -f $pkText, $row.est_rows))
      $lines.Add(("  - Fields ({0}/{1} commented): {2}" -f $row.commented_columns, $row.column_count, $fieldText))
    }
  }

  Set-Content -Path $Path -Value $lines -Encoding UTF8
}

if ($DbPassword) {
  $env:PGPASSWORD = $DbPassword
}

if (-not $env:PGPASSWORD) {
  Write-Warning "PGPASSWORD is empty. psql will not prompt due to -w; pass -DbPassword or set PGPASSWORD first."
}

$env:PGCONNECT_TIMEOUT = "5"

$sqlConnection = @"
SELECT current_database() AS db,
       current_user AS user_name,
       inet_server_addr()::text AS server_ip,
       inet_server_port() AS server_port;
"@

$sqlVersion = @"
SELECT version();
"@

$sqlSchemas = @"
SELECT schema_name
FROM information_schema.schemata
WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
ORDER BY schema_name;
"@

$sqlLayerSummary = @"
WITH s AS (
  SELECT schema_name
  FROM information_schema.schemata
  WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
), o AS (
  SELECT n.nspname AS schema_name,
         c.relkind
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
)
SELECT s.schema_name,
       COALESCE(SUM((o.relkind IN ('r', 'p'))::int), 0) AS tables,
       COALESCE(SUM((o.relkind = 'v')::int), 0) AS views,
       COALESCE(SUM((o.relkind = 'm')::int), 0) AS matviews,
       COALESCE(SUM((o.relkind = 'S')::int), 0) AS sequences
FROM s
LEFT JOIN o ON o.schema_name = s.schema_name
GROUP BY s.schema_name
ORDER BY s.schema_name;
"@

$sqlObjects = @"
SELECT n.nspname AS schema_name,
       CASE c.relkind
         WHEN 'r' THEN 'table'
         WHEN 'p' THEN 'partitioned_table'
         WHEN 'v' THEN 'view'
         WHEN 'm' THEN 'materialized_view'
       END AS object_type,
       c.relname AS object_name
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname IN ('ods', 'dwd', 'dws', 'ads')
  AND c.relkind IN ('r', 'p', 'v', 'm')
ORDER BY n.nspname, object_type, c.relname;
"@

$sqlRows = @"
SELECT schemaname,
       relname AS table_name,
       n_live_tup AS est_rows
FROM pg_stat_user_tables
WHERE schemaname IN ('ods', 'dwd', 'dws', 'ads')
ORDER BY schemaname, n_live_tup DESC;
"@

$sqlTableGuide = @"
WITH rels AS (
  SELECT c.oid,
         n.nspname AS schema_name,
         c.relname AS object_name,
         c.relkind,
         CASE c.relkind
           WHEN 'r' THEN 'table'
           WHEN 'p' THEN 'partitioned_table'
           WHEN 'v' THEN 'view'
           WHEN 'm' THEN 'materialized_view'
         END AS object_type,
         COALESCE(obj_description(c.oid, 'pg_class'), '') AS table_comment
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname IN ('ods', 'dwd', 'dws', 'ads')
    AND c.relkind IN ('r', 'p', 'v', 'm')
), cols AS (
  SELECT a.attrelid AS relid,
         a.attnum,
         a.attname AS column_name,
         COALESCE(d.description, '') AS column_comment
  FROM pg_attribute a
  LEFT JOIN pg_description d
    ON d.objoid = a.attrelid
   AND d.objsubid = a.attnum
  WHERE a.attnum > 0
    AND NOT a.attisdropped
), pks AS (
  SELECT i.indrelid AS relid,
         string_agg(a.attname, ', ' ORDER BY k.ord) AS pk_columns
  FROM pg_index i
  JOIN LATERAL unnest(i.indkey) WITH ORDINALITY AS k(attnum, ord)
    ON true
  JOIN pg_attribute a
    ON a.attrelid = i.indrelid
   AND a.attnum = k.attnum
  WHERE i.indisprimary
  GROUP BY i.indrelid
)
SELECT r.schema_name,
       r.object_name,
       r.object_type,
       COALESCE(s.n_live_tup::bigint, 0) AS est_rows,
       COALESCE(p.pk_columns, '') AS pk_columns,
       r.table_comment,
       CASE
         WHEN r.schema_name = 'ods' THEN 'Raw ingestion baseline and replay source'
         WHEN r.schema_name = 'dwd' AND r.object_name LIKE 'dim_%' THEN 'Dimension master data for joins'
         WHEN r.schema_name = 'dwd' AND r.object_name LIKE 'fact_%' THEN 'Daily business fact table'
         WHEN r.schema_name = 'dwd' THEN 'Detailed cleaned business model'
         WHEN r.schema_name = 'dws' THEN 'Subject-level aggregated dataset'
         WHEN r.schema_name = 'ads' AND r.object_name LIKE 'report_%' THEN 'Report/dashboard serving table'
         WHEN r.schema_name = 'ads' AND r.object_type LIKE '%view%' THEN 'Reporting semantic view'
         ELSE 'Business object'
       END AS usage_hint,
       (SELECT COUNT(*)
          FROM cols c
         WHERE c.relid = r.oid) AS column_count,
       (SELECT COUNT(*)
          FROM cols c
         WHERE c.relid = r.oid
           AND c.column_comment <> '') AS commented_columns,
       COALESCE((
         SELECT string_agg(x.txt, '; ' ORDER BY x.attnum)
         FROM (
           SELECT c.attnum,
                  format('%I(%s)', c.column_name, c.column_comment) AS txt
           FROM cols c
           WHERE c.relid = r.oid
             AND c.column_comment <> ''
           ORDER BY c.attnum
           LIMIT 6
         ) x
       ), '') AS sample_commented_columns,
       COALESCE((
         SELECT string_agg(format('%I', x.column_name), ', ' ORDER BY x.attnum)
         FROM (
           SELECT c.attnum,
                  c.column_name
           FROM cols c
           WHERE c.relid = r.oid
           ORDER BY c.attnum
           LIMIT 8
         ) x
       ), '') AS sample_columns
FROM rels r
LEFT JOIN pks p ON p.relid = r.oid
LEFT JOIN pg_stat_user_tables s ON s.relid = r.oid
ORDER BY r.schema_name, r.object_name;
"@

Write-Host ("Target: {0}@{1}:{2}/{3}" -f $DbUser, $DbHost, $DbPort, $DbName)

Invoke-PsqlCsvData -Title "Connection" -Sql $sqlConnection -ShowOutput | Out-Null
Invoke-PsqlCsvData -Title "Server Version" -Sql $sqlVersion -ShowOutput | Out-Null
Invoke-PsqlCsvData -Title "Schemas" -Sql $sqlSchemas -ShowOutput | Out-Null
Invoke-PsqlCsvData -Title "Layer Summary" -Sql $sqlLayerSummary -ShowOutput | Out-Null

$tableGuideRows = @()
if (-not $NoTableGuide) {
  $tableGuideRows = Invoke-PsqlCsvData -Title "Layer Table Guide (usage/pk/columns)" -Sql $sqlTableGuide -ShowOutput
}

if ($IncludeObjects) {
  Invoke-PsqlCsvData -Title "Layer Objects (ods/dwd/dws/ads)" -Sql $sqlObjects -ShowOutput | Out-Null
}

if ($IncludeRowEstimates) {
  Invoke-PsqlCsvData -Title "Estimated Rows" -Sql $sqlRows -ShowOutput | Out-Null
}

if ($OutputFile) {
  if ($NoTableGuide) {
    Write-Warning "OutputFile requires table guide data. Re-run without -NoTableGuide."
  }
  else {
    Build-MarkdownReport -Rows $tableGuideRows -Path $OutputFile
    Write-Host ""
    Write-Host ("Markdown report written: {0}" -f $OutputFile)
  }
}

Write-Host ""
Write-Host "Done."
