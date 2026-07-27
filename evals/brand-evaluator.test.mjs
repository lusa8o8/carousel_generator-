import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateBrandResult, evaluateStability } from './brand-evaluator.mjs';

const testCase = {
  sourceType: 'prompt',
  expected: { paper: '#FFFFFF', ink: '#111111', accent: '#FF0000', headline: 'modern', body: 'clean' },
  tolerance: 0
};
const result = {
  profile: {
    paper: '#FFFFFF',
    ink: '#111111',
    accent: '#FF0000',
    headline: 'modern',
    body: 'clean',
    sourceType: 'prompt',
    evidence: [{ kind: 'prompt', source: 'test', value: 'exact' }]
  }
};

test('passes an exact accessible brand profile', () => {
  assert.equal(evaluateBrandResult(testCase, result).pass, true);
});

test('fails a color outside tolerance', () => {
  const changed = structuredClone(result);
  changed.profile.accent = '#00FF00';
  assert.equal(evaluateBrandResult(testCase, changed).pass, false);
});

test('reports repeated output stability', () => {
  assert.equal(evaluateStability([result, structuredClone(result)]).pass, true);
  const changed = structuredClone(result);
  changed.profile.accent = '#FF0101';
  assert.equal(evaluateStability([result, changed]).pass, false);
});
