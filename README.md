# Butterfly Anatomy Atlas — Interactive 3D Lepidoptera Atlas

An interactive 3D butterfly anatomy atlas built for clear, exploratory biological learning. The project uses web technologies (JavaScript, HTML, CSS) and integrates model tooling to present a navigable, labeled, and annotated digital specimen.

---

## About

This repository hosts a publication-quality interactive 3D atlas of butterfly anatomy. It is intended as an educational and research companion for comparative entomology and advanced biology courses — not a dry catalog, but an exploratory environment that invites inspection, manipulation, and curiosity.

A short, journalistic note

I began this project expecting to build a single model. As the work evolved, design choices became narrative: color systems that highlight function, interaction affordances that invite discovery, and information layers that respect both novice and expert users. This README is a concise report of that journey and the practical steps to run and extend the atlas. It is authored by me (Metisa811) — so there’s no mystery about who wrote this.

---

## Preview

<p align="center">
  <!-- Using the uploaded image `show.png` as the preview -->
  <a href="show.png">
    <img src="show.png" alt="Demo — Butterfly Atlas" style="max-width:720px; width:100%; border-radius:12px; box-shadow: 0 14px 40px rgba(0,0,0,0.35);">
  </a>
</p>

Tip: For a richer presentation, host a dedicated demo page (GitHub Pages) where you can add animated backgrounds, overlay captions, and CSS-driven transitions.

---

## Features

- Interactive 3D model with labeled anatomical regions
- Layered visualization: toggle tissues, circulatory structures, skeletal elements
- Mouse and touch controls for rotate/zoom/pan
- Responsive UI optimized for desktop and tablet
- Annotation-ready: add notes and highlights for teaching or research

---

## Quick start

### Option A — Static files (simplest)
If the site is only static HTML/CSS/JS, serve it locally with a small HTTP server:

```bash
# Python 3 built-in HTTP server
python -m http.server 8000
# or using `serve` from npm
npx serve .
```

Then open http://localhost:8000 in your browser.

### Option B — Node / Vite (if the project uses npm)

```bash
npm install
npm run dev     # or `npm start` depending on scripts
```

---

## Repository layout (recommended)

- index.html — entry page
- src/ — JavaScript sources and modules
- styles/ — CSS and design tokens
- assets/ — images, GIFs, models
- assets/models/ — 3D model files (GLTF, OBJ, etc.)
- README.md — this file

---

## Development & maintenance notes

- Keep visual assets (textures and models) in `assets/models` and use consistent naming for easy swaps.
- Organize code into small modules so visualization layers (labels, overlays, interactions) are independently testable.
- If you accept contributions, add a `CONTRIBUTING.md` describing local setup, coding conventions, and PR expectations.

---

## Ideas & roadmap

- Guided tour mode: step-by-step walkthroughs that highlight structures and provide short explanations
- Bookmarks: let users save and share specific viewpoints or annotation sets
- Multilanguage support for educational text
- Measurement tools and interactive annotations for classroom exercises

---

## License & credits

This project is licensed under the MIT License — see the included LICENSE file.

If you used datasets, models, or textures from other creators, add a clear credits section linking to their sources and licenses.

---

## Author

Authored by: Metisa811 (Mehdi Sadeghi)

---

## Contact

If you want me to make additional README improvements, optimize the preview image for GitHub, or create a demo page for GitHub Pages, I can prepare a PR or commit the changes directly. Tell me which option you prefer.
