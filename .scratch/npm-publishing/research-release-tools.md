# Release/version/changelog tooling research

Research date: 2026-11-08. Scope: planning only; no packages, workflows, or publishing were changed. This compares the three requested tools for Event Tape's small pnpm monorepo. Facts below link to official documentation, first-party package metadata, source, or maintainer statements. Recommendations and unresolved decisions are labelled separately. Confirmed product decisions supplied during planning: **two public packages (SDK and Viewer), private internal recording-format, reviewable Release PR approval before publication, and MIT licensing**.

## Recommendation (not a product decision)

**Prefer Changesets' explicit change-intent model plus a reviewable version/release PR.** For a solo maintainer, selecting affected packages, bump types, and consumer-facing notes while making the change is a modest recurring task, and avoids making commit-message discipline the authority for releases. Its first-party pnpm/monorepo support fits two public packages plus a private internal package better than adding a monorepo extension to semantic-release. The confirmed requirement for Release PR approval fits Changesets and release-please directly; it does not fit semantic-release's default release-on-branch-change model. Collecting change intent and authorizing publication remain distinct steps. [C1][C2][C3][R1][S1]

- Implement the confirmed approval policy as a deliberate merge of the version PR, followed by verification-gated publication of those reviewed versions if automation is approved. Changesets already separates versioning and publishing. This research does not implement or authorize a publish. [C3][C4]
- Start with independent SDK/Viewer package versions **unless the maintainer decides** they form one public release unit. Changesets `fixed` is available if they must always version and publish together; `linked` is not a substitute for that requirement. Keep recording-format private; whether to track its internal versions/changelog is a separate choice. [C2]
- Avoid custom changelog generators, prerelease branches, and mandatory changeset bots initially unless a concrete requirement calls for them. This is a maintenance recommendation, not a tool limitation. The default generator already adds commit links; changes that do not need a release do not need a changeset. [C1][C2]
- If Conventional Commits are already a desired, durable working convention, **release-please is a credible second choice**: strong reviewable PR workflow, but separate publishing logic and monorepo manifest/plugin choices remain necessary. [R1][R2]
- Do not select semantic-release merely to get automatic changelogs. Its fully automated, commit-derived, one-releasable-per-repository model is a less conservative match here; independent multi-package orchestration adds another support boundary. This does **not** imply that semantic-release or community extensions are unmaintained. [S1][S2]

## At-a-glance comparison

| Concern | Changesets | release-please | semantic-release |
| --- | --- | --- | --- |
| Source of release intent | Committed Markdown file explicitly names packages, each SemVer bump, and release summary; not derived from commit syntax. [C1] | Parses Conventional Commits; `fix` → patch, `feat` → minor, breaking marker → major; override mechanisms exist. [R1] | Commit-derived; defaults to Angular commit convention, configurable analyzer/notes presets and rules. [S1][S3] |
| Changelog authoring | Consumer-oriented prose written alongside the change, combined into package changelogs during versioning; editable before release. [C1][C3] | Generated from commit history into changelog/version release PR. [R1] | Generates release notes; checked-in `CHANGELOG.md` is additional plugin behavior, not the default committed release artifact. [S3] |
| Monorepo dependencies | First-party focus: package-specific bumps and dependent handling; independent versions, `fixed`, `linked`, workspace-specific range options. [C2][C5] | Manifest declares package paths/current versions. `node-workspace` updates local dependency references and patch-bumps affected dependents; `linked-versions` can synchronize groups. [R2] | Maintainer says releasables are expected 1:1 with repository; multi-package use requires community extensions/custom orchestration, not just setting `pkgRoot`. [S2][S4] |
| Reviewable release PR | Action creates/updates a version PR; merge when ready. [C4] | Core workflow is a continually updated release PR; merge creates Git tag/GitHub release. [R1] | Default is CI-driven release on release-branch changes, not a maintained release PR. Dry-run previews version/notes; that is not a release-PR workflow. [S1][S3] |
| npm publication | Separate CLI publish step / Action integration, including first-party trusted-publishing guidance. [C3][C4] | Explicitly **does not** publish to package managers; own downstream steps consume action outputs. [R1][R3] | Included npm plugin publishes package; first-party OIDC guidance. [S4][S5] |
| Solo-maintainer overhead (assessment) | Remember release-worthy intent files; review generated versions/notes; maintain CLI/action and pnpm lockfile integration. | Keep Conventional Commit/squash discipline; maintain manifest/config + workspace plugin + separate publisher. | Keep commit convention and branch release policy; multi-package extension/orchestration and checked-in changelog/version plugins add complexity if needed. |

