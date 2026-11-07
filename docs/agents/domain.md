# Domain Docs

## Before exploring

- Read `GLOSSARY.md` at the repo root.
- Read relevant decisions in `docs/adr/`.
- If either is absent, proceed silently. Do not suggest creating it upfront; `/domain-modeling` creates docs when terms or decisions are resolved.

## File structure

This is a single-context repo: `GLOSSARY.md` and `docs/adr/` live at the repo root.

## Use the glossary's vocabulary

Use glossary terms when naming domain concepts. Avoid synonyms the glossary explicitly excludes. If a needed concept is missing, reconsider whether it belongs or note the gap for `/domain-modeling`.

## Flag ADR conflicts

If your output contradicts an ADR, surface the conflict explicitly rather than silently overriding it.
