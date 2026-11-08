# npm trusted publishing foundation for Event Tape

Research date: 2026-11-08. Research only: no workflow, registry publish, npm/GitHub account configuration, or verification commands were executed by this research task. Official npm/GitHub documentation and npm's first-party API documentation are the sources below. Facts and recommendations are distinguished explicitly. No account state was changed.

**Confirmed project decisions (user / coordinating researcher):** publish **SDK and Viewer**, keep **recording-format private**, use **MIT**, and require a **reviewable Release PR before publishing**. The coordinating researcher checked GitHub's public API: [`larb26656/event-tape`](https://api.github.com/repos/larb26656/event-tape) is public with default branch `main`. Registry lookups for [`@event-tape/sdk`](https://registry.npmjs.org/@event-tape%2Fsdk) and [`@event-tape/viewer`](https://registry.npmjs.org/@event-tape%2Fviewer) returned HTTP 404; this establishes neither reservation nor ownership of the `@event-tape` scope. These observations were supplied by the coordinator and were not rerun here.

## Executive conclusions

- **Fact:** GitHub Actions can publish to npm using OIDC without a stored npm publish token. The documented minimum is **npm CLI 11.5.1 and Node 22.14.0**, on **GitHub-hosted runners**, with **`id-token: write`**, and a trusted publisher configured **on each npm package**. pnpm's version is not the npm CLI version; the repository's general `Node >=22` constraint alone does not establish the required patch floor. [1]
- **Fact:** A nonexistent npm package cannot have trust configured yet: npm's trust API explicitly requires the package to exist. First create it using human/session or traditional token authentication; subsequent publishes can use OIDC. Creating an npm scope is not the same thing as creating a package. [3][5][6]
- **Date-sensitive fact:** New trusted-publisher configurations created after **2026-09-03** allow staging by default; **direct `npm publish` needs explicit permission**. A newly created trust configuration must complete its first successful publish within **2 days**, or it expires and must be deleted/recreated. Do not configure it weeks before the intended first OIDC release. [1]
- **Fact:** OIDC authentication is supported for private repositories, but **provenance is not**. Automatic provenance needs a **public repository and public package** and is automatic for GitHub Actions trusted publishing; no `--provenance` flag or npm token is needed. [1][2]
- **Recommendation:** Use GitHub-hosted Linux, an explicitly chosen compatible Node/npm toolchain, no npm write secret in the regular release workflow, per-package public access and matching repository metadata, and a deliberately chosen direct-publish versus staged-approval policy. Keep the first real release separate from the human bootstrap/setup procedure.

## Exact prerequisites and failure traps

