# Drive

File drive for storing, collaborating and sharing files powered by Firebase. The supported application is a Next.js web client backed by a Fastify API. 
The `legacy-api` and `legacy-views` directories are retained only as an unsupported migration reference.

## Quick demo

Requires Node.js 22 or later.

```bash
git clone <your-fork-url>
cd <repo-directory>/apps/web
npm ci
npm run dev:demo
```

Open [http://localhost:3000](http://localhost:3000). Demo mode uses mock data and does not need Firebase.

To open the development server from another device on your LAN, add its host/IP to `apps/web/.env.local` before starting Next.js, then restart the server:

```bash
NEXT_ALLOWED_DEV_ORIGINS=192.168.68.118
```

Use comma-separated hostnames for multiple origins. Do not include `http://` or a port.

## Setup checklist

### 1. Create your Firebase project

- Create a Firebase project and enable **Email/Password** under Authentication.
- Create a Firestore database and a Firebase Storage bucket.
- Create a service account with access to that Firebase project, then base64-encode its JSON credentials for `FIREBASE_SERVICE_ACCOUNT`.
- Copy the Firebase Web API key from the project settings.

### 2. Configure the API

```bash
cp apps/api/.env.example apps/api/.env
```

Set these required values in `apps/api/.env`:

| Variable | Set it to |
| --- | --- |
| `FIREBASE_SERVICE_ACCOUNT` | Base64 encoded service account JSON, or the raw JSON object. |
| `FIREBASE_STORAGE_BUCKET` | The exact bucket name shown in Firebase Storage. |
| `FIREBASE_WEB_API_KEY` | Your Firebase project’s Web API key. |
| `WEB_ORIGIN` | The web application origin, such as `http://localhost:3000` or `https://drive.example.com`. |

For production, also set `NODE_ENV=production`. Set `COOKIE_DOMAIN=.example.com` only when the web and API run on sibling subdomains such as `drive.example.com` and `api.example.com`. Otherwise leave it blank. Set a random 32+ character `MAINTENANCE_TOKEN` if you will call the maintenance endpoint from a scheduler. Cloudflare TURN variables are optional and only enable device-to-device transfers.

### 3. Configure the web app

```bash
cp apps/web/.env.example apps/web/.env.local
```

Set these values in `apps/web/.env.local`:

| Variable | Set it to |
| --- | --- |
| `NEXT_PUBLIC_API_BASE_URL` | API origin, such as `http://localhost:4000` or `https://api.example.com`. |
| `NEXT_PUBLIC_WEB_BASE_URL` | Public web origin, such as `http://localhost:3000` or `https://drive.example.com`. |
| `NEXT_PUBLIC_SESSION_COOKIE_NAME` | The same value as API `SESSION_COOKIE_NAME`; leave the default for a new install unless you intentionally rename it. |
| `NEXT_PUBLIC_MOCK_DRIVE` | `false` for the real stack; `true` only for the local demo. |

### 4. Apply Firebase access controls

Deploy the included Firestore and Storage rules and indexes before running the API:

```bash
npx firebase-tools@latest --project YOUR_PROJECT_ID deploy --config apps/api/firebase.json
```

### 5. Start the app

```bash
cd apps/api && npm ci && npm run dev
cd apps/web && npm ci && npm run dev
```

## Branding

Edit [apps/web/src/config/brand.js](apps/web/src/config/brand.js) to set the product name, descriptions, logo path, etc. Replace [apps/web/public/brand-logo.svg](apps/web/public/brand-logo.svg) with your logo. Keep the namespace stable after users have started using the application because it scopes browser preferences and device transfer channels.

## Deployment notes

Set `NEXT_PUBLIC_API_BASE_URL` and `NEXT_PUBLIC_WEB_BASE_URL` to your public origins.
Configure the authenticated maintenance endpoint or `npm run purge:trash` as a trusted scheduled job to purge expired Trash items and abandoned uploads.

## Contributing and security

Contributions are welcomed. See [CONTRIBUTING.md](CONTRIBUTING.md). Report vulnerabilities privately through GitHub’s private vulnerability-reporting feature; see [SECURITY.md](SECURITY.md). The project is licensed under Apache-2.0; see [LICENSE](LICENSE).
