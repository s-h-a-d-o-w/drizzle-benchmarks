import { DuckDBInstance } from '@duckdb/node-api';
import fs from 'fs';
import { parseArgs } from 'util';

const {
  values: { folder },
} = parseArgs({
  args: process.argv,
  options: {
    folder: {
      type: 'string',
      default: 'results',
    },
  },
  strict: true,
  allowPositionals: true,
});

if (!folder) {
  throw new Error('folder is required');
}

const bigIntReplacer = (_key: string, value: unknown) => typeof value === 'bigint' ? Number(value) : value;

const main = async () => {
  const instance = await DuckDBInstance.create(':memory:');
  const connection = await instance.connect();

  const files = fs
    .readdirSync(folder)
    .filter((file) => file.endsWith('.parquet'))
    .map((file) => file.replace('.parquet', ''));

  const data: Record<string, any[]> = {};
  for (const testName of files) {
    const cpuUsageFilename = `${folder}/cpu-usage-${testName}.csv`;
    const memoryFilename = `${folder}/memory-${testName}.csv`;
    const gcFilename = `${folder}/gc-${testName}.csv`;

    const hasMemoryStats = fs.existsSync(memoryFilename);
    const hasGcStats = fs.existsSync(gcFilename);

    const coreColumns = fs.readFileSync(cpuUsageFilename, 'utf8').split(/\r?\n/)[0]
      .split(',')
      .slice(0, -1);

    const cpuAverageExpr = `(${coreColumns.join(' + ')}) / ${coreColumns.length}`;

    const memoryCte = hasMemoryStats ? `
      , memory_stats AS (
        SELECT
          time_bucket(INTERVAL '1s', epoch_ms(timestamp)) AS "time",
          AVG(heapUsed) AS "heap_used_mb",
          AVG(heapTotal) AS "heap_total_mb",
          AVG(rss) AS "rss_mb",
          MAX(heapUsed) AS "heap_used_max_mb",
          AVG(external) AS "external_mb"
        FROM
          read_csv('${memoryFilename}')
        GROUP BY time
      )` : '';

    const gcCte = hasGcStats ? `
      , gc_stats AS (
        SELECT
          time_bucket(INTERVAL '1s', epoch_ms(timestamp)) AS "time",
          SUM(gcCount) AS "gc_count",
          SUM(gcTotalPauseMs) AS "gc_pause_ms",
          SUM(majorCount) AS "gc_major_count",
          SUM(minorCount) AS "gc_minor_count"
        FROM
          read_csv('${gcFilename}')
        GROUP BY time
      )` : '';

    const memorySelect = hasMemoryStats ? `,
        memory_stats.heap_used_mb,
        memory_stats.heap_total_mb,
        memory_stats.rss_mb,
        memory_stats.heap_used_max_mb,
        memory_stats.external_mb` : '';

    const gcSelect = hasGcStats ? `,
        gc_stats.gc_count,
        gc_stats.gc_pause_ms,
        gc_stats.gc_major_count,
        gc_stats.gc_minor_count` : '';

    const memoryJoin = hasMemoryStats ? `
      LEFT JOIN memory_stats ON epoch_ms(cpu_usage.time) = epoch_ms(memory_stats.time)` : '';

    const gcJoin = hasGcStats ? `
      LEFT JOIN gc_stats ON epoch_ms(cpu_usage.time) = epoch_ms(gc_stats.time)` : '';

    const result = await connection.run(
      `
      WITH cpu_usage AS (
        SELECT
          time_bucket(INTERVAL '1s', epoch_ms(timestamp)) AS "time",
          AVG(${cpuAverageExpr}) AS "cpu_average"
        FROM
          read_csv('${cpuUsageFilename}')
        GROUP BY time
        ORDER BY time ASC
      ), reqs_per_sec AS (
        SELECT
          time_bucket(INTERVAL '1s', to_timestamp(timestamp)) AS "time",
          SUM(metric_value) AS "reqs_per_sec"
        FROM
          "${folder}/${testName}.parquet"
        WHERE metric_name = 'http_reqs'
        GROUP BY time
      ), fail_reqs_per_sec AS (
        SELECT
          time_bucket(INTERVAL '1s', to_timestamp(timestamp)) AS "time",
          SUM(metric_value) AS "fail_reqs_per_sec"
        FROM
          "${folder}/${testName}.parquet"
        WHERE
          metric_name = 'http_req_failed'
        GROUP BY time
      ), req_duration AS (
        SELECT
          time_bucket(INTERVAL '1s', to_timestamp(timestamp)) AS "time",
          percentile_cont(0.95) WITHIN GROUP (ORDER BY metric_value) AS "latency_95",
          percentile_cont(0.90) WITHIN GROUP (ORDER BY metric_value) AS "latency_90",
          percentile_cont(0.99) WITHIN GROUP (ORDER BY metric_value) AS "latency_99",
          AVG(metric_value) AS "latency_average"
        FROM
          "${folder}/${testName}.parquet"
        WHERE metric_name = 'http_req_duration'
          AND status < 400
        GROUP BY time
      )${memoryCte}${gcCte}
      SELECT
        cpu_usage.time,
        cpu_usage.cpu_average,
        reqs_per_sec.reqs_per_sec,
        fail_reqs_per_sec.fail_reqs_per_sec,
        req_duration.latency_95,
        req_duration.latency_90,
        req_duration.latency_99,
        req_duration.latency_average${memorySelect}${gcSelect}
      FROM
        cpu_usage
      JOIN reqs_per_sec ON epoch_ms(cpu_usage.time) = epoch_ms(reqs_per_sec.time)
      JOIN fail_reqs_per_sec ON epoch_ms(cpu_usage.time) = epoch_ms(fail_reqs_per_sec.time)
      JOIN req_duration ON epoch_ms(cpu_usage.time) = epoch_ms(req_duration.time)${memoryJoin}${gcJoin}
      ORDER BY cpu_usage.time ASC;
    `,
    );

    console.log(`Processing ${testName}...${hasMemoryStats ? ' (with memory stats)' : ''}${hasGcStats ? ' (with GC stats)' : ''}`);
    const resultData = await result.getRowObjectsJS();
    fs.writeFileSync(`${folder}/${testName}.json`, JSON.stringify(resultData, bigIntReplacer, 2));
    data[testName] = resultData;
  }

  console.log('All data processed');
  fs.writeFileSync(`${folder}/combined-results.json`, JSON.stringify(data, bigIntReplacer, 2));
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
