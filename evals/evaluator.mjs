import { OUTLINE_SCHEMA } from '../outputs/prompt-contract.mjs';

const CTA_PATTERN = /\b(save|follow|share|try|start|use|apply|build|review|ask|choose|write|take|do|put|begin|test|send|create|download|comment|bookmark)\b/i;
const AI_PATTERN = /\b(as an ai|language model|artificial intelligence)\b/i;
const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

function addCheck(checks, name, pass, detail) {
  checks.push({ name, pass: Boolean(pass), detail });
}

function validateShape(result, checks) {
  const required = OUTLINE_SCHEMA.required;
  addCheck(checks, 'result is an object', result && typeof result === 'object' && !Array.isArray(result));
  if (!result || typeof result !== 'object' || Array.isArray(result)) return false;

  addCheck(checks, 'required top-level fields', required.every((key) => Object.hasOwn(result, key)), required.join(', '));
  addCheck(checks, 'title is non-empty', typeof result.title === 'string' && result.title.trim().length > 0);
  addCheck(checks, 'series tag is non-empty', typeof result.seriesTag === 'string' && result.seriesTag.trim().length > 0);
  addCheck(checks, 'slides is an array', Array.isArray(result.slides));

  const brand = result.brand;
  addCheck(checks, 'brand object is valid', Boolean(
    brand &&
    typeof brand.apply === 'boolean' &&
    HEX_COLOR_PATTERN.test(brand.paper) &&
    HEX_COLOR_PATTERN.test(brand.ink) &&
    HEX_COLOR_PATTERN.test(brand.accent) &&
    ['editorial', 'modern', 'display'].includes(brand.headline) &&
    ['clean', 'mono'].includes(brand.body)
  ));

  if (!Array.isArray(result.slides)) return false;
  addCheck(checks, 'slide objects are valid', result.slides.every((slide) =>
    slide &&
    typeof slide.title === 'string' &&
    typeof slide.body === 'string' &&
    typeof slide.isCover === 'boolean'
  ));
  return true;
}

export function evaluateResult(testCase, result) {
  const checks = [];
  const shapeIsUsable = validateShape(result, checks);
  if (!shapeIsUsable) return { pass: false, score: 0, checks };

  const expected = testCase.expect || {};
  addCheck(
    checks,
    'brand permission respected',
    result.brand.apply === expected.brandApply,
    `expected brand.apply=${expected.brandApply}, received ${result.brand.apply}`
  );

  if (!expected.skipContentChecks) {
    addCheck(checks, 'slide count is 5 to 8', result.slides.length >= 5 && result.slides.length <= 8, `${result.slides.length} slides`);
    addCheck(checks, 'first slide is a cover', result.slides[0]?.isCover === true);
    addCheck(checks, 'final slide is a cover', result.slides.at(-1)?.isCover === true);
    addCheck(checks, 'middle slides are not covers', result.slides.slice(1, -1).every((slide) => !slide.isCover));

    const finalCopy = `${result.slides.at(-1)?.title || ''} ${result.slides.at(-1)?.body || ''}`;
    addCheck(checks, 'final slide has a call to action', CTA_PATTERN.test(finalCopy), finalCopy);

    const allCopy = result.slides.map((slide) => `${slide.title} ${slide.body}`).join(' ');
    addCheck(checks, 'copy does not mention AI', !AI_PATTERN.test(allCopy));
    addCheck(checks, 'titles are concise', result.slides.every((slide) => slide.title.trim().length > 0 && slide.title.length <= 120));
    addCheck(checks, 'body copy is concise', result.slides.every((slide) => slide.body.length <= 360));

    const normalizedCopy = `${result.title} ${allCopy}`.toLowerCase();
    const topicTerms = expected.topicTerms || [];
    const topicMatches = topicTerms.filter((term) => normalizedCopy.includes(term.toLowerCase()));
    const minimumMatches = Math.min(2, topicTerms.length);
    addCheck(
      checks,
      'output stays on topic',
      topicMatches.length >= minimumMatches,
      `${topicMatches.length}/${topicTerms.length} terms matched: ${topicMatches.join(', ') || 'none'}`
    );
  }

  const passed = checks.filter((check) => check.pass).length;
  return {
    pass: checks.every((check) => check.pass),
    score: checks.length ? passed / checks.length : 0,
    checks
  };
}
