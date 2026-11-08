# npm publishing with GitHub Actions and Changesets

Status: ready-for-agent

## Goal

Publish Event Tape's Recorder SDK and Viewer on npm, with explicit release intent, reviewable versions/changelogs, and tokenless regular publishing. This is a design specification, not authorization to implement or publish.

## Confirmed product decisions

- Public packages: `@event-tape/sdk` and `@event-tape/viewer`. Keep the Viewer CLI and web assets in one package; retain the `event-tape` command.
- Keep root and `@event-tape/recording-format` private. Do not expose a new public format package or split the SDK/Viewer further.
- Start both public packages at `0.1.0`, then version independently. Recording format versions are a separate compatibility contract.
- Use MIT licensing. Add the actual license and consistent package metadata during implementation; planning has not changed the license yet.
- Use Changesets, not commit-message inference, to declare affected packages, SemVer intent, and consumer-facing notes. Do not require Conventional Commits.
- Write notes in English. Commit per-package `CHANGELOG.md` files and generate package-specific GitHub Releases/tags from the same notes; no hand-maintained combined changelog.
- In 0.x, compatible fixes are patch; features and breaking changes are minor. Clearly label breaking changes and migration steps. Declare 1.0 stability deliberately rather than accidentally through a breaking-change bump.
- Missing changesets get a non-blocking PR reminder. No release is needed for documentation/test-only work. Maintainer remains responsible for release intent and bump correctness.
- A Release PR collects reviewed version, changelog, and lockfile changes. Merge authorizes publishing after verification; ordinary feature merges do not authorize publishing arbitrary unpublished manifest versions.
- Use built-in `GITHUB_TOKEN`, accepting manual approval to start CI on bot-created/updated Release PRs. No GitHub App or personal access token initially.
- Use direct npm OIDC publication after bootstrap. No second publish approval, staged publication, or regular npm write secret. Keep automatic provenance enabled.

## Proposed implementation structure

### Package preparation

- Preserve pnpm 11.9.0 and the existing Turbo scripts; do not introduce another package manager or native pnpm versioning alongside Changesets.
- Use a compatible current Changesets CLI/action pair. Research observed CLI 3.0.3 and Action 2.1.2; verify/pin their releases during implementation. Do not mix CLI3/action1 examples. Prefer the version/pack/publish sub-actions with least-privilege jobs.
- Run release tooling on Node 24 with an explicitly compatible npm CLI (OIDC minimum npm 11.5.1). This does not raise SDK or Viewer consumer runtime requirements.
- Set public access and npmjs.org target explicitly; keep private package boundaries explicit. Add correct repository URL/directory, license, descriptions, and package-local installation/use documentation.
- SDK artifacts must include runtime code and usable TypeScript declarations. Viewer artifacts must include the executable CLI, web assets, fonts, and Worker assets required by the current build.
- Bundle the private format implementation where needed. Public tarballs must work without this checkout or a published recording-format dependency. Verify behavior by installation outside the workspace rather than assuming build output is sufficient.
- Internal format changes require changesets for every public package whose shipped behavior changes; do not assume a private-package version bump automatically selects the public releases. No recording format redesign is included.

### Pull request CI and version preparation

- Install with the pinned pnpm and frozen lockfile; run existing lint, typecheck, tests, and build commands.
- Check Changesets status and display a non-blocking reminder when no release intent is present, without executing untrusted PR code with write permissions. An external Changesets Bot installation is not required.
- On main, collect pending intents into an updating Release PR. Keep package versions, generated changelogs, consumed intent files, and refreshed pnpm lockfile together.
- Give only the version job repository contents/PR write permissions. Enable Actions PR creation in repository settings; approve bot-triggered checks as required by current GitHub behavior.
- Version-only PR generation must not accidentally produce an initial `0.2.0`: the approved initial release must contain exactly `0.1.0` for both public packages.

### Artifact verification and regular publication

- After the approved release changes reach main, verify that reviewed release state, then build/pack the affected packages. Smoke the actual resulting tarballs before any registry mutation.
- SDK smoke: install in an isolated external ESM consumer, use the public API to write a real recording and a custom Writer, close successfully, and verify the recorded output. Check TypeScript consumption of the packed public API.
- Viewer smoke: install the tarball outside the workspace, exercise help/version and `event-tape view <sample> --no-browser`, fetch the local recording and packaged UI/Worker assets, and stop the process. During implementation also observe the actual browser Viewer loading the recording.
- Publish the verified tarballs, not a second independently rebuilt copy. Give `id-token: write` only to the publish job and grant GitHub release/tag permissions only where needed.
- Keep release work serialized, do not cancel a registry-mutating publish halfway through, and do not infer downstream execution from bot-created tag/release events. Publication and release metadata must be orchestrated explicitly.
- Only reviewed intended versions may publish. Ordinary merges, pending changesets, and bootstrap state must not create an automatic first release. Use the tool's documented release plan and prove its initial/no-publish cases before activation.
- npm publication is not atomic across packages. If one succeeds and another fails, inspect registry state and finish the missing package/metadata; never overwrite an existing version or blindly bump everything. For a bad published artifact, prepare a new fixed release and deprecate the bad version as appropriate.

