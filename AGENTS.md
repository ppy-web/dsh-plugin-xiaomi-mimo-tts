# Repository Guidelines

## Project Structure & Module Organization

This repository publishes `dsh-xiaomi-tts`, a DSH Web speech plugin.

- `src/index.ts` implements host routes and configuration; `src/shared.ts` holds shared settings and text preparation.
- `src/client/` contains React settings, conversation actions, playback controllers, sound effects, and CSS. `src/client/settings/` also owns the independent Voice reading section registered through the host's `settings.section` slot (`voice-reading-section.tsx`) and its nav glyph patch (`nav-icon.ts`). `src/client-api.ts` exposes client contracts.
- `tools/preview/` provides the standalone Vite UI preview; `assets/` contains images and audio.
- `locale/` contains English and Chinese translations; `skills/` contains bundled agent presets.
- `test/` contains regression tests and fixtures; `tools/scripts/` handles packaging and profile verification, and `tools/start/` contains Windows launch helpers.
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

### Assertion scope and maintenance

- Keep assertions that protect a concrete user outcome or stable external contract: playable audio, correct provider and credentials, settings persistence and isolation, protocol compatibility, permission checks, cancellation, fallback, cleanup, and preventing duplicate delivery. Exact bytes, values, or call counts are appropriate when that contract requires them.
- Before adding or retaining an assertion, identify the real regression it would catch. If changing wording, reorganizing source, adding an optional field, or adjusting presentation would fail the test without breaking behavior, remove the assertion or rewrite it against the behavior. Do not target an assertion count or preserve duplicate checks just to keep coverage numbers.
- Do not snapshot source text, JSX spelling/order, helper names, CSS declarations, spacing, colors, dimensions, SVG paths, dependency source, or generated bundle text. Exercise the exported API, rendered control semantics, real requests, registration lifecycle, or temporary filesystem instead. Pure appearance belongs in browser review, not regex tests over source.
- Documentation tests validate links and commands that are actually present. Do not require a README section, internal source path, keyword, exact sentence, or translation wording. Do not require removed symbols or dependencies to remain absent unless a current security or compatibility contract specifically requires it.
- Validate required runtime resources and fields, not optional descriptions, historical image dimensions/byte counts, a specific preset name, a fixed catalog size, or an exact directory listing. Adding unused assets or metadata must not break unrelated tests. Parse JSON/YAML and URLs structurally instead of matching their formatting or query parameter order.
- Assert stable error codes or error classes rather than explanatory error prose when available. Preserve negative-path tests for rejected input, secret leakage, cross-origin access, restricted sends, aborts, and cleanup; never replace them with a bare success check to make CI pass.
- When deleting a brittle test that was the only coverage of a critical behavior, replace it with a focused behavior test. Use isolated temporary data for destructive-script tests and verify unrelated files, linked sources, and other profiles survive. Run the changed test files, then the full suite, and report actual failures without changing product behavior to satisfy stale expectations.

## Documentation Maintenance

- `handbook.md` is the user manual. Add new configuration details, feature instructions, and detailed usage guidance there.
- Only edit `README.md` when the user explicitly requests a README change, and limit edits to the requested scope. Do not expand it when adding features or configuration options.
- `intro.md` is the host-facing plugin detail document, declared through `meta.detail` in both locale files. Keep it and any referenced assets in the published package.

## Commit & Pull Request Guidelines

History uses prefixes such as `feat:`, `fix:`, `chore(deps-dev):`, and `release:`; keep subjects concise.

For version preparation, Git tags, and GitHub Releases, use the project skill at [`.agents/skills/dsh-xiaomi-release/SKILL.md`](.agents/skills/dsh-xiaomi-release/SKILL.md).

PRs should explain the changed behavior, link relevant issues, and report validation. Include screenshots for settings or preview changes. Keep `handbook.md` current for user-facing behavior changes, and verify preview builds and package contents when affected. Never commit API keys or local profile credentials.
