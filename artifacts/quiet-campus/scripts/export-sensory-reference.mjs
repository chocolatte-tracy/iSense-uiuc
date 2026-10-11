import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

// Read-only source extraction; no network, import, scoring, Git operation or source-data write.
const sourceRoot = process.argv[2];
if (!sourceRoot || process.argv.length !== 3) throw new Error('Usage: node scripts/export-sensory-reference.mjs /path/to/feature-worktree');
const sourceFiles = ['noise.json', 'noise-coverage.json', 'crowd.json', 'crowd-coverage.json'];
const contents = await Promise.all(sourceFiles.map(name => readFile(resolve(sourceRoot, 'data', name))));
const [noise, noiseCoverage, crowds, crowdCoverage] = contents.map(bytes => JSON.parse(bytes));
if (noise.length !== noiseCoverage.recordCount || crowds.length !== crowdCoverage.recordCount ||
    !noise.length || !crowds.length || noise.some(r => !Number.isFinite(r.noiseDb)) ||
    crowds.some(r => r.granularity !== 'month' || r.measurementType !== 'pedestrian_count')) {
  throw new Error('Source dataset/coverage mismatch; reference not replaced');
}
const sortedNoise = [...noise].sort((a, b) => a.noiseDb - b.noiseDb || a.id.localeCompare(b.id));
const latestReports = [...new Set(crowds.map(r => r.sourceMetricId))].sort().map(id =>
  crowds.filter(r => r.sourceMetricId === id).sort((a, b) => b.applicableDate.localeCompare(a.applicableDate))[0]);
const reference = {
  version: 1, purpose: 'Historical source examples only; not associated with any displayed route.',
  sourceHashes: Object.fromEntries(sourceFiles.map((name, i) => [name, createHash('sha256').update(contents[i]).digest('hex')])),
  noise: {
    recordCount: noise.length, footprintMeters: noiseCoverage.footprintMeters, timeRange: noiseCoverage.timeRange,
    selection: 'Minimum, 75th-percentile ranked sample, and maximum raw observations for illustration, not a route summary or energy average.',
    examples: [sortedNoise[0], sortedNoise[Math.floor((noise.length - 1) * 0.75)], sortedNoise.at(-1)],
  },
  crowds: {
    recordCount: crowds.length, periodMonthRange: crowdCoverage.periodMonthRange,
    selection: 'Latest source report per selected metric; dates are not exact collection intervals.',
    examples: latestReports,
  },
};
const output = fileURLToPath(new URL('../src/data/historical-sensory-reference.json', import.meta.url));
await writeFile(output, `${JSON.stringify(reference, null, 2)}\n`);
console.log(`Exported read-only examples: ${noise.length} noise / ${crowds.length} monthly reports. No route association.`);