## Supporting facts and operational caveats

### Changesets

1. A changeset is Markdown plus YAML frontmatter mapping package names to `major`/`minor`/`patch`; summary text becomes the changelog. Multiple changesets can be added to one PR, and package selections/bump types/prose can be edited before versioning. Files are consumed by `changeset version`. This is **explicit human-declared intent**, not automatic detection of API compatibility. [C1]
2. `changeset version` updates versions and changelogs for review/commit; publication is a distinct command. Current docs show package tags such as `pkg-name@X.Y.Z`. [C3]
3. Default `fixed: []` and `linked: []` avoid forced version groups. `fixed` bumps/publishes the group together; `linked` shares a version progression without necessarily releasing unchanged members. `updateInternalDependencies` controls range updates for already-releasing dependents; documentation warns it does not mean every in-range dependency change forces a dependent release. Do not promise “all packages always bump” without choosing `fixed`. [C2]
4. `private: true` prevents npm publication; current CLI v3 defaults do not version or tag private packages. Do not copy v2's private-package defaults. `ignore` is documented as temporary deferral, not a permanent publication boundary. This matters for a private root and any app that should remain unpublished. [C2]
5. The current Action supports separate select-mode/version/pack/publish sub-actions, and recommends splitting them for trusted publishing to narrow permissions. Version PR creation needs repository permission to let Actions create PRs. The publish job alone should have `id-token: write`. The simple combined action is also available but combines capabilities. [C4]
6. pnpm's official Changesets recipe requires refreshing the lockfile after versioning and committing the result. A future version command/workflow must include lockfile maintenance, not only `changeset version`. Its workflow sample still shows Action v1/token publishing, so use current Changesets/npm docs for the Action API and authentication instead of copying that sample unchanged. [P1][C4][N1]
7. **Current-version evidence:** npm `latest` is `@changesets/cli@3.0.3`; official GitHub latest Action release is `v2.1.2`, both non-prerelease. Requirements: CLI Node `^22.11 || ^24 || >=26`, pnpm `>=10.0.0`. Thus the project's pnpm 11.9.0 is in the documented supported range, but generic project `Node >=22` alone does not specify a supported minimum for this release tool. Current READMEs still carry a “development branch” banner; published metadata and current site docs establish that CLI3/Action2 releases exist. Do not mistakenly mix CLI3/action1 or CLI2/action2 examples. These are observed versions, not a proposed dependency pin. [C5][C6][C7]
8. **Staged publishing is explicitly not supported at present** by the Changesets automation guide. Trusted publishing with direct npm publication is documented. This distinction matters because new npm trusted-publisher configurations now default to stage-only permission. [C4][N1]

### release-please

1. It parses git history, proposes changelog/package version changes in a release PR, and on merge creates tags/GitHub releases. It explicitly does not publish to package managers or manage complex release branches. It recommends squash merging so the merged commit represents the user-facing change rather than intermediate implementation commits. [R1]
2. The manifest mode stores package-path configuration in `release-please-config.json` and versions in `.release-please-manifest.json`; by default it combines changes into one PR. Separate package PRs are optional. Initial version/history bootstrap must be decided, not left to an accidental inferred history boundary. [R2]
3. `node-workspace` builds a dependency graph across configured Node packages, updates internal references, and can patch-bump previously unchanged dependents. `always-link-local` defaults true, allowing breaking local dependency updates. Peer dependency updates require explicit opt-in. `linked-versions` is another plugin for version-group synchronization. These policies must be reviewed together rather than assuming the manifest alone provides dependency propagation. [R2]
4. **pnpm-specific caution:** the package JSON updater deliberately skips protocol-prefixed dependency specs (`^[a-z]+:`), which includes `workspace:`. That can preserve pnpm's dynamic workspace ranges, but is not evidence that it rewrites explicit `workspace:1.2.3` ranges correctly. Its Node workspace source handles `package-lock.json`; the consulted docs do not promise automatic `pnpm-lock.yaml` updates. Any future adoption must establish the exact project's range/lockfile behavior before declaring compatibility end-to-end. This is an evidence gap, not a blanket statement that pnpm is unsupported. [R4][R5]
5. The Action exposes `releases_created`, `paths_released`, and per-path release outputs, so a publisher can be gated in the same workflow after release creation. This avoids assuming that a bot-created GitHub release will automatically start a separate `release`-event publish workflow. npm OIDC can be used by those separate publishing steps; release-please itself does not perform npm authentication. [R3][G1][N1]
6. GitHub permission requirements include contents/issues/PR write. Its README recommends a custom token for triggering downstream workflows; **its broad claim that `GITHUB_TOKEN` cannot trigger PR workflows is stale relative to current GitHub docs** (see shared caveat below). Do not introduce a PAT solely by copying this old warning. [R3][G1]

