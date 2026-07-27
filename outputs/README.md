# Carousel Maker

Open `index.html` directly to use the local outline generator, editorial renderer, slide editor, drag-to-reorder, and PNG export. Run the local server for AI generation, persistence, history, validation, and agent tools.

## Claude setup

The API key is deliberately not stored in the browser app. From the project root, set the key in the shell session and start the included local server:

```powershell
$env:ANTHROPIC_API_KEY = "your-key-here"
node .\outputs\server.mjs
```

You can also create a local `.env` file in the project root:

```env
ANTHROPIC_API_KEY=your-key-here
```

The server loads this file automatically. `.env` is ignored by git.

Alternatively, change into `outputs` first and run `node .\server.mjs`.

Then open `http://localhost:3000`. The app will call the local `/api/generate-carousel` endpoint, which keeps the key on the server and returns a structured, editable slide outline.

The server uses Claude structured outputs so the app receives only `title`, `seriesTag`, brand settings, and slide data. It never renders model-generated HTML.

## Brand extraction

Branding is separate from copy generation. Choose **Describe**, **Image**, or **Website**, extract a candidate, preview it without saving, and select **Apply** only when it is correct. Applying a brand changes only paper, ink, accent, and the supported headline/body presets; slide copy is preserved.

- Direct instructions with explicit hex or canonical named colors use a deterministic parser and do not require a model call.
- Semantic descriptions use Claude structured output with temperature 0, normalization, contrast warnings, and persistent fingerprint caching.
- Add up to three PNG, JPEG, GIF, or WebP references, each no larger than 4 MB. The browser samples a deterministic palette from every supported image. PNG uploads also have their palette verified on the server. Claude assigns semantic roles, then returned colors are snapped to the sampled palette.
- Website extraction accepts one public HTTP or HTTPS URL, blocks private/reserved network destinations, follows at most three validated redirects, limits resources to 2 MB, and reads the page plus up to four same-origin stylesheets. CSS variables, page colors, theme metadata, font declarations, and official asset references are retained as evidence.
- Extraction results are cached in `.carousel/brand-cache.json`. The cache is local and ignored by git.

The renderer remains deterministic: the same versioned carousel document and normalized brand profile produce the same canvas output.

## Prompt evaluations

The production prompt contract lives in `outputs/prompt-contract.mjs`. Versioned development and held-out datasets, prompt versions, raw outputs, code grades, model-grader reasoning, usage, comparisons, and self-contained HTML reports live under `evals/`.

Run one prompt version against the development dataset:

```powershell
node .\evals\run-version.mjs --version=contract-schema-v3 --dataset=dev --run=1 --concurrency=2
```

Validate the selected prompt twice against the independent held-out dataset:

```powershell
node .\evals\run-version.mjs --version=contract-schema-v3 --dataset=heldout --run=1 --concurrency=2
node .\evals\run-version.mjs --version=contract-schema-v3 --dataset=heldout --run=2 --concurrency=2
```

The deterministic grader checks schema shape, slide roles, count, concise copy, topic relevance, CTA presence, and brand permissions. A separate structured model grader scores specificity, usefulness, progression, and instruction following. JSON summaries are written to `evals/results/`; escaped standalone HTML reports are written to `evals/reports/`.

The selected `contract-schema-v3` prompt passed all 8 development cases and all 4 held-out cases in two consecutive held-out runs.

The evaluator itself has deterministic unit tests:

```powershell
node .\evals\evaluator.test.mjs
```

Brand extraction has a separate source-specific dataset and deterministic grader:

```powershell
node .\evals\run-brand-suite.mjs
```

The suite runs three repetitions for direct prompt, semantic prompt, vision, and fixture-website cases across independent development and held-out datasets. It grades exact or tolerance-bounded colors, typography enums, contrast, evidence, source identity, and repeated-output stability. JSON results and standalone HTML reports are written under `evals/results/` and `evals/reports/`.

## Agent tools

The local server also owns the current versioned carousel document. The browser synchronizes edits to it, polls for agent changes, and publishes the latest rendered PNG for every slide.

Start the MCP stdio server with:

```powershell
node .\mcp\server.mjs
```

It connects to `http://localhost:3000/api/carousel` by default. Override that endpoint when the app uses another port:

```powershell
$env:CAROUSEL_SERVER_URL = "http://localhost:3101/api/carousel"
node .\mcp\server.mjs
```

Available tools inspect the carousel or a slide, render a slide, apply atomic operations, validate, undo, redo, list versions, restore a version, extract brands from prompt/image/URL sources, preview a brand without committing, and explicitly apply a brand. `apply_operations` supports conservative committed edits and uncommitted exploration candidates.

Core and MCP integration checks:

```powershell
node .\outputs\renderer.test.mjs
node .\core\core.test.mjs
node .\core\brand.test.mjs
node .\core\png-palette.test.mjs
node .\tests\api.integration.test.mjs
node .\tests\brand.integration.test.mjs
$env:CAROUSEL_TEST_URL = "http://localhost:3000/api/carousel"
node .\mcp\server.test.mjs
node .\evals\evaluator.test.mjs
node .\evals\brand-evaluator.test.mjs
```
