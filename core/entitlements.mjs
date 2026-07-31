const MEGABYTE = 1024 * 1024;
const GIGABYTE = 1024 * MEGABYTE;

export const PLAN_CATALOG = Object.freeze({
  guest: Object.freeze({
    id: 'guest',
    name: 'Guest',
    cloudCarousels: 0,
    storageBytes: 0,
    aiCreditsMonthly: 0,
    templateTier: 'free',
    versionHistoryDays: 0
  }),
  free: Object.freeze({
    id: 'free',
    name: 'Free',
    cloudCarousels: 5,
    storageBytes: 100 * MEGABYTE,
    aiCreditsMonthly: 5,
    templateTier: 'free',
    versionHistoryDays: 0
  }),
  creator: Object.freeze({
    id: 'creator',
    name: 'Creator',
    cloudCarousels: 100,
    storageBytes: 2 * GIGABYTE,
    aiCreditsMonthly: 150,
    templateTier: 'creator',
    versionHistoryDays: 30
  })
});

export function planById(planId) {
  return PLAN_CATALOG[planId] || PLAN_CATALOG.free;
}

export function normalizeEntitlements(record = {}, now = new Date()) {
  const requestedPlan = planById(record.planId);
  const expiresAt = record.expiresAt ? new Date(record.expiresAt) : null;
  const expired = expiresAt && Number.isFinite(expiresAt.getTime()) && expiresAt <= now;
  const recordedStatus = record.status || 'active';
  const inactive = !['active', 'trialing'].includes(recordedStatus);
  const downgraded = expired || inactive;
  const base = downgraded ? PLAN_CATALOG.free : requestedPlan;
  const limits = downgraded ? {} : (record.limits || {});
  return {
    ...base,
    planId: base.id,
    status: expired ? 'expired' : recordedStatus,
    source: record.source || 'system',
    expiresAt: expiresAt?.toISOString() || null,
    cloudCarousels: nonNegativeInteger(limits.cloudCarousels, base.cloudCarousels),
    storageBytes: nonNegativeInteger(limits.storageBytes, base.storageBytes),
    aiCreditsMonthly: nonNegativeInteger(limits.aiCreditsMonthly, base.aiCreditsMonthly),
    templateTier: ['free', 'creator', 'studio'].includes(limits.templateTier)
      ? limits.templateTier
      : base.templateTier,
    versionHistoryDays: nonNegativeInteger(limits.versionHistoryDays, base.versionHistoryDays)
  };
}

export function aiCreditCost(feature, payload = {}) {
  if (feature === 'generate-carousel') return payload.research ? 4 : 1;
  if (feature === 'brand-extract') return payload.sourceType === 'prompt' ? 1 : 2;
  throw new Error(`Unknown AI feature "${feature}".`);
}

export function currentUsagePeriod(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function remainingAiCredits(entitlements, creditsUsed = 0) {
  return Math.max(0, entitlements.aiCreditsMonthly - Math.max(0, Number(creditsUsed) || 0));
}

function nonNegativeInteger(value, fallback) {
  return Number.isInteger(value) && value >= 0 ? value : fallback;
}