### semantic-release

1. Core goal is to determine versions, generate release notes, and publish automatically in CI after successful verification on release branches. Commit analysis defaults to Angular-style messages; Conventional Commits-style presets/rules are configurable. Its standard flow is not “collect intent → review version PR → merge to release.” Manual dispatch or other trigger control can change timing, but not turn it into release-please's maintained PR model by itself. [S1][S3][S5]
2. The project's maintainer explicitly states monorepos are not officially supported and releasables are expected 1:1 with repositories; community extensions exist but are not supported by the core team. This statement is dated 2024-10-04, not presented as a new 2026 announcement. The official npm plugin has one `pkgRoot`; changing that directory does not add package dependency graph handling. A current first-party plugin list separates official and community plugins. [S2][S4][S6]
3. By default the npm plugin updates the package version for publication but does not commit that version to the repository. Checked-in versions need `@semantic-release/git`; a checked-in changelog needs `@semantic-release/changelog` and a commit mechanism. The FAQ warns that release-time commits add branch-protection and hook complexity. These are material differences if the desired deliverable is reviewable repository changelogs, not only GitHub release notes. [S3]
4. The npm plugin explicitly recommends trusted publishing, needs job `id-token: write`, and uses npm CLI. The GitHub Actions recipe says not to set `registry-url` through setup-node because its generated `.npmrc` can conflict with plugin authentication. Use the tool-specific recipe rather than combining token-era generic examples. [S4][S5]
5. Current npm `latest` is semantic-release `25.0.9`, with engine `^22.14.0 || >=24.10.0`. The prose Node requirement page says “22.14.0 or higher,” which is less precise than the published engine range; a future release environment must satisfy the actual installed version. [S7][S8]
6. Its FAQ explicitly does not support choosing an initial `0.0.1` release and recommends prereleases for unstable development. If Event Tape wants a particular initial `0.x`/experimental policy, resolve that before selecting this model. [S3]

## Shared GitHub Actions / npm caveats

- **OIDC compatibility does not select the versioning tool.** All three can participate in trusted publication: Changesets and semantic-release document their publish integration; release-please hands off to an npm-capable publisher. npm requires Node >=22.14.0, npm CLI >=11.5.1, a matching package trusted-publisher configuration, GitHub-hosted runners, and `id-token: write` on the publishing job. pnpm 11.9.0's presence alone does not establish the npm CLI version actually used by a particular publishing path. [C4][S4][R3][N1]
- **Current npm settings are date-sensitive:** trusted-publisher configs created after 2026-09-03 always permit staging, and direct `npm publish` requires selecting that additional permission. A new configuration must complete its first successful publish within two days or be replaced. Choose direct vs staged publication deliberately; a tool that invokes `npm publish` is not automatically compatible with a stage-only publisher. [N1]
- **GITHUB_TOKEN event semantics changed:** current GitHub docs say PR `opened`/`synchronize`/`reopened` events created by `GITHUB_TOKEN` create approval-required workflow runs, which a writer must approve. `workflow_dispatch`/`repository_dispatch` also run; other token-generated events generally do not. Bot-created tags/releases therefore must not be assumed to start downstream push/release workflows. App/PAT tokens can make PR workflows run without that approval step, at the cost of more credential setup. Favor current GitHub documentation over older tool READMEs. [G1]
- Trusted publishing removes a long-lived **npm** write token; it does not remove GitHub PR/release permissions or automatically solve approval/check behavior. Provenance is automatic for OIDC publication from a public repository of a public package; it is not automatic proof that all packaging/runtime requirements were tested. [N1][G1]

## Decisions still open for the maintainer

