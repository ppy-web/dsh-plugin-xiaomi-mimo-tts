# Agent instructions

## Test writing rules

- Test observable behavior and repository contracts, not the exact prose of a README, translation, changelog, or UI copy.
- Documentation tests may check that required sections, local assets, links, commands, file paths, and other explicit contracts exist. They must not require incidental wording such as a particular English phrase, sentence order, or punctuation.
- If two language versions communicate the same behavior, assert the behavior with language-aware patterns or shared structure. Do not require one language to contain a phrase copied from the other.
- Do not make a test fail merely because an optional explanatory paragraph was removed or rewritten. Add a check only when the text represents a user-facing guarantee or a maintained link/path/command.
- Prefer exported functions, parsed data, DOM semantics, and runtime effects over regular expressions against generated bundles or prose. If source-text inspection is unavoidable, match the smallest stable contract and explain why in the test.
- Keep each assertion tied to the test name. When a product or documentation change intentionally removes a contract, update the test and this rule together instead of preserving stale expectations.
- Run the focused test while iterating, then run `pnpm test` before committing. Do not weaken a failing test just to make CI green; replace brittle expectations with a meaningful invariant.
