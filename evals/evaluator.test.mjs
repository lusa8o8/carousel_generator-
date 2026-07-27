import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateResult } from './evaluator.mjs';

const testCase = {
  expect: {
    brandApply: false,
    topicTerms: ['burnout', 'designer']
  }
};

const validResult = {
  title: 'Avoiding Designer Burnout',
  seriesTag: 'WORK NOTES',
  brand: {
    apply: false,
    paper: '#EFE9DA',
    ink: '#212B21',
    accent: '#C08A28',
    headline: 'editorial',
    body: 'clean'
  },
  slides: [
    { title: 'Burnout is not a productivity problem', body: 'A practical guide for designers.', isCover: true },
    { title: 'Notice the earliest signal', body: 'Track when your attention and patience begin to fall.', isCover: false },
    { title: 'Reduce work in progress', body: 'Finish one meaningful task before opening another.', isCover: false },
    { title: 'Protect recovery time', body: 'Rest must exist before the calendar fills up.', isCover: false },
    { title: 'Review your week', body: 'Save this and test one change this week.', isCover: true }
  ]
};

test('accepts a structurally sound, on-topic result', () => {
  const evaluation = evaluateResult(testCase, validResult);
  assert.equal(evaluation.pass, true);
  assert.equal(evaluation.score, 1);
});

test('rejects unauthorized brand changes', () => {
  const result = structuredClone(validResult);
  result.brand.apply = true;
  const evaluation = evaluateResult(testCase, result);
  assert.equal(evaluation.pass, false);
  assert.equal(evaluation.checks.find((check) => check.name === 'brand permission respected').pass, false);
});

test('rejects missing calls to action', () => {
  const result = structuredClone(validResult);
  result.slides.at(-1).title = 'A final thought';
  result.slides.at(-1).body = 'Consistency grows through deliberate choices.';
  const evaluation = evaluateResult(testCase, result);
  assert.equal(evaluation.pass, false);
  assert.equal(evaluation.checks.find((check) => check.name === 'final slide has a call to action').pass, false);
});
