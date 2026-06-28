# Changesets

This folder is managed by [changesets](https://github.com/changesets/changesets).
It versions and publishes the one public package in this monorepo: **`theialang`**
(the engine packages and the web app are `private` and never published).

To record a change for the next release:

```bash
npx changeset            # describe the change + pick a semver bump
```

Commit the generated markdown file in this folder alongside your change. When a
release is cut, `changeset version` consumes these files to bump the version and
write `CHANGELOG.md`, and `changeset publish` pushes to npm (see `RELEASE.md`).
