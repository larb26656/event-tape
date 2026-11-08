# npm publishing — design interview

Status: ready-for-agent

## Confirmed decisions

- Publish the SDK and Viewer as two separate public npm packages. Viewer keeps CLI and web assets in one distribution; recording-format stays private.
- Use a reviewable Release PR containing version changes and changelog. Merging ordinary work into main does not itself require a publish; merging the Release PR authorizes publishing.
- Use the MIT license. License/package/workflow changes have not been implemented.
- Use Changesets (`changesets/changesets`) for release intent, versioning, and changelog generation.
- Keep the target names `@event-tape/sdk`, `@event-tape/viewer`, and CLI command `event-tape`. Scope authority is a prerequisite to verify, not an established fact.
- SDK and Viewer versions progress independently; package versions are separate from Recording format versions.
- Start both public packages at `0.1.0`; matching initial numbers do not imply a fixed version group.
- Write release notes in English. Commit a separate package `CHANGELOG.md` for SDK and Viewer and generate package-specific GitHub Releases from the same notes.
- While on 0.x: compatible bug fixes use patch; features and breaking changes use minor; breaking notes include migration guidance. Move to 1.0 deliberately when declaring stability.
- After Release PR merge and successful verification, publish directly through npm OIDC with automatic provenance; no second publish approval or regular npm write token.
- Bootstrap by human-authenticated publication of the reviewed real `0.1.0` artifacts after Release PR approval. Initial local publication has no GitHub Actions provenance. Configure each package's trust when ready for a subsequent successful OIDC release within the two-day activation window.
- Missing changesets produce a non-blocking PR reminder; documentation/test-only work need not release. Maintainer reviews release intent.
- Use built-in `GITHUB_TOKEN`, accepting manual approval to start bot-created/updated Release PR checks rather than provisioning a GitHub App/PAT.

## Repository facts

- pnpm 11.9.0 and Turbo monorepo; root package is private.
- Current public-package candidates: `@event-tape/sdk` (0.0.0) and `@event-tape/viewer` (0.0.1).
- `@event-tape/recording-format` is private and listed as a workspace devDependency by both public-package candidates.
- No existing `.github` workflow files were found.
- [GitHub repository metadata](https://api.github.com/repos/larb26656/event-tape) reports a public repository and default branch `main`.
- npm registry lookups for the two current package names returned HTTP 404. This does not establish ownership or availability of the `@event-tape` scope.

## Confirmation and external prerequisite

- User confirmed the complete design and proposed verification gates on 2026-11-08. The complete specification is [spec.md](spec.md); no design questions remain open.
- Actual npm scope permissions remain unverified; target names are decided. This is a human setup prerequisite before any publish, not an unresolved naming preference. If the scope is unavailable, reopen naming rather than silently substituting names.

## Research

- [Release tools](research-release-tools.md)
- [npm trusted publishing](research-trusted-publishing.md)

## Boundary

Planning and research only. The user confirmed the complete design, not implementation or account/publishing operations. Those require a separate instruction.
