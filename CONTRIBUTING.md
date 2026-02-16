# Contributing

## Setup

```bash
npm install
npm run check
```

## Branching

- Create a feature branch from `main`
- Keep pull requests focused and small
- Include docs updates for behavior/API changes

## Pull Request Requirements

- Clear summary of problem and solution
- Backward compatibility impact (if any)
- Example request/response for API changes
- Updated `README.md` or `docs/` when relevant
- `npm run check` passes

## Adding a New Agent

1. Add implementation under `src/agents/`.
2. Add input schema in `src/schemas.js`.
3. Register routing in `src/engine.js`.
4. Add endpoint example in `README.md`.

## Adding a New Adapter

1. Implement adapter in `src/adapters/`.
2. Register it in `src/adapters/registry.js`.
3. Add adapter usage docs in `docs/ADAPTER_SDK.md`.

## Commit Style

Use clear, imperative commit messages, e.g.:

- `add deployment readiness scoring`
- `wire spec_analysis into engine and schemas`

