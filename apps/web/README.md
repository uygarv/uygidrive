# UygiDrive web

Next.js 16 product frontend for UygiDrive. It uses shadcn/ui, Tailwind v4, Motion, and a single API adapter at `src/lib/drive-api.js`.

## Local development

1. Copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_API_BASE_URL=http://localhost:4000`.
2. Start the Fastify API from `../api` first.
3. Run `npm run dev` and open `http://localhost:3000`.

The browser only talks to Fastify. Do not add Firebase browser SDK configuration or direct Firebase calls here.

```bash
npm run lint
npm run test
npm run build
```

Canonical share routes are `/p/:publicId` and `/s/:token`. The legacy path-based public routes remain only for the temporary migration window.
