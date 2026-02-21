import fs from 'fs';
import path from 'path';
import { parseArgs } from 'util';

type MetricRow = Record<string, unknown> & { time?: unknown };

const {
  values: { folder, metric },
} = parseArgs({
  args: process.argv.slice(2),
  options: {
    folder: {
      type: 'string',
      default: 'results',
    },
    metric: {
      type: 'string',
    },
  },
  strict: true,
  allowPositionals: false,
});

if (!metric) {
  throw new Error('metric is required');
}

const exportsDir = path.join(folder, 'exports');
const outputFile = path.join(exportsDir, `${metric}.csv`);

const toTimestampMs = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsedNumber = Number(value);
    if (Number.isFinite(parsedNumber)) {
      return parsedNumber;
    }

    const parsedDate = Date.parse(value);
    if (!Number.isNaN(parsedDate)) {
      return parsedDate;
    }
  }

  return null;
};

const toMetricValue = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
};

type SeriesPoint = {
  time: number;
  value: number;
};

const collectSeries = (label: string, rows: unknown): { label: string; points: SeriesPoint[] } | null => {
  if (!Array.isArray(rows)) {
    return null;
  }

  const points: SeriesPoint[] = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') {
      continue;
    }

    const record = row as MetricRow;
    const time = toTimestampMs(record.time);
    const value = toMetricValue(record[metric]);
    if (time === null || value === null) {
      continue;
    }

    points.push({ time, value });
  }

  if (points.length === 0) {
    return null;
  }

  points.sort((a, b) => a.time - b.time);
  const startTime = points[0].time;

  return {
    label,
    points: points.map((point) => ({ time: Math.round((point.time - startTime) / 1000), value: point.value })),
  };
};

const csvEscape = (value: string): string => {
  if (!value.includes(',') && !value.includes('"') && !value.includes('\n')) {
    return value;
  }

  return `"${value.replaceAll('"', '""')}"`;
};

const files = fs
  .readdirSync(folder)
  .filter((file) => file.endsWith('.json') && !file.startsWith('combined-results'))
  .sort((a, b) => a.localeCompare(b));

if (files.length === 0) {
  throw new Error(`no json files found in ${folder}`);
}

fs.mkdirSync(exportsDir, { recursive: true });

const seriesList: { label: string; points: SeriesPoint[] }[] = [];

for (const file of files) {
  const filePath = path.join(folder, file);
  const fileLabel = path.basename(file, '.json');
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;

  if (Array.isArray(data)) {
    const series = collectSeries(fileLabel, data);
    if (series) {
      seriesList.push(series);
    }
    continue;
  }

  if (data && typeof data === 'object') {
    for (const [label, rows] of Object.entries(data as Record<string, unknown>)) {
      const series = collectSeries(label, rows);
      if (series) {
        seriesList.push(series);
      }
    }
  }
}

if (seriesList.length === 0) {
  throw new Error(`No rows found with metric "${metric}" and valid timestamp`);
}

const csvRows = ['label,value,time'];
for (const series of seriesList) {
  for (const point of series.points) {
    csvRows.push(`${csvEscape(series.label)},${point.value},${point.time}`);
  }
}

fs.writeFileSync(outputFile, `${csvRows.join('\n')}\n`);
console.log(`Exported ${csvRows.length - 1} rows to ${outputFile}`);
