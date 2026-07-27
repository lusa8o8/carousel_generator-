import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { evaluateBrandResult, evaluateStability } from './brand-evaluator.mjs';

const endpoint = process.env.CAROUSEL_BRAND_TEST_URL || 'http://localhost:3000/api/brand';
const datasetName = process.argv.includes('--dataset=heldout') ? 'brand-heldout-v1' : 'brand-dev-v1';
const datasetPath = new URL(`./datasets/${datasetName}.json`, import.meta.url);
const fixtureDirectory = new URL('./fixtures/', import.meta.url);
const dataset = JSON.parse(await readFile(datasetPath, 'utf8'));
const fixtureServer = await startFixtureServer();
const fixturePort = fixtureServer.address().port;
const startedAt = new Date().toISOString();
const results = [];
let apiCalls = 0;
let inputTokens = 0;
let outputTokens = 0;

try {
  for (const testCase of dataset) {
    const outputs = [];
    const grades = [];
    for (let run = 1; run <= testCase.runs; run++) {
      const payload = await payloadFor(testCase);
      const response = await fetch(`${endpoint}/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, bypassCache: true })
      });
      const output = await response.json();
      if (!response.ok) throw new Error(`${testCase.id} run ${run}: ${output.error || `HTTP ${response.status}`}`);
      outputs.push(output);
      grades.push(evaluateBrandResult(testCase, output));
      if (output.method.startsWith('claude-')) apiCalls++;
      inputTokens += Number(output.usage?.input_tokens || 0);
      outputTokens += Number(output.usage?.output_tokens || 0);
    }
    const stability = evaluateStability(outputs);
    results.push({
      testCase,
      pass: grades.every((grade) => grade.pass) && stability.pass,
      averageScore: average(grades.map((grade) => grade.score)),
      stability,
      grades,
      outputs
    });
    process.stdout.write(`${results.at(-1).pass ? 'PASS' : 'FAIL'} ${testCase.id} score=${results.at(-1).averageScore.toFixed(3)} variants=${stability.uniqueProfiles}\n`);
  }
} finally {
  await new Promise((resolve) => fixtureServer.close(resolve));
}

const summary = {
  agent: 'brand-profile-extractor',
  extractorVersion: results[0]?.outputs[0]?.profile?.extractorVersion,
  datasetVersion: datasetName,
  startedAt,
  completedAt: new Date().toISOString(),
  caseCount: results.length,
  runCount: results.reduce((sum, result) => sum + result.outputs.length, 0),
  passRate: results.filter((result) => result.pass).length / results.length,
  averageScore: average(results.map((result) => result.averageScore)),
  stabilityRate: results.filter((result) => result.stability.pass).length / results.length,
  usage: { apiCalls, inputTokens, outputTokens },
  results
};

const resultsDirectory = new URL('./results/', import.meta.url);
const reportsDirectory = new URL('./reports/', import.meta.url);
await mkdir(resultsDirectory, { recursive: true });
await mkdir(reportsDirectory, { recursive: true });
const resultPath = new URL(`./${datasetName}-run-1.json`, resultsDirectory);
const reportPath = new URL(`./${datasetName}-run-1.html`, reportsDirectory);
await writeFile(resultPath, `${JSON.stringify(summary, null, 2)}\n`);
await writeFile(reportPath, renderReport(summary));
console.log(`Summary: pass_rate=${summary.passRate.toFixed(3)} average=${summary.averageScore.toFixed(3)} stability=${summary.stabilityRate.toFixed(3)} api_calls=${apiCalls}`);
console.log(fileURLToPath(resultPath));
console.log(fileURLToPath(reportPath));
if (summary.passRate < 1) process.exitCode = 1;

async function payloadFor(testCase) {
  const currentBrand = {
    enabled: true,
    paper: '#EFE9DA',
    ink: '#212B21',
    accent: '#C08A28',
    headline: 'editorial',
    body: 'clean'
  };
  if (testCase.sourceType === 'prompt') return { sourceType: 'prompt', prompt: testCase.prompt, currentBrand };
  if (testCase.sourceType === 'image') {
    const data = await readFile(new URL(`./fixtures/${testCase.fixture}`, import.meta.url), 'base64');
    return {
      sourceType: 'image',
      prompt: testCase.prompt,
      images: [{ mediaType: 'image/png', data }],
      currentBrand
    };
  }
  return { sourceType: 'url', url: `http://127.0.0.1:${fixturePort}/${testCase.fixtureSite || 'brand-site'}/`, currentBrand };
}

async function startFixtureServer() {
  const html = await readFile(new URL('./brand-site/index.html', fixtureDirectory));
  const css = await readFile(new URL('./brand-site/brand.css', fixtureDirectory));
  const darkHtml = await readFile(new URL('./brand-site-dark/index.html', fixtureDirectory));
  const darkCss = await readFile(new URL('./brand-site-dark/brand.css', fixtureDirectory));
  const hslHtml = await readFile(new URL('./brand-site-hsl/index.html', fixtureDirectory));
  const hslCss = await readFile(new URL('./brand-site-hsl/brand.css', fixtureDirectory));
  const server = createServer((request, response) => {
    if (request.url === '/brand.css') {
      response.writeHead(200, { 'content-type': 'text/css' });
      response.end(css);
      return;
    }
    if (request.url === '/brand-dark.css') {
      response.writeHead(200, { 'content-type': 'text/css' });
      response.end(darkCss);
      return;
    }
    if (request.url === '/brand-hsl.css') {
      response.writeHead(200, { 'content-type': 'text/css' });
      response.end(hslCss);
      return;
    }
    if (request.url?.startsWith('/brand-site-dark/')) {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end(darkHtml);
      return;
    }
    if (request.url?.startsWith('/brand-site-hsl/')) {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end(hslHtml);
      return;
    }
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end(html);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return server;
}

function renderReport(summary) {
  const cards = summary.results.map((result) => `
    <section class="${result.pass ? 'pass' : 'fail'}">
      <h2>${escapeHtml(result.testCase.id)} <span>${result.pass ? 'PASS' : 'FAIL'}</span></h2>
      <p>${escapeHtml(result.testCase.category)} · score ${result.averageScore.toFixed(3)} · ${result.stability.uniqueProfiles} unique profile(s)</p>
      ${result.outputs.map((output, index) => `
        <h3>Run ${index + 1} · ${escapeHtml(output.method)}</h3>
        <pre>${escapeHtml(JSON.stringify(output.profile, null, 2))}</pre>
        <ul>${result.grades[index].checks.map((check) => `<li class="${check.pass ? 'ok' : 'bad'}">${check.pass ? 'PASS' : 'FAIL'} ${escapeHtml(check.name)} ${escapeHtml(check.detail || '')}</li>`).join('')}</ul>
      `).join('')}
    </section>
  `).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>Brand extraction eval</title><style>
    body{font:14px/1.5 system-ui,sans-serif;max-width:1100px;margin:40px auto;padding:0 20px;color:#20211f;background:#f5f4ef}
    header{border-bottom:2px solid #20211f;margin-bottom:24px}section{background:white;border:1px solid #ccc;padding:18px;margin:18px 0;border-left:5px solid #17834a}
    section.fail{border-left-color:#bf2f2f}h2{display:flex;justify-content:space-between}pre{white-space:pre-wrap;background:#f1f1ed;padding:12px;overflow:auto}
    ul{padding-left:20px}.ok{color:#126b3c}.bad{color:#a51e1e}
  </style></head><body><header><h1>Brand extraction eval</h1><p>Pass rate ${(summary.passRate * 100).toFixed(0)}% · average ${summary.averageScore.toFixed(3)} · stability ${(summary.stabilityRate * 100).toFixed(0)}% · ${summary.usage.apiCalls} model calls · ${summary.usage.inputTokens} input / ${summary.usage.outputTokens} output tokens</p></header>${cards}</body></html>`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}