| Area | Established requirement / behavior | Practical consequence |
| --- | --- | --- |
| Publishing runtime | npm CLI **>=11.5.1**, Node **>=22.14.0** for trusted publishing. npm's example uses Node 24. [1] | Pin/inspect the actual npm binary invoked by the chosen release tool; do not infer it from pnpm 11.9.0 or a runner image. Node 22.0 is insufficient. |
| Newer optional operations | Staging requires npm **>=11.15.0** and Node **>=22.14.0**. `npm trust` also requires npm **>=11.15.0**. OIDC dist-tag support is documented as npm **11.21.0+ on v11 / 12.2.0+ on v12**. [1][3][4] | Choose a toolchain for every command needed, not merely the oldest direct-publish minimum. npm 11.5.1 is not sufficient for the current full staged/trust/dist-tag feature set. |
| Runner | GitHub-hosted runners are supported; self-hosted runners are not. [1] | Use a GitHub-hosted runner such as `ubuntu-latest`; self-hosted macOS/Linux is not an OIDC fallback. |
| OIDC permission | `id-token: write` at workflow/job scope allows requesting the OIDC JWT; `contents: read` is sufficient for checkout. The former does **not** itself grant write access to other resources. [1][10] | Keep permission on the publishing job. npm trust is a separate registry-side authorization requirement. `packages: write` is for GitHub Packages, not a requirement to publish to npmjs.org. [9] |
| npm setup | Package must exist, configuring user must have write permission and 2FA enabled; configuring trust requires interactive 2FA, not a bypass-2FA granular token. [3][6] | Setup is a human-authorized governance operation, not something ordinary publishing OIDC can bootstrap for itself. |
| Per-package binding | Configure GitHub owner/user, repository name, workflow **filename only** including `.yml`/`.yaml`, optional environment name; file lives in `.github/workflows/`. Fields are exact and case-sensitive. [1] | A single workflow can publish multiple packages, but each package must separately trust it. Directory names/workspaces do not inherit npm trust. Use real final names before human setup. |
| Workflow/environment identity | Configured environment must match the publishing job; npm cautions that reusable/manual-workflow validation can check the calling workflow rather than the file containing the publish step, and parent/child need `id-token: write`. [1] | Prefer a straightforward first release workflow. If reusing workflows, determine the caller identity before entering settings; do not register the child filename by assumption. |
| Allowed commands | Staging is always allowed in new configs; direct publish and dist-tag management are independent opt-ins. [1][6] | Explicitly enable direct publishing if the chosen release tool calls `npm publish`. Publish permission does not automatically authorize promoting `next` to `latest` with `npm dist-tag`. |
| Trust lifecycle | Saved settings are not validated until publish. First success must occur in 2 days. Identity fields of an existing configuration cannot be edited; delete/recreate to change them. [1] | A successful dashboard save proves neither authentication nor workflow correctness. Plan actual first OIDC release immediately after setup. |
| Repository metadata | npm's trusted-publishing troubleshooting requires `repository.url` to match the GitHub repository; provenance docs additionally call out a public repository and case-sensitive matching. [1][2] | Set accurate metadata in **each published package**, including correct owner/repository casing; fork/rename/transfer and stale metadata can cause failure. |
| Registry/public access | Publish targets the configured registry; scoped registry mappings and `.npmrc` can override it. Explicit `--access public` or `publishConfig.access: "public"` avoids access-default ambiguity. [7][9][13] | Target `https://registry.npmjs.org`, not GitHub Packages. SDK and Viewer are the confirmed public packages; root and recording-format stay private. `private: true` prevents publication; it is not the same as an npm restricted package. [13] |
| Token boundaries | npm uses OIDC automatically. Its trusted-publishing docs say it attempts OIDC before falling back to traditional tokens. Install of private dependencies still needs read-only traditional credentials. [1] | Do not add an npm write token merely to satisfy an older token-based example. Scope any necessary read-only install token to the install step, not publishing. |
| Supported operations | OIDC covers publish/stage-publish and explicitly authorized dist-tags, not npm `whoami`, `view`, `install`, `access`, or human stage approval. [1] | `npm whoami` is **not** an OIDC preflight. An ENEEDAUTH on it does not prove trusted publishing is broken. |

### Secure workflow foundation (recommendations, not implementation)

- Build/package/test the intended artifacts before registry mutation; review the actual package tarballs and dependency metadata. npm documents `npm pack --dry-run` for seeing publish contents. Do not use a dummy bootstrap package as a substitute for a reviewed real distributable. [7]
- Grant OIDC only to a release job executing trusted, reviewed source, not arbitrary fork PR content. GitHub warns against privileged workflows checking out untrusted PR code. [12]
- Restrict release branches/tags using repository/environment protection. Optional npm environment binding is useful only if the GitHub job actually names that environment. GitHub required reviewers on Free/Pro/Team are available only for **public** repos; preventing self-review means a solo maintainer cannot approve their own initiated deployment. Admin bypass is enabled by default unless disallowed. [1][11]
- Follow GitHub's current workflow-dependency locking advice (dependency lockfile where adopted, otherwise full verified commit-SHA pins), rather than copying mutable action tags without deciding how updates are controlled. [12]
- After OIDC works, select npm's **Require two-factor authentication and disallow tokens** and revoke obsolete write/automation tokens. npm explicitly states this does not disable trusted publishers. Keep recovery/2FA access with the human owner. [1]
- Do not copy npm's standalone `npm ci` example into a pnpm monorepo unchanged. Repository installation/build orchestration and the publish tool's npm invocation are separate concerns; preserve the existing package manager, lockfile, and workspace transformation contract. This is an integration recommendation, not a claim that pnpm itself satisfies npm CLI's documented floor.

