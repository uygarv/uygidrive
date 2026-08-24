# UygiDrive API

Fastify 5 / TypeScript API for the Next.js frontend.

## Local development

1. Copy `.env.example` to `.env` and set the Firebase service account, Storage bucket, Firebase Web API key, and `WEB_ORIGIN=http://localhost:3000`.
2. Deploy the supplied Firebase rules and Firestore indexes before exposing the service.
3. Run the API:

```bash
npm run dev
```

Run checks with:

```bash
npm run typecheck
npm run test
npm run build
```

Native thumbnail generation is disabled by default (`ENABLE_NATIVE_PREVIEWS=false`), while thumbnails already stored in Firebase Storage remain available. This avoids known local macOS crashes in Skia/libvips. Enable it only after validating the native image/PDF stack in the target environment.

## Send to device / Cloudflare TURN

Device-to-device transfers require Cloudflare Realtime TURN. Create a distinct TURN key for each environment and configure `CLOUDFLARE_TURN_KEY_ID` plus its credential-generation token as Cloud Run secrets. The API generates an 8-hour, per-transfer ICE configuration and never exposes the long-lived Cloudflare key to browsers. Monitor TURN egress and set billing alerts in Cloudflare before enabling this in production.

## Cloud Run large downloads

For production proxy downloads above 32 MiB, enable Cloud Run HTTP/2 and the
matching h2c server mode together:

```bash
gcloud run services update uygidrive-api \
  --project=uygidrive \
  --region=europe-west1 \
  --use-http2 \
  --set-env-vars=ENABLE_HTTP2=true
```

Keep `ENABLE_HTTP2=false` for local HTTP/1 development. Do not enable one
without the other.

## Trash retention

Deleting an item moves it to Trash. It stays recoverable for `TRASH_RETENTION_DAYS` (30 by default); restoring a folder also restores its contents. The same daily job purges expired Trash items and cancels expired resumable uploads so their quota reservations are released. Either run the CLI from a trusted scheduler:

```bash
npm run purge:trash
```

or configure the scheduler to `POST /internal/maintenance/purge-trash` with `Authorization: Bearer <MAINTENANCE_TOKEN>`. The endpoint is unavailable until `MAINTENANCE_TOKEN` is configured.
