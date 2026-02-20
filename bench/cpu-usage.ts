import fs from 'fs';
import { parseArgs } from 'util';
import os from 'os';

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

const filename = `${folder}/cpu-usage-${name}.csv`;

let coreCount = os.cpus().length;
const coresHeader = Array.from({ length: coreCount }, (_, index) => `core${index + 1}`).join(',');
fs.writeFileSync(filename, `${coresHeader},timestamp\n`);

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
    .then((res) => res.json() as Promise<number[]>)
    .then((data) => {
      // First request returns empty array
      if (data.length === 0) {
        return;
      }

      fs.appendFileSync(filename, `${data.join(',')},${new Date().getTime()}\n`);
    });
}, 200);
