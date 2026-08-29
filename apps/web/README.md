# Drive web

Next.js 16 product frontend for the drive API. It uses shadcn/ui, Tailwind v4, Motion, and a single API adapter at `src/lib/drive-api.js`.

## Local development

1. Copy `.env.example` to `.env.local`, set the API and public web origins, and align `NEXT_PUBLIC_SESSION_COOKIE_NAME` with the API configuration.
2. Start the Fastify API from `../api` first.
3. Run `npm run dev` and open `http://localhost:3000`.


```bash
npm run dev:demo
npm run lint
npm run test
npm run build
```