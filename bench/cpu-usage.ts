import fs from 'fs';
import { parseArgs } from 'util';
import os from 'os';
import type { StatsResponse } from '../src/cpu-usage.ts';

const {
  values: { host, name, folder },
} = parseArgs({
  args: process.argv,
  options: {
    host: {
      type: 'string',
    },
    name: {
      type: 'string',
    },
    folder: {
      type: 'string',
      default: 'results',
    },
  },
  strict: true,
  allowPositionals: true,
});

if (!host) {
  throw new Error('host is required');
}

if (!name) {
  throw new Error('name is required');
}

if (!folder) {
  throw new Error('folder is required');
}

const cpuFilename = `${folder}/cpu-usage-${name}.csv`;
const memoryFilename = `${folder}/memory-${name}.csv`;
const gcFilename = `${folder}/gc-${name}.csv`;

let coreCount = os.cpus().length;
const coresHeader = Array.from({ length: coreCount }, (_, index) => `core${index + 1}`).join(',');
fs.writeFileSync(cpuFilename, `${coresHeader},timestamp\n`);
let hasWrittenExtendedHeaders = false;

async function withRetries<T>(fn: () => Promise<T>, retries = 5): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt === retries) throw err;
    }
  }

  throw lastError;
}

setInterval(() => {
  withRetries(() => fetch(`${host}/stats`))
    .then((res) => res.json() as Promise<StatsResponse | number[]>)
    .then((data) => {
      if (Array.isArray(data) && data.length === 0 || ('cpu' in data && data.cpu.length === 0)) return;

      const timestamp = new Date().getTime();

      // Simple metrics
      if (Array.isArray(data)) {
        fs.appendFileSync(cpuFilename, `${data.join(',')},${timestamp}\n`);
        return;
      }

      // Extended metrics
      fs.appendFileSync(cpuFilename, `${data.cpu.join(',')},${timestamp}\n`);

      const { memory, heap, gc } = data;
      if (!hasWrittenExtendedHeaders) {
        fs.writeFileSync(
          memoryFilename,
          `heapUsed,heapTotal,external,rss,usedHeapSize,totalHeapSize,heapSizeLimit,mallocedMemory,timestamp\n`
        );
        fs.writeFileSync(gcFilename, `gcCount,gcTotalPauseMs,majorCount,minorCount,timestamp\n`);
        hasWrittenExtendedHeaders = true;
      }
      fs.appendFileSync(
        memoryFilename,
        `${memory.heapUsed},${memory.heapTotal},${memory.external},${memory.rss},${heap.usedHeapSize},${heap.totalHeapSize},${heap.heapSizeLimit},${heap.mallocedMemory},${timestamp}\n`
      );

      fs.appendFileSync(
        gcFilename,
        `${gc.count},${gc.totalPauseMs.toFixed(2)},${gc.majorCount},${gc.minorCount},${timestamp}\n`
      );
    });
}, 200);
