# Researched tools, repos, and why we selected them

## Recommended — use now
1. **OpenAI Codex + VS Code** — primary implementation agent. Use this repo's `AGENTS.md` and role files; see https://learn.chatgpt.com/docs/agent-configuration/subagents and https://learn.chatgpt.com/docs/build-skills .
2. **OpenAI Build Web Apps plugin** — optional approved add-on for frontend app construction, testing/debugging and React guidance: https://github.com/openai/plugins/tree/main/plugins/build-web-apps . Check plugin availability in Codex; do not clone whole repo.
3. **fflate** — small, capable ZIP read/write library, streaming APIs: https://github.com/101arrowz/fflate . Use safe hard limits with hostile archives.
4. **Vitest** — fast TypeScript unit/integration tests: https://github.com/vitest-dev/vitest .
5. **Playwright** — browser E2E and mobile emulator testing: https://github.com/microsoft/playwright .
6. **Google Cloud Run samples** — official deployment references (do not clone into submission): https://github.com/GoogleCloudPlatform/cloud-run-samples .

## Nice-to-have if time permits
7. **axe-core** — automated accessibility lint/testing supplement: https://github.com/dequelabs/axe-core .
8. **Lighthouse** — audit accessibility, performance and best practices: https://github.com/GoogleChrome/lighthouse .
9. **CodeRabbit VS Code** — optional second-opinion review; privacy and permissions should be considered before granting project access: https://marketplace.visualstudio.com/items?itemName=CodeRabbit.coderabbit-vscode .
10. **Gemini official SDK** `@google/genai` — stretch feature for smart metadata categorization after MVP, with backend proxy / secret management, opt-in and billing: https://ai.google.dev/gemini-api/docs/libraries . Never embed API keys in browser.

## Avoid during a one-day hackathon
- Copying other people's full game repositories, projects or images without license review.
- Cloning the entire OpenAI plugins repository or Cloud Run samples into submission.
- Medusa/Next.js storefront, PostgreSQL, Redis, auth, Firebase, agents that redundantly edit each other's files.
- Installing many MCP servers or AI assistants simultaneously; tool conflicts, onboarding and privacy overhead hurt delivery.
- Treating a CodeRabbit or AI review as stronger evidence than real tests.

## Agent ownership guideline
Main Codex agent integrates code and root configs. `chore_builder` owns organizer module, `game_builder` owns gameplay module. QA, security, Cloud Run auditors are read-only by instruction. Parallelize only when no shared file overlap.

## Crediting open source
Use npm packages via their package managers, retain license notices where required; do not silently copy upstream example code verbatim. Never commit node_modules or huge binary game assets.
