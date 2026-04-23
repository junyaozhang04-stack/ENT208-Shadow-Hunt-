# ENT208 Shadow Hunt

## Project Direction Notice

This repository has changed direction.

- `main` contains the final version of the project.
- `old-version-backup` preserves the previous project for reference only.
- New review, deployment, and grading should use `main`.

## Ancient Architecture Atlas

Ancient Architecture Atlas is an interactive 3D web experience about Chinese architectural heritage. The project presents a cinematic map of historic sites, lets visitors focus on individual buildings, and opens a detailed 3D reading view where text flows around the live silhouette of each model.

The final project combines Three.js, Vite, and a Pretext-powered layout system to create a digital heritage interface that is both visual and readable.

## Features

- Interactive 3D atlas map with clickable heritage markers.
- Detail panel for each selected architecture site.
- Embedded 3D model viewer for selected buildings.
- Text layout that responds to the visible silhouette of the model.
- Gesture controls for orbiting and inspecting models.
- Production-ready Vite build configuration for Netlify.

## Featured Sites

- Foguang Monastery, Shanxi
- Huize Confucian Temple, Yunnan
- Wuhu Henglang Ancient Pagoda, Anhui

## Tech Stack

- Three.js
- Vite
- `@chenglou/pretext`
- JavaScript modules
- Netlify deployment

## Local Setup

Install dependencies:

```bash
pnpm install
```

Run the local development server:

```bash
pnpm dev
```

Open the local site at:

```text
http://127.0.0.1:4173/
```

The root page redirects to the atlas map.

## Build

Create a production build:

```bash
pnpm build
```

Preview or upload the generated `dist` folder.

Run checks:

```bash
pnpm check
```

## Netlify Deployment

This repository includes `netlify.toml`.

Netlify should use:

```text
Build command: pnpm build
Publish directory: dist
```

If deploying manually, do not upload the source folder directly. Run `pnpm build` first, then upload the generated `dist` folder.

## Important Asset Note

The 3D model files are loaded through Vite asset URLs so they are included in the production build. If a model page shows `MODEL LOAD FAILED`, check that the deployed `dist/assets` folder contains the generated `.glb` files.

## Key Files

- `map.html` and `map.mjs` power the atlas map.
- `index.html` and `main.mjs` power the 3D detail view.
- `building-data.mjs` stores site metadata and model references.
- `mask-layout.mjs` handles text-slot carving around model silhouettes.
- `MODEL_SWAP.md` documents model replacement and tuning.

## Previous Version

The previous repository contents are preserved in the `old-version-backup` branch. They are kept only for reference and are not the active project direction.
