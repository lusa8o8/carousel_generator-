import test from 'node:test';
import assert from 'node:assert/strict';
import {
  brandThemePatch,
  contrastRatio,
  extractCssBrandEvidence,
  extractDeterministicPromptBrand,
  extractHtmlBrandEvidence,
  fingerprintBrandInput,
  profileFromWebEvidence
} from './brand.mjs';

const current = {
  paper: '#EFE9DA',
  ink: '#212B21',
  accent: '#C08A28',
  headline: 'editorial',
  body: 'clean'
};

test('extracts explicit prompt colors deterministically', () => {
  const prompt = 'Use a black background, white text, and a red accent with a modern sans headline.';
  const first = extractDeterministicPromptBrand(prompt, current);
  const second = extractDeterministicPromptBrand(prompt, current);
  assert.deepEqual(first, second);
  assert.deepEqual(brandThemePatch(first), {
    enabled: true,
    paper: '#000000',
    ink: '#FFFFFF',
    accent: '#E53935',
    headline: 'modern',
    body: 'clean'
  });
});

test('preserves unspecified current brand fields', () => {
  const profile = extractDeterministicPromptBrand('Change only the accent to #00AA88.', current);
  assert.equal(profile.paper, current.paper);
  assert.equal(profile.ink, current.ink);
  assert.equal(profile.accent, '#00AA88');
});

test('does not partially parse a multi-role semantic request', () => {
  assert.equal(
    extractDeterministicPromptBrand('Use black paper, pearl text, and a coral accent.', current),
    null
  );
});

test('extracts deterministic website evidence and profile', () => {
  const html = `
    <meta name="theme-color" content="#FF5533">
    <link rel="stylesheet" href="/brand.css">
    <style>body { background: #FAFAF5; color: #121212; font-family: Inter, sans-serif; }</style>
  `;
  const evidence = extractHtmlBrandEvidence(html, 'https://example.com/');
  const cssEvidence = extractCssBrandEvidence(':root { --brand-accent: #FF5533; }', 'https://example.com/brand.css');
  const profile = profileFromWebEvidence([...evidence, ...cssEvidence]);
  assert.equal(profile.paper, '#FAFAF5');
  assert.equal(profile.ink, '#121212');
  assert.equal(profile.accent, '#FF5533');
  assert.equal(profile.headline, 'modern');
});

test('maps a declared monospace website family to supported modern and mono presets', () => {
  const evidence = extractCssBrandEvidence(`
    :root { --paper: #101820; --ink: #F2F4F3; --accent: #00A7C4; }
    body { background: #101820; color: #F2F4F3; font-family: "IBM Plex Mono", monospace; }
  `);
  const profile = profileFromWebEvidence(evidence);
  assert.equal(profile.headline, 'modern');
  assert.equal(profile.body, 'mono');
});

test('resolves HSL channel variables and prefers the primary brand token', () => {
  const evidence = extractCssBrandEvidence(`
    :root {
      --background: 0 0% 100%;
      --foreground: 222.2 84% 4.9%;
      --primary: 280 70% 57%;
      --secondary: 18 100% 61%;
      --accent: 35 100% 64%;
    }
    body {
      background: hsl(var(--background));
      color: hsl(var(--foreground));
      font-family: Poppins, sans-serif;
    }
  `);
  const profile = profileFromWebEvidence(evidence);
  assert.equal(profile.paper, '#FFFFFF');
  assert.equal(profile.ink, '#020817');
  assert.equal(profile.accent, '#AB45DE');
  assert.equal(profile.headline, 'modern');
  assert.equal(profile.body, 'clean');
});

test('fingerprints are stable across object key order', () => {
  assert.equal(fingerprintBrandInput({ a: 1, b: 2 }), fingerprintBrandInput({ b: 2, a: 1 }));
});

test('reports accessible contrast numerically', () => {
  assert.ok(contrastRatio('#FFFFFF', '#111111') > 15);
});