## Provenance, visibility, and metadata

**Facts:** npm automatically generates provenance for GitHub Actions trusted publishing when both repository and package are public. Private-source repositories are excluded even if their package is public. This is a provenance limitation, **not** a ban on OIDC publishing from private repositories. Provenance links a package to source/build context; it does not establish that code is safe. Attestations are signed through Sigstore and logged in a public transparency ledger, so npm requires reviewing the Linux Foundation immutable-record notice. Provenance can be explicitly disabled with `provenance=false`; keep it enabled for a public-source/public-package release unless there is a deliberate reason not to. [1][2]

**Facts:** Public repository metadata should be accurate and case-sensitive. For a monorepo, `repository.directory` can identify the package's subdirectory while `repository.url` remains the common GitHub repository URL. The npm package-json reference documents this object form. [2][13]

**Recommendation:** Decide repository visibility before promising provenance in a release plan. If source remains private, plan OIDC without provenance, not a token-based provenance workaround. Do not set `provenance: true` indiscriminately on a private-source package and assume it will work.

## New scope / package bootstrap: what happens before automation

### Namespace and authority

**Facts:** An npm username or organization grants the matching scope. A GitHub organization does not itself create an npm organization. User-scoped publishing needs an npm account; organization-scoped publishing additionally needs an npm organization and authority to create/publish in that namespace. New accounts must verify email before publishing. Package trust requires an existing package. [3][5][6][14]

**Recommendation:** Choose final public names and confirm scope control first. Check availability using the registry at implementation time. A 404 for an unpublished name is not a reservation, and no package availability/ownership assertion was established during this research.

### Supported bootstrap choices

1. **First real release by a human (simplest recommendation).** The maintainer authenticates locally using `npm login`, publishes a reviewed real version with explicit public access, and completes 2FA. That creates the package. Then configure trust for that package and perform a later OIDC release within the 2-day activation window. Direct interactive publish needs 2FA; a bypass-2FA granular access token is an alternative, but is unnecessary for this human path. A local initial publish does not have GitHub Actions build provenance. [1][3][5][6]
2. **Human-authenticated staging bootstrap (documented alternative).** npm now permits staging a nonexistent package with `npm stage publish`; it creates a **public `0.0.0-stage` placeholder**, while real staged content stays unavailable until human 2FA approval. This still needs an authenticated npm identity authorized for the namespace, **not initial OIDC**. After the package exists, trust can be configured. Approval is human, whether via website or CLI. Stage/tag/version interactions must be considered before using this path merely to reserve a name. [3][4][6][15]
3. **Temporary token-backed CI bootstrap (possible, not recommended by default).** A granular token can authenticate initial direct publishing when permitted and configured to bypass 2FA, or stage without bypass. This introduces a secret and does not remove subsequent interactive trust/governance setup. Never commit it; revoke after cutover. Do not use a bypass token for trust, package settings, or organization governance: npm explicitly rejects those operations. [5][6][15]

**Important distinction:** `npm stage publish` can create a missing package, but this does **not** solve OIDC's initial bootstrap: the trust API requires the package already exist, and OIDC exchange is package-scoped with a package-not-found response. There is no documented pending-trusted-publisher pre-registration path in the current official setup. [3][6]

**Recommendation:** Do not publish an empty `0.0.0`/`0.0.1` solely to make the UI appear. It is a real immutable public version. Prefer a reviewed first real release or explicitly choose npm's documented staged-placeholder route with its public side effect. A prerelease should use an explicit non-`latest` tag; the current stage CLI documents errors for prerelease/non-latest publication without a tag. [7][8][15]

### Boundary: repository work versus human/account work

