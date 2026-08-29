# Contributing

Use Node.js 22 or later. The supported code lives in `apps/web` and `apps/api`.

Before opening a pull request, keep changes focused and run the checks for every app you touch:

```bash
cd apps/api && npm run typecheck && npm run test && npm run build
cd apps/web && npm run lint && npm run test && npm run build
```