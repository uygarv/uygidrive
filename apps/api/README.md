# UygiDrive API

Fastify 5 / TypeScript API for the Next.js frontend. It is the sole boundary between the browser and Firebase.

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

## Legacy migration

`npm run migrate:legacy` is a dry run. It inventories the existing bucket, excludes `.uygidrive-storage.json`, derives explicit folder/node records, carries public Storage metadata into Firestore shares, and prints counts. Take a Firestore export and reconcile the totals before running:

```bash
npm run migrate:legacy -- --apply
```

The script creates only missing documents. It never overwrites existing Firestore records.

`LEGACY_SHARE_TOKEN_SECRET` is temporary. Set it to the legacy `TOKEN_SECRET` only during the compatibility window for existing JWT private URLs, then remove it.

## Trash retention

Deleting an item moves it to Trash. It stays recoverable for `TRASH_RETENTION_DAYS` (30 by default); restoring a folder also restores its contents. The same daily job purges expired Trash items and cancels expired resumable uploads so their quota reservations are released. Either run the CLI from a trusted scheduler:

```bash
npm run purge:trash
```

or configure the scheduler to `POST /internal/maintenance/purge-trash` with `Authorization: Bearer <MAINTENANCE_TOKEN>`. The endpoint is unavailable until `MAINTENANCE_TOKEN` is configured.