| Repository changes that can be prepared/reviewed later | Human-authorized external operations |
| --- | --- |
| Package names/version/exports/files/license/readme/publish configuration; correct `repository.url` and monorepo directory. | Own/create npm user or organization scope; verify account email; arrange namespace permissions. |
| Workflow file at final filename, hosted runner, explicit runtime/npm version, pnpm install/build/package steps, job OIDC permission and optional environment reference. | Enable 2FA and preserve recovery access; authenticate for bootstrap; approve any staged initial release. |
| Release orchestration and documentation of public packages, tags, and artifact checks. | Create each package with a real authenticated publish/stage operation; configure its npm trusted publisher and allowed actions within 2 days of use. |
| Optional calls/configuration templates for GitHub environments/rules, subject to existing admin authority. | Approve/configure GitHub environment reviewers, protected refs, Actions policies, and account/repository access; choose/authorize who can release. |
| No regular npm publishing secret needed for OIDC. | Restrict npm package token access after OIDC succeeds; revoke temporary secrets/tokens. |

**Fact:** npm now has a CLI equivalent to dashboard trust configuration: `npm trust github <package> --file <workflow.yml> --repo <owner/repo> ...`. It requires npm >=11.15.0, package write permission, account 2FA, an existing package, and interactive authorization; it is unaware of workspaces. Therefore this work need not be mouse-only, but it is still **not unattended ordinary publish-CI work**. Explicitly pass each package and the desired permission. No commands in this section were executed. [3][6]

## Direct publishing versus staged publishing

- **Direct OIDC:** grant direct-publish permission on each package; CI publishes the real version immediately. GitHub environment approval may gate the job but is distinct from npm 2FA approval. Suitable if fully automated release is the intended policy. [1][11]
- **Stage-only OIDC:** CI submits a staged tarball; a maintainer inspects/approves it through npm with interactive 2FA. A bypass-2FA token does not bypass approval. npm recommends stage-only permission plus disallowing traditional tokens for its strongest package security posture. This is **not** fully automatic public publication. [1][4][5]
- **Release-tool implication:** a tool calling `npm publish` will not automatically switch to staging when denied. npm's API explicitly says rejected direct-publish requests are not redirected to staging. Check the chosen tool's actual support before selecting stage-only trust. [6]
- **Dist-tag implication:** promotion/rollback using `npm dist-tag` requires separate trust permission and sufficiently new npm; this is not implied by the right to stage or publish. The permission applies to all tags for that package, not selected tag names. [1][6]

## Immutable versions and recovery

**Facts:** A published `name@version` can never be overwritten or reused, even after unpublish. Unpublish cannot be undone. Entire-package unpublish imposes a **24-hour** wait before publishing any new versions of the name. Newly created packages may be unpublished within **72 hours** only if no other public-registry packages depend on them; after that, the stated self-service conditions are no public dependents, fewer than 300 downloads in the last week, and one owner/maintainer. Otherwise use deprecation (or support as applicable), not a presumed delete-and-retry mechanism. [7][8]

**Recommendations:**

- On bad published artifacts, publish a new fixed version; deprecate the broken one and, if appropriate, point the intended dist-tag at a known good release. Do not plan to rebuild different bytes under the same version. Tag movement changes future tag-based resolution, not users' exact-version or lockfile references.
- A release job can fail **after** npm accepted one or more packages. Inspect registry state before rerunning; finish only missing releases/metadata, never bump or republish already successful packages blindly. A monorepo release is not one atomic npm transaction; immutability applies package-by-package. This is an operational consequence of the per-package publish API and unique name/version constraint. [6][7]
- Staged versions also occupy the package's semver unique index. The stage CLI says an existing staged version blocks direct publication of that version. Its staged tag is immutable; to change it, reject and re-stage first. Do not conflate this documented pre-approval recovery path with the permanent immutability of a version already published live. [15]
- Keep provenance in perspective: its public immutable records and public tarballs are not a secrets-cleanup strategy. Review files before publishing; an unpublish is neither guaranteed nor evidence that all public copies disappeared. [2][5][8]

