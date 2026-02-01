//syncAll.js
import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { runJob } from './jobRunner.js';
import { log } from './util/logging.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const jobsDir = join(__dirname, '..', 'jobs');

async function loadJobs() {
  const entries = await fs.readdir(jobsDir, { withFileTypes: true });
  const jobs = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const dir = join(jobsDir, e.name);
    try {
      const job = JSON.parse(await fs.readFile(join(dir, 'job.json'), 'utf8'));
      const mapping = JSON.parse(await fs.readFile(join(dir, 'mapping.json'), 'utf8'));
      jobs.push({ ...job, mapping });
    } catch (err) {
      log.warn('Failed to load job', e.name, err.message);
    }
  }
  return jobs;
}

function parseArgs() {
  const ids = [];
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg === '--job') { ids.push(process.argv[++i]); continue; }
    if (!arg.startsWith('-')) ids.push(arg);
  }
  return ids;
}

(async () => {
  const all = await loadJobs();
  const filter = parseArgs();
  const targets = filter.length ? all.filter(j => filter.includes(j.id)) : all;

  if (!targets.length) {
    log.warn('No job to execute');
    process.exit(0);
  }

  for (const j of targets) {
    try {
      await runJob(j);
    } catch (e) {
      log.errorEx('Job execution failed', e, { jobId: j.id });
    }
  }
})();
