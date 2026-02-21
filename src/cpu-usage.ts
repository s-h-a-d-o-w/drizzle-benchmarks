import { Hono } from 'hono';
import os from 'os';
import v8 from 'v8';
import { constants, PerformanceObserver, performance } from 'perf_hooks';

interface CpuUsage {
  usage: number;
  total: number;
}

export interface StatsResponse {
  cpu: number[];
  memory: {
    heapUsed: number;
    heapTotal: number;
    external: number;
    rss: number;
  };
  heap: {
    usedHeapSize: number;
    totalHeapSize: number;
    heapSizeLimit: number;
    mallocedMemory: number;
  };
  gc: {
    count: number;
    totalPauseMs: number;
    majorCount: number;
    minorCount: number;
  };
}

const app = new Hono();
const extendedMetricsEnabled = process.argv.includes('--extended-metrics');

let previous: CpuUsage[] = [];

let gcStats = {
  count: 0,
  totalPauseMs: 0,
  majorCount: 0,
  minorCount: 0,
};

if (extendedMetricsEnabled) {
  try {
    const obs = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        gcStats.count++;
        gcStats.totalPauseMs += entry.duration;
        const detail = (entry as any).detail as { kind?: number } | undefined;
        if (detail && typeof detail === 'object') {
          if (detail.kind === constants.NODE_PERFORMANCE_GC_MAJOR) {
            gcStats.majorCount++;
          } else if (detail.kind === constants.NODE_PERFORMANCE_GC_MINOR) {
            gcStats.minorCount++;
          }
        }
      }
    });
    obs.observe({ entryTypes: ['gc'], buffered: true });
  } catch {
  }
}

app.get('/stats', (c) => {
  const cpus = os.cpus();
  const cpuUsage = cpus.map((cpu) => {
    const { user, nice, sys, irq, idle } = cpu.times;
    const total = user + nice + sys + irq + idle;
    const usage = user + nice + sys + irq;
    return { usage, total };
  });

  let cpuResult: number[] = [];
  if (previous.length > 0) {
    cpuResult = cpuUsage.map((cpu, index) => {
      const usageDiff = cpu.usage - previous[index].usage;
      const totalDiff = cpu.total - previous[index].total;
      return parseInt(((100 * usageDiff) / totalDiff).toFixed());
    });
  }
  previous = cpuUsage;

  if (!extendedMetricsEnabled) {
    return c.json(cpuResult);
  }

  const mem = process.memoryUsage();
  const heapStats = v8.getHeapStatistics();

  const currentGcStats = { ...gcStats };
  gcStats = { count: 0, totalPauseMs: 0, majorCount: 0, minorCount: 0 };

  const response: StatsResponse = {
    cpu: cpuResult,
    memory: {
      heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
      heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
      external: Math.round(mem.external / 1024 / 1024),
      rss: Math.round(mem.rss / 1024 / 1024),
    },
    heap: {
      usedHeapSize: Math.round(heapStats.used_heap_size / 1024 / 1024),
      totalHeapSize: Math.round(heapStats.total_heap_size / 1024 / 1024),
      heapSizeLimit: Math.round(heapStats.heap_size_limit / 1024 / 1024),
      mallocedMemory: Math.round(heapStats.malloced_memory / 1024 / 1024),
    },
    gc: currentGcStats,
  };

  return c.json(response);
});

export default app;
