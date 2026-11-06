# Changesets

Every change to a published `@tijori/*` package needs a changeset. In `sdk/`, run `npx changeset`, pick the
bump (0.x: minor = breaking, patch = fixes and features) and describe the change for the changelog.
All `@tijori/*` packages are versioned together (`fixed`). Releases are published from `sdk/` (`npm run release`,
or the Release workflow with `NPM_TOKEN`). The Tijori app at the repository root picks them up with
`npm update @tijori/server @tijori/client @tijori/react`. See ../../docs/SDK.md → "Upgrading".
