# Paperplane — Browser PDF Editor

A polished, local-first PDF editor that runs entirely in the browser. Documents are rendered and edited on-device; exporting creates a new PDF.

## Features

- Open arbitrary PDFs locally with PDF.js
- Page thumbnails and zoom controls
- Add, move, and style text
- Detect PDF text and visually replace it
- Highlights, visual redaction overlays, and rectangle shapes
- Insert PNG/JPEG images for signatures, stamps, or annotations
- Inspector for position, size, color, opacity, and text
- Undo/redo and keyboard shortcuts
- Export a new PDF with edits applied using pdf-lib
- Responsive, desktop-style UI
- No application server or database required

## Run locally

Because PDF.js uses a module worker, serve the directory rather than opening `index.html` directly:

```bash
cd browser-pdf-editor
python3 -m http.server 8080
```

Open `http://localhost:8080`.

## Deploy to Vercel

This repository includes `vercel.json` and requires no build step.

### Dashboard

1. Create a new Vercel project and import this repository.
2. Leave **Framework Preset** as `Other`.
3. Leave **Build Command** empty.
4. Set **Output Directory** to `.` if Vercel asks for one.
5. Deploy.

### CLI

```bash
npm i -g vercel
vercel
```

The app is a static site, so Vercel will serve `index.html` directly.

## Deploy to Netlify

This repository includes `netlify.toml` with the publish directory set to the repository root.

### Dashboard

1. Add a new site from Git.
2. Select this repository.
3. No build command is required.
4. Publish directory: `.`
5. Deploy.

### CLI

```bash
npm i -g netlify-cli
netlify deploy --prod --dir .
```

## Deploy to GitHub Pages

The included `.github/workflows/deploy-pages.yml` deploys the static site whenever `main` is pushed.

1. Push this project to a GitHub repository using `main` as the default branch.
2. In **Settings → Pages**, set **Source** to **GitHub Actions**.
3. Push to `main`, or run the workflow manually from the Actions tab.
4. GitHub will publish the site at the Pages URL for the repository.

All application asset paths are relative, so project-site URLs such as `https://username.github.io/repository/` work correctly.

## Privacy

PDF contents stay in the browser and are not sent to an application backend. This version loads PDF.js, pdf-lib, and the Inter font from public CDNs, so opening the app itself makes ordinary network requests to those CDNs, but document bytes are not uploaded to them by the application.

For a completely offline/self-hosted deployment, vendor those dependencies into the repository and replace the CDN imports with local paths.

## Existing-text editing

PDFs are not structured like word-processing documents. For broad compatibility, existing-text editing is implemented as **visual replacement**: detected text is covered and replacement text is drawn at the same location. This works best on simple/light backgrounds.

True low-level PDF content-stream rewriting with embedded-font preservation requires a substantially deeper PDF engine.

## Redaction warning

The redaction tool draws an opaque rectangle. It is a **visual redaction**, not secure removal of underlying PDF content. Do not use it to sanitize sensitive information until a true structural-redaction pass is implemented.
