import { contrastRatio } from '../core/brand.mjs';

const HEX = /^#[0-9a-f]{6}$/i;

export function evaluateBrandResult(testCase, result) {
  const profile = result?.profile;
  const checks = [];
  add(checks, 'profile returned', Boolean(profile));
  if (!profile) return { pass: false, score: 0, checks };

  add(checks, 'valid colors', ['paper', 'ink', 'accent'].every((key) => HEX.test(profile[key] || '')));
  add(checks, 'valid typography', ['editorial', 'modern', 'display'].includes(profile.headline) && ['clean', 'mono'].includes(profile.body));
  add(checks, 'source type preserved', profile.sourceType === testCase.sourceType, `${profile.sourceType}`);
  add(checks, 'readable paper and ink', contrastRatio(profile.paper, profile.ink) >= 4.5, `${contrastRatio(profile.paper, profile.ink).toFixed(2)}:1`);
  add(checks, 'evidence retained', Array.isArray(profile.evidence) && profile.evidence.length > 0);

  const tolerance = Number(testCase.tolerance || 0);
  for (const key of ['paper', 'ink', 'accent']) {
    const distance = colorDistance(profile[key], testCase.expected[key]);
    add(checks, `${key} within tolerance`, distance <= tolerance, `distance ${distance.toFixed(2)}, tolerance ${tolerance}`);
  }
  add(checks, 'headline preset', profile.headline === testCase.expected.headline, `${profile.headline}`);
  add(checks, 'body preset', profile.body === testCase.expected.body, `${profile.body}`);

  const passed = checks.filter((check) => check.pass).length;
  return { pass: checks.every((check) => check.pass), score: passed / checks.length, checks };
}

export function evaluateStability(results) {
  if (!results.length) return { pass: false, uniqueProfiles: 0 };
  const signatures = results.map(({ profile }) => JSON.stringify({
    paper: profile.paper,
    ink: profile.ink,
    accent: profile.accent,
    headline: profile.headline,
    body: profile.body
  }));
  const uniqueProfiles = new Set(signatures).size;
  return { pass: uniqueProfiles === 1, uniqueProfiles };
}

function colorDistance(first, second) {
  const a = channels(first);
  const b = channels(second);
  if (!a || !b) return Number.POSITIVE_INFINITY;
  return Math.sqrt(a.reduce((sum, channel, index) => sum + (channel - b[index]) ** 2, 0));
}

function channels(color) {
  if (!HEX.test(color || '')) return null;
  return [1, 3, 5].map((index) => parseInt(color.slice(index, index + 2), 16));
}

function add(checks, name, pass, detail = '') {
  checks.push({ name, pass: Boolean(pass), detail });
}
