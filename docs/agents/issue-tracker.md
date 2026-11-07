# Issue tracker: Local Markdown

Issues and specs for this repo live as markdown files in `.scratch/`.

## Conventions

- One feature per directory: `.scratch/<feature-slug>/`.
- The spec is `.scratch/<feature-slug>/spec.md`.
- Implementation issues are individual files at `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01`.
- Record triage state in a `Status:` line near the top of each issue; see `triage-labels.md`.
- Append comments and conversation history under `## Comments`.

## When a skill says "publish to the issue tracker"

Create a new file under `.scratch/<feature-slug>/`, creating the directory if needed.

## When a skill says "fetch the relevant ticket"

Read the referenced file. The user will normally provide its path or issue number.

## Wayfinding operations

Used by `/wayfinder`. The map is a file with one child file per ticket.

- Map: `.scratch/<effort>/map.md`, containing Notes, Decisions-so-far and Fog.
- Child ticket: `.scratch/<effort>/issues/NN-<slug>.md`, numbered from `01`. Record the type in `Type:` (`research`, `prototype`, `grilling`, or `task`) and claim state in `Status:` (`claimed` or `resolved`).
- Blocking: list ticket numbers in `Blocked by: NN, NN`. A ticket is unblocked when all listed files are resolved.
- Frontier: scan for open, unblocked, unclaimed tickets; first by number wins.
- Claim: set `Status: claimed` and save before work.
- Resolve: append the answer under `## Answer`, set `Status: resolved`, and append a context pointer to Decisions-so-far in `map.md`.