## Contradictions / uncertainties in the primary sources

These should remain explicit rather than becoming guessed implementation facts.

1. **Scoped access default:** npm's scoped-public guide and scopes overview say scoped packages default to private, while current npm v11 `npm publish`/stage configuration says new packages default to public. GitHub's publishing tutorial also explicitly asks for `--access public`. **Resolution for the plan:** set explicit public access; do not depend on whichever implicit default wins for a particular client version. [5][7][9][14][15]
2. **Number of trusted publishers:** npm's current trusted-publishers guide says **up to 10 per package**, but npm v11 and current unversioned/v12 `npm trust` docs still say the registry permits only one. **Resolution:** a single workflow per package is sufficient here; use the current dashboard/API documentation as the operational guide and check before designing a multi-publisher topology. Do not present the CLI page's single-configuration claim as the current universal limit. [1][3][16]
3. **Token-based examples are not OIDC requirements:** GitHub's generic npm tutorial still uses Node 20 and `NPM_TOKEN`/`NODE_AUTH_TOKEN`; npm's provenance-only example also includes a token. These demonstrate token-backed publication/provenance, whereas npm's dedicated trusted-publishing guide explicitly requires newer Node/npm and no publish token. **Resolution:** use the dedicated OIDC requirements for this plan; do not mix the examples. [1][2][9]
4. **2FA/disallow-tokens wording:** npm's generic 2FA page says maintainers must publish interactively under “disallow tokens”; its dedicated trusted-publisher guide expressly says OIDC continues working. **Resolution:** the generic statement describes traditional authentication; OIDC is a documented exception. [1][17]
5. **Stage API auth listing versus guide:** the stage API's security-scheme listing names traditional access/granular tokens, while the trusted-publisher and stage CLI docs explicitly support OIDC staging. It also lists a generic missing-package 404 while describing successful creation of new packages. **Resolution:** the endpoint's prose and dedicated CLI/guide establish the intended staged behavior, but do not infer that its security-scheme list is exhaustive. Initial OIDC bootstrap still cannot precede trust. [1][4][6][15]
6. **First successful “publish” for the 2-day validation window:** the trust guide does not unambiguously say whether an OIDC **stage submission** alone validates a new stage-only connection or whether human approval must complete. **Resolution:** schedule stage submission and human approval within the 2-day window, or obtain clarification before relying on delayed approval. [1]
7. **Workspace support:** `npm stage` says it is unaware of workspaces yet lists workspace flags in its generated configuration table. **Resolution:** do not assume root-level multi-workspace staging works; plan package-directory/artifact operations and verify actual support only when implementation is authorized. [15]

## Decisions required from the user

1. **Namespace and ownership:** confirm control of the proposed `@event-tape` npm scope, final public names, and who owns/administers the npm organization. HTTP 404 on `@event-tape/sdk` and `@event-tape/viewer` does not establish that authority.
2. **Initial release:** choose first real version and prerelease versus stable tag. Public SDK + Viewer, private recording-format, and MIT are already decided. The private workspace must not remain an unresolved install-time dependency of the public tarballs; packaging/bundling or dependency removal belongs to the implementation plan.
3. **Provenance:** the repository is already public, so the public-source prerequisite is met according to the coordinator's API check. Keep that visibility and plan automatic provenance; no visibility-change decision is needed unless the user later changes that requirement.
4. **Approval model:** the user already requires a reviewable Release PR before publish. Recommended interpretation: PR review/merge authorizes direct OIDC publication; do not silently add a second approval. Decide whether an additional GitHub environment approval or npm stage-only plus human 2FA approval is wanted. Name the approver only if adding such a gate; avoid self-review rules that block a solo maintainer.
5. **Bootstrap choice:** human first real publish (recommended default) versus staged-placeholder bootstrap, and acceptance of the public placeholder/initial-version side effects. Bootstrap must respect the requested reviewed Release PR, not bypass it. Do not ask for tokens or 2FA codes in chat.
6. **Release authority and trigger:** `main` is the confirmed default branch; propose publishing after the reviewed Release PR merges, rather than asking the user to choose arbitrary YAML details. Decide whether the workflow may move dist-tags. Fix the workflow filename/environment before npm trust setup.

