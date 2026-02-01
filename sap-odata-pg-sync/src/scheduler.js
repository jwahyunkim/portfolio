//scheduler.js

import cron from 'node-cron';
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

const running = new Set();

function scheduleJob(j) {
  cron.schedule(j.schedule, async () => {
    if (running.has(j.id)) {
      log.warn('Previous execution in progress, skipped', j.id);
      return;
    }
    running.add(j.id);
    try { await runJob(j); }
    catch (e) { log.errorEx('Scheduled job failed', e, { jobId: j.id }); }
    finally { running.delete(j.id); }
  });
}

(async () => {
  const jobs = await loadJobs();
  if (!jobs.length) {
    log.warn('No jobs to schedule');
    process.exit(0);
  }
  log.info('Scheduler started');
  for (const j of jobs) {
    scheduleJob(j);
    (async () => {
      if (running.has(j.id)) return;
      running.add(j.id);
      try { await runJob(j); }
      catch (e) { log.errorEx('Initial job run failed', e, { jobId: j.id }); }
      finally { running.delete(j.id); }
    })();
    const dst = j.mode === 'push'
      ? `${j.source.schema}.${j.source.table} -> ODATA`
      : `${j.target.schema}.${j.target.table}`;
    log.info('Registered', j.id, `cron="${j.schedule}"`, dst);
  }
})();
