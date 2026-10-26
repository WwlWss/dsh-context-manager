# M7D P0 — reproducible packed Web Profile dependency graph

## Failure and authority boundaries

PR #35 passed exact-head 82/82 checks in Actions #38429628095, but the unchanged Git Tree and identical packed tgz SHA-256 failed the Profile graph check in all five lanes of main push #38558168201. The reviewed DSH CLI dependency graphs were already frozen; independent Web Profiles were still initialized and modified using dynamic `dsh plugin add`, which re-resolved a semver dependency (`zod: ^4.4.3`). This is a test-install reproducibility failure, not evidence of a production Profile/Remote regression.

A targeted PR #36 diagnostic (Actions #38639313715) used two fresh Profiles on Ubuntu 0.1.5 and 0.1.6 and Windows 0.1.5. All observed `zod@4.6.7`, with dependency-level structure stable within each OS/version; Windows showed additional randomly named Profile importer paths. Historical exact package-level difference remains unproven because the earlier successful artifacts retained only hashes, not sanitized Lockfile content.

## Reviewed native Profile baseline

The P0 template `tests/m7d/profile-locks/pnpm-lock.template.yaml` was generated once on pinned pnpm 11.7.0 by a disposable real DSH 0.1.6 Web Profile, through public `dsh plugin --profile web add file:vendor/<candidate>.tgz`. It fixes `zod@4.6.7` with integrity and preserves candidate metadata, dependency edges and peer context. Its candidate SHA-512 field is the **only** dynamic candidate-content placeholder. An independently reviewed `external-graph-baseline.json` covers the canonicalized full external graph, not the packed bytes.

The real qualifying Web Profile:
1. Creates only a disposable new `DSH_HOME`; leaves user Profiles untouched.
2. Copies the exact package-job tgz to the Profile-owned `vendor/` path and verifies its SHA-256 and SHA-512.
3. Renders the approved v9 lock, replacing only the verified candidate integrity marker, then verifies the full external graph hash.
4. Extends the disposable Profile's public `package.json` Bundle roster (so predeclaring its dependency does not bypass the native activation contract).
5. Runs public `dsh plugin --profile web install --frozen-lockfile --ignore-scripts`, checks unchanged lock text, actual installed package and Bundle metadata, and launches the real DSH Host.
6. Verifies the original M7D browser/Remote/Plugin HMR scenarios, including the native 0.1.6 pending-RPC lifetime proof.

A **separate** disposable Profile still runs unmodified public `dsh plugin add <verified candidate>` as a compatibility control. A successful frozen install is not misrepresented as proof that dynamic native add itself is frozen.

## Security and failure semantics

An unapproved external version/integrity/peer edge, a different candidate locator, missing Bundle activation or a changed installed Lockfile **must fail**. The candidate integrity is checked against actual tarball bytes before canonicalization; no external integrity is replaced or ignored. Audit summaries are field-limited and redact raw registry URLs, credentials and local paths. Never update a graph hash just because CI reports a new hash. Do not add temporary install hooks to `src/`.

## Qualification gate

Run frozen parser tests, two freshly created Profile installations each on Linux and Windows, native add smoke for every retained DSH version, all five packed Chromium combinations, and strict full-qualification job aggregation. Verify exact PR HEAD artifacts and repeat after merge in independent main push CI. PR-only green without post-merge green is not closeout evidence.