## Bootstrap and human prerequisites

1. Confirm authority over the npm `@event-tape` scope and both final names; establish account/email/2FA access. Current 404 package lookups prove neither ownership nor reservation. If scope use is impossible, return to naming decisions before publishing.
2. Prepare CI, package artifacts, Changesets, and the reviewed initial Release PR with automatic npm publication inactive. Ensure merge cannot try an OIDC first publish of a nonexistent package.
3. After initial Release PR approval/merge and successful artifact checks, the maintainer logs in to npm and publishes the reviewed real `0.1.0` artifacts with explicit public access. Do not create empty placeholder releases or store credentials in chat/repo. These local initial publications have no GitHub Actions provenance.
4. Prepare the final `.github/workflows/release.yml` identity before trust setup. For each npm package, authorize `larb26656/event-tape`, workflow filename `release.yml`, with direct publish permission. New npm trust defaults are stage-only; direct publish must be enabled. Do not configure an unused environment or a second approval gate.
5. Activate regular publication only after package creation and trusted-publisher setup. Schedule the next real reviewed release so each new trust configuration completes its first successful OIDC publish within two days; otherwise delete/recreate expired trust rather than publish an unnecessary dummy version.
6. After real OIDC publication succeeds, confirm provenance and restrict legacy token-based access using npm's documented 2FA/disallow-tokens setting. No permanent npm publishing secret is required.

Bootstrap activation mechanics must be verified against the selected Changesets action before implementation is considered complete; the invariant is no automatic first publication before the human bootstrap. Account actions and real npm publication require explicit separate authorization, even after the design is confirmed.

## Acceptance criteria for later implementation

- Both tarballs install and run outside the monorepo; private format source is not an unresolved runtime dependency.
- Initial approved versions are exactly 0.1.0. A Viewer-only intent later bumps/releases only Viewer; an intent affecting both includes both; documentation-only work creates no forced package release.
- The Release PR exposes versions, English changelog entries, and lockfile changes. Missing intent is non-blocking; failed correctness/package checks prevent publication.
- Fresh clones use the declared toolchain and lockfile. Build artifacts are complete, licensed, and exclude unintended source/secrets; packed SDK declarations typecheck.
- No registry write occurs during local smoke verification. Exercise version/no-publish planning in an isolated temporary checkout, keeping all throwaway artifacts out of the deliverable.
- Human bootstrap instructions, exact trust identity/permissions, activation timing, bot-CI approval, and partial-publication recovery are documented.
- Regular publication uses OIDC on a GitHub-hosted runner with no npm write secret and produces the matching package-specific GitHub Releases. Claim OIDC/provenance success only after observing an authorized real release, not from YAML inspection or a dry-run.

## Not included

Desktop distribution, public recording-format API, prerelease channels, staged npm publishing, automated rollback/tag promotion, new runtime support, mandatory Conventional Commits, GitHub App setup, or product behavior changes.

## Evidence and sources

- [Release tooling research and comparisons](research-release-tools.md)
- [npm trusted-publishing prerequisites, bootstrap, and source contradictions](research-trusted-publishing.md)
- [Decision interview record](decisions.md)
- [Changesets automation](https://changesets.dev/guide/automating)
- [Changesets configuration](https://changesets.dev/guide/config)
- [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/)
- [Current GitHub token/workflow rules](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow)

## Current verification boundary

Planning/research only. Repository package manifests/build configuration and public GitHub/npm metadata were inspected. The actual `pnpm help change` command reported pnpm 11.9.0 and no help result for `change`; current pnpm website native-release examples were not assumed available. No build/test/package/publish workflow was executed or implemented. The user confirmed the complete design and proposed verification gates on 2026-11-08; implementation and account/publish operations are not authorized by this planning confirmation.

## Comments

- 2026-11-08: User confirmed the complete design after the decision interview. Ready for implementation planning/decomposition, not an instruction to start implementation or publish.
