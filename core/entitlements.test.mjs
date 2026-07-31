import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PLAN_CATALOG,
  aiCreditCost,
  currentUsagePeriod,
  normalizeEntitlements,
  remainingAiCredits
} from './entitlements.mjs';

test('free and Creator plan limits match the launch catalog', () => {
  assert.equal(PLAN_CATALOG.free.cloudCarousels, 5);
  assert.equal(PLAN_CATALOG.free.aiCreditsMonthly, 5);
  assert.equal(PLAN_CATALOG.creator.cloudCarousels, 100);
  assert.equal(PLAN_CATALOG.creator.aiCreditsMonthly, 150);
  assert.equal(PLAN_CATALOG.creator.templateTier, 'creator');
});

test('expired paid access falls back to free without deleting entitlement metadata', () => {
  const result = normalizeEntitlements({
    planId: 'creator',
    source: 'manual',
    expiresAt: '2026-01-01T00:00:00.000Z'
  }, new Date('2026-07-31T00:00:00.000Z'));
  assert.equal(result.planId, 'free');
  assert.equal(result.status, 'expired');
  assert.equal(result.cloudCarousels, PLAN_CATALOG.free.cloudCarousels);
  assert.equal(result.source, 'manual');
});

test('AI costs use one outline credit and higher weights for research and visual extraction', () => {
  assert.equal(aiCreditCost('generate-carousel'), 1);
  assert.equal(aiCreditCost('generate-carousel', { research: true }), 4);
  assert.equal(aiCreditCost('brand-extract', { sourceType: 'prompt' }), 1);
  assert.equal(aiCreditCost('brand-extract', { sourceType: 'image' }), 2);
  assert.equal(aiCreditCost('brand-extract', { sourceType: 'url' }), 2);
});

test('usage helpers use UTC monthly periods and never return negative credits', () => {
  assert.equal(currentUsagePeriod(new Date('2026-01-31T23:59:00Z')), '2026-01');
  assert.equal(remainingAiCredits(PLAN_CATALOG.free, 3), 2);
  assert.equal(remainingAiCredits(PLAN_CATALOG.free, 99), 0);
});
