# Carousel Maker

Open `index.html` directly to use the local outline generator, visual systems, slide editor, drag-to-reorder, and PNG export.

## Claude setup

The API key is deliberately not stored in the browser app. From the project root (`build`), set the key in the shell session and start the included local server:

```powershell
$env:ANTHROPIC_API_KEY = "your-key-here"
node .\outputs\server.mjs
```

Alternatively, change into `outputs` first and run `node .\server.mjs`.

Then open `http://localhost:3000`. The app will call the local `/api/generate-carousel` endpoint, which keeps the key on the server and returns a structured, editable slide outline.

The server uses Claude structured outputs so the app receives only `title`, `seriesTag`, brand settings, and slide data. It never renders model-generated HTML.

## Research and visual references

- Turn on **Research current sources and brand references online** only when you want Claude to use its web-search tool. It performs up to three searches and returns the sources in the editor.
- Your Anthropic organization must enable web search in the [Console privacy settings](https://console.anthropic.com/settings/privacy) before that option can work.
- Add up to three PNG, JPEG, GIF, or WebP visual references, each no larger than 4 MB. Claude analyzes them as visual direction; the images are not rendered into the carousel automatically.
- Turn on **Let this prompt update brand colors/fonts** when a prompt explicitly requests a color, font, or named-brand treatment. Select **Brand update only** to preserve all existing slide copy.