1. Independent SDK/Viewer versions versus one shared fixed release unit; what compatibility promise applies between them?
2. Should private recording-format receive internal versions/changelogs? Its publish boundary is already decided: it stays private. Package preparation must account for that boundary rather than publish it incidentally.
3. Initial version (`0.x`, `1.0.0`, or prerelease) and the policy for breaking recording-format changes. Package SemVer and on-disk recording format compatibility need not be identical.
4. Do release-worthy changes get explicit changeset files, or should Conventional Commit/squash discipline be the release authority?
5. Release PR approval is confirmed. Is its merge the sole release authorization, or is an additional publish-job/staged npm approval also desired? Changesets' present staged-publishing limitation affects only that additional gate choice.
6. Is the canonical changelog checked in per package, a combined product changelog, GitHub release notes, or a combination? Default tool outputs differ.
7. Accept manual approval of bot PR checks using `GITHUB_TOKEN`, explicitly dispatch checks, or maintain GitHub App/PAT credentials for unattended behavior?
8. Exact stable tool/action versions, supported Node release runtime, and pnpm lockfile/range integration should be pinned during implementation planning, not inferred from older examples.

### Bounded adjacent finding

Current pnpm documentation also advertises native Changesets-format release management (`pnpm change`, `pnpm version -r`) without installing the Changesets CLI, with different changelog-storage/ledger behavior. This is **not evaluated here as a fourth candidate**. The parent researcher observed the repository's pinned executable return `Version 11.9.0` and `No results for "change"` from `pnpm help change`; no command was rerun in this slice. Therefore current website examples must not be treated as an available drop-in solution for pinned pnpm 11.9.0. Changesets remains the conservative candidate without requiring a pnpm upgrade. Do not run native versioning and Changesets CLI consumption together without an intentional design. [P2]

## Sources

- [C1] Changesets FAQ: https://changesets.dev/faq
- [C2] Changesets current configuration reference: https://changesets.dev/guide/config
- [C3] Changesets versioning/publishing: https://changesets.dev/guide/versioning-and-publishing
- [C4] Changesets current automation/OIDC guide: https://changesets.dev/guide/automating ; published Action API: https://github.com/changesets/action/blob/v2.1.2/README.md ; publish sub-action: https://github.com/changesets/action/blob/v2.1.2/publish/README.md
- [C5] Changesets getting started / runtime and package manager requirements: https://changesets.dev/guide/getting-started
- [C6] First-party npm CLI latest metadata: https://registry.npmjs.org/@changesets%2fcli/latest ; GitHub release: https://github.com/changesets/changesets/releases/tag/%40changesets/cli%403.0.3
- [C7] Action latest release API / release: https://api.github.com/repos/changesets/action/releases/latest ; https://github.com/changesets/action/releases/tag/v2.1.2
- [R1] release-please official README (model, Conventional Commits, no package publication): https://github.com/googleapis/release-please#readme
- [R2] release-please manifest and workspace/version-group plugins: https://github.com/googleapis/release-please/blob/main/docs/manifest-releaser.md
- [R3] release-please Action API, permissions, outputs and publishing handoff: https://github.com/googleapis/release-please-action#readme
- [R4] release-please dependency range updater source: https://github.com/googleapis/release-please/blob/main/src/updaters/node/package-json.ts
- [R5] release-please Node workspace source: https://github.com/googleapis/release-please/blob/main/src/plugins/node-workspace.ts
- [S1] semantic-release official overview: https://github.com/semantic-release/semantic-release#readme
- [S2] Core maintainer monorepo support statement, 2024-10-04: https://github.com/semantic-release/semantic-release/discussions/3465#discussioncomment-10838713
- [S3] semantic-release FAQ (versions, committed changelogs, dry-run, initial versions): https://semantic-release.org/support/faq/
- [S4] Official npm plugin, OIDC, npm CLI, pkgRoot: https://github.com/semantic-release/npm#readme
- [S5] semantic-release GitHub Actions/OIDC recipe: https://semantic-release.org/recipes/ci-configurations/github-actions/
- [S6] semantic-release official/community plugin catalogue: https://semantic-release.org/extending/plugins-list/
- [S7] Published semantic-release latest metadata / engines: https://registry.npmjs.org/semantic-release/latest
- [S8] semantic-release Node requirements prose: https://semantic-release.org/support/node-version/
- [G1] Current GitHub workflow-trigger/token rules: https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow
- [N1] npm trusted-publisher requirements, permissions, expiry and provenance: https://docs.npmjs.com/trusted-publishers/
- [P1] pnpm official Changesets integration (lockfile update; older Action example): https://pnpm.io/using-changesets
- [P2] pnpm native release-management documentation: https://pnpm.io/versioning
