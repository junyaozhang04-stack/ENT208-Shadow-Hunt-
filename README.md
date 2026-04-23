# ENT208-Shadow-Hunt

## Scope Change Notice

This project has changed direction.

- `main` now contains the final version of the new `pretext-3d` project.
- `old-version-backup` preserves the previous repository contents for reference only.
- The old version is no longer the active direction of this repository.

# pretext-3d

`pretext-3d` is an open-source template for building editorial web pages where live 3D geometry actively shapes the text layout.

This is the important difference: the 3D model is not a background layer, and Pretext is not being used as a static text formatter. The visible silhouette of the model becomes a real layout constraint. As the camera moves, the occupied shape changes, the legal text slots change, and Pretext recomposes the copy so the page stays readable.

That makes this project more than a visual demo. It is a small layout engine for a type of web storytelling that is usually painful to build from scratch.

## Why This Matters

Most so-called `3D + editorial` pages still work like posters:

- the 3D object is decorative
- the text is placed in fixed columns
- collisions are solved manually
- every new model means another round of hand-tuned layout hacks

`pretext-3d` takes a different route.

It treats the rendered 3D subject as a live spatial obstacle and lets Pretext flow text around the current silhouette in real time. That is the conceptual jump. You are no longer placing copy on top of a scene. You are composing a page where geometry and typography negotiate with each other frame by frame.

For Pretext specifically, this shows a more radical use case than standard text layout. Instead of reflowing inside a rectangular text box, Pretext is driving copy through irregular, moving slots extracted from a 3D mask. In practice, that turns Pretext from a formatting utility into a programmable editorial layout system.

## Why This Is Useful

This pattern is valuable anywhere the object itself should structure the narrative:

- editorial storytelling
- brand showcases
- museum or exhibition microsites
- architecture and product presentations
- portfolio pages with stronger art direction
- experimental publishing on the web

The value is not just aesthetics. The value is that the page can stay legible while still feeling spatial, cinematic, and alive.

Without a template like this, building the same effect is annoying in exactly the wrong ways:

- you need to render and normalize a 3D model
- you need a mask pipeline
- you need to scan geometry occupancy into usable layout intervals
- you need text reflow that can survive irregular line widths
- you need motion that changes the composition without destroying readability
- you need model-swap ergonomics so every new asset does not become a rewrite

That is the work this repository is trying to remove.

## What The Template Actually Does

At runtime, the system works like this:

1. Render a `glb` model with Three.js
2. Render the same scene into a high-contrast black and white mask
3. Scan each text band for occupied pixels
4. Convert the remaining horizontal runs into legal line slots
5. Ask Pretext for the next valid line inside each slot
6. Reflow the copy again as the camera motion changes the silhouette

Core flow:

`GLB -> Three.js scene -> silhouette mask -> slot carving -> Pretext line layout -> positioned editorial copy`

## What You Get Out Of The Box

- a working `Three.js + Pretext` integration
- live mask-based text exclusion from a moving 3D subject
- a restrained horizontal scrub interaction that preserves readability
- model normalization and framing hooks
- adjustable layout quality controls such as mask padding and minimum slot width
- private model workflow: `assets/model.glb` is expected locally but ignored by git

## Why Building This Yourself Is Annoying

Individually, none of the parts are impossible. Together, they are easy to get wrong.

The hard part is not loading a model or rendering text. The hard part is getting all of these layers to cooperate:

- the model has to be framed consistently
- the mask has to be clean enough to produce usable slots
- the slot carving has to ignore noisy fragments
- the text engine has to accept constantly changing widths
- the motion range has to feel alive without wrecking the composition

That is why a reusable starting point matters here. If someone wants to explore `3D + Pretext`, this repository skips the boring and fragile integration work and gets them directly to the part that matters: choosing a subject, tuning the composition, and writing the page.

## Stack

- `Three.js`
- `@chenglou/pretext`
- `Vite`

## Getting Started

```bash
pnpm install
pnpm dev
```

Open `http://127.0.0.1:4173/`.

## Add Your Own Model

Put your model at `assets/model.glb`.

The `assets/` directory is kept in the repo, but `.glb` files are ignored, so you can work with private 3D assets without publishing them.

When a new model looks wrong, the first places to touch are:

- `normalizeModel()` in `main.mjs`
- `SCRUB_RANGES` in `main.mjs`
- `computeFitState()` in `main.mjs`
- the layout quality knobs in `main.mjs` and `mask-layout.mjs`

See `MODEL_SWAP.md` for the model tuning workflow.

## Check

```bash
pnpm check
pnpm build
```

## Key Files

- `main.mjs` for scene setup, mask generation, camera motion, and layout orchestration
- `mask-layout.mjs` for slot carving and layout helpers
- `styles.css` for the visual system
- `MODEL_SWAP.md` for model swap and tuning notes
