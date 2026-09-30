# Repository Guidelines

## Project Structure & Module Organization

This repository publishes `dsh-xiaomi-tts`, a DSH Web speech plugin.

- `src/index.ts` implements host routes and configuration; `src/shared.ts` holds shared settings and text preparation.
- `src/client/` contains React settings, conversation actions, playback controllers, sound effects, and CSS. `src/client-api.ts` exposes client contracts.
- `preview/` provides the standalone Vite UI preview; `assets/` contains images and audio.
- `locale/` contains English and Chinese translations; `skills/` contains bundled agent presets.
- `test/` contains regression tests and fixtures; `scripts/` handles packaging and profile verification.
- `cordis.patch.yml` defines the DSH bundle. `lib/` and `.preview-dist/` are generated outputs; edit their sources.

## Build, Test, and Development Commands

Use Node.js 22+ and pnpm; CI uses Node.js 24 and pnpm 11.22.0.

- `pnpm install --frozen-lockfile`: install locked dependencies.
- `pnpm dev`: launch the standalone settings preview.
- `pnpm dev:build`: typecheck and build the preview.
- `pnpm build`: bundle the plugin and emit TypeScript declarations.
- `pnpm typecheck`: check source types without emitting files.
- `pnpm test`: build, then run `test/*.test.mjs`.
- `pnpm profile:check`: verify an installed DSH profile; set `DSH_HOME`, `DSH_PROFILE`, and `DSH_WEB_PORT`.
- `pnpm pack --dry-run`: inspect publishable package contents.

## Coding Style & Naming Conventions

Follow existing two-space indentation, single quotes, and omitted semicolons. Use strict TypeScript, explicit type imports, and `.js` extensions for relative module imports. Use kebab-case filenames, PascalCase React components and types, camelCase functions, and uppercase constants. No formatter or lint script is configured.

Keep registrations scoped to the Cordis context, declare required services through `inject`, and validate configuration with Schemastery. Update both locale files for new UI strings.

## Testing Guidelines

Tests use `node:test` and `node:assert/strict`; name files `<feature>.test.mjs`. No numeric coverage threshold is configured. Cover changed behavior, including cancellation, fallback, and cleanup when relevant. Run focused tests after building, then `pnpm test` before committing.

Assert observable behavior and stable contracts, not exact README prose, translation wording, or incidental generated code. Documentation checks should validate maintained links, paths, commands, or guarantees. Replace brittle expectations with meaningful invariants; never weaken tests merely to pass CI.

Do not write “傻逼断言”: never assert optional metadata, removed features, exact copy, or internal implementation details merely because they are easy to match. If a test fails after an intentional product change, delete or rewrite the stale assertion around the behavior that still matters instead of restoring dead compatibility just to satisfy the test.

## Commit & Pull Request Guidelines

History uses prefixes such as `feat:`, `fix:`, `chore(deps-dev):`, and `release:`; keep subjects concise.

PRs should explain the changed behavior, link relevant issues, and report validation. Include screenshots for settings or preview changes. Keep `README.md` and `README.en.md` aligned, and verify preview builds and package contents when affected. Never commit API keys or local profile credentials.