## Sources

[1] npm, [Trusted publishing for npm packages](https://docs.npmjs.com/trusted-publishers/) — runtime, hosted runners, per-package fields, permissions, 2026 default changes, two-day expiry, automatic provenance, token restriction, troubleshooting and dist-tags. Page reports last edit 2026-10-06.

[2] npm, [Generating provenance statements](https://docs.npmjs.com/generating-provenance-statements/) — public/case-sensitive repository metadata, supported builders, ledger, limitations and older token-based examples.

[3] npm CLI v11, [npm trust](https://docs.npmjs.com/cli/v11/commands/npm-trust/) — existing package, >=11.15.0, write access, 2FA/interactive governance, per-package arguments and conflicting single-publisher statement.

[4] npm, [Staged publishing for npm packages](https://docs.npmjs.com/staged-publishing/) — >=11.15.0 / >=22.14.0, new-package public placeholder, human approval. Page reports last edit 2026-09-29.

[5] npm, [Creating and publishing scoped public packages](https://docs.npmjs.com/creating-and-publishing-scoped-public-packages/) — scope prerequisites, explicit public access, direct authentication, staged option. Page reports last edit 2026-09-29.

[6] npm, [Registry API](https://api-docs.npmjs.com/) — [OIDC exchange](https://api-docs.npmjs.com/#tag/OIDC), [Trust](https://api-docs.npmjs.com/#tag/Trust), [Stage](https://api-docs.npmjs.com/#tag/Stage), [Publish](https://api-docs.npmjs.com/#tag/Publish), and authentication/governance policy. Trust requires existing package, write access and interactive 2FA; allowed permissions are `createPackage`, `createStagedPackage`, `manageDistTags`.

[7] npm CLI v11, [npm publish](https://docs.npmjs.com/cli/v11/commands/npm-publish/) — immutable name/version, contents, access defaults and tags.

[8] npm, [Unpublish policy](https://docs.npmjs.com/policies/unpublish/) — limits, permanent version consumption, 24-hour full-unpublish delay, deprecation.

[9] GitHub, [Publishing Node.js packages](https://docs.github.com/en/actions/tutorials/publish-packages/publish-nodejs-packages) — npm versus GitHub Packages registries/permissions, explicit public access, token-based sample.

[10] GitHub, [OpenID Connect reference: workflow permissions](https://docs.github.com/en/actions/reference/security/oidc#workflow-permissions-for-the-requesting-the-oidc-token) — meaning of id-token write, contents read, reusable-workflow permissions.

[11] GitHub, [Deployments and environments](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments) — reviewers, self-review, admin bypass, branch/tag restrictions and plan/visibility limits.

[12] GitHub, [Secure use reference](https://docs.github.com/en/actions/reference/security/secure-use) — least privilege, untrusted code and dependency locking/pinning recommendations.

[13] npm CLI v11, [package.json](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/) — repository/directory metadata, `private`, `publishConfig`.

[14] npm, [About scopes](https://docs.npmjs.com/about-scopes/) and [Creating a new user account](https://docs.npmjs.com/creating-a-new-npm-user-account/) — namespace ownership, visibility and verified email.

[15] npm CLI v11, [npm stage](https://docs.npmjs.com/cli/v11/commands/npm-stage/) — stage version collisions, tag immutability, auth matrix, new-package creation, workspace contradiction. Page reports last edit 2026-09-29.

[16] npm CLI current/unversioned, [npm trust](https://docs.npmjs.com/cli/commands/npm-trust/) (resolved to v12) — also retains single-publisher wording, so the inconsistency is not only a legacy-v11 issue.

[17] npm, [Requiring 2FA for package publishing and settings modification](https://docs.npmjs.com/requiring-2fa-for-package-publishing-and-settings-modification/) — direct-publish default 2FA, package settings and August 2026 governance restriction.
