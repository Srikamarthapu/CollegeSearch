# CollegeSearch GitHub release controls — read-only check

Observed September 13, 2026 at approximately 21:22 UTC using authenticated `gh api`. Scope was only `Srikamarthapu/CollegeSearch`; no settings, branches, workflows or messages were changed.

The default branch is **main**, at `4519fc12f2eb0e13c68bb56d0fd9d199a5f13559`. GitHub returned `protected: false`; the legacy protection endpoint explicitly returned HTTP 404 **Branch not protected**. The repository ruleset listing (including parent rulesets) and effective rules for main both returned empty arrays. The current token has repository admin visibility, so these are confirmed visible configuration gaps rather than an unprivileged token's generic access error.

The weekly verification YAML exists on `codex/production-foundation`, but **is absent from main**: the main root tree has no `.github` directory, its workflow directory lookup returned 404, and the workflow lookup returned 404. The visible Actions workflow list contains only CI. GitHub's scheduled-run query returned `total_count: 0` (no currently retained scheduled run evidence). The local/branch YAML schedules Monday at 15:17 UTC, but its branch presence does not activate default-branch scheduling. GitHub documents that scheduled workflows run from the default branch and require the workflow file there. [GitHub schedule documentation](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)

Recent actual CI evidence exists: [run 34782488696](https://github.com/Srikamarthapu/CollegeSearch/actions/runs/34782488696) passed on September 13 at 21:01:47 UTC for PR branch `codex/production-foundation`, source `d056e10606db527713499bbb9a890fd15c98b592`. It is a pull_request CI run, not a scheduled live-artifact verification or proof of required-check enforcement.

Remaining concrete actions:

1. Land the reviewed CI and verification workflow files on the intended default branch through the authorized release/merge process. This is a known repository-state dependency; changing the cron expression is unnecessary.
2. Configure the intended main protection/ruleset and required CI check according to the owner's merge policy. No such enforcement was visible in this check.
3. After the verification workflow is available on the default branch, observe an actual scheduled run and retained artifact, and verify real alert receipt with the responsible operator. A manual successful run would verify job execution but still would not prove scheduler or notification delivery.

These findings replace vague “confirm configured protection/scheduling” wording with confirmed missing enforcement and an inactive default-branch schedule. They do not authorize a settings change, merge, dispatch, notification, or public release. The absence of retained scheduled runs is not a claim that no run has ever occurred.

## Read-only commands

```sh
gh api repos/Srikamarthapu/CollegeSearch --jq '{full_name,private,default_branch,archived,permissions}'
gh api repos/Srikamarthapu/CollegeSearch/branches/main --jq '{name,protected,sha:.commit.sha,protection_url}'
gh api repos/Srikamarthapu/CollegeSearch/branches/main/protection
gh api 'repos/Srikamarthapu/CollegeSearch/rulesets?includes_parents=true'
gh api repos/Srikamarthapu/CollegeSearch/rules/branches/main
gh api repos/Srikamarthapu/CollegeSearch/actions/workflows
gh api repos/Srikamarthapu/CollegeSearch/actions/workflows/live-data-verification.yml
gh api 'repos/Srikamarthapu/CollegeSearch/actions/runs?event=schedule&per_page=20'
gh api 'repos/Srikamarthapu/CollegeSearch/contents/.github/workflows?ref=main'
gh api repos/Srikamarthapu/CollegeSearch/git/trees/4519fc12f2eb0e13c68bb56d0fd9d199a5f13559
gh api 'repos/Srikamarthapu/CollegeSearch/contents/.github/workflows/live-data-verification.yml?ref=codex%2Fproduction-foundation'
gh api 'repos/Srikamarthapu/CollegeSearch/actions/runs?per_page=5'
```
