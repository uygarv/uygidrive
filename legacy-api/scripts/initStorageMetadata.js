const admin = require('firebase-admin');
const fs = require('fs');
require('dotenv').config();

function parseServiceAccount() {
  const rawValue = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!rawValue) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT is not set.');
  }

  return JSON.parse(Buffer.from(rawValue, 'base64').toString());
}

async function main() {
  const serviceAccount = parseServiceAccount();
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: 'gs://uygidrive.appspot.com',
  });

  const bucket = admin.storage().bucket();
  const [files] = await bucket.getFiles({ autoPaginate: false });

  for (const file of files) {
    if (file.name.endsWith('/')) {
      continue;
    }

    const userPrefix = file.name.split('/')[0];
    if (!userPrefix) {
      continue;
    }

    const metadataPath = `${userPrefix}/.uygidrive-storage.json`;
    const metadataFile = bucket.file(metadataPath);
    const [exists] = await metadataFile.exists();

    if (exists) {
      continue;
    }

    const payload = {
      bytesUsed: 0,
      updatedAt: new Date().toISOString(),
    };

    await metadataFile.save(Buffer.from(JSON.stringify(payload, null, 2)), {
      metadata: { contentType: 'application/json' },
    });
  }

  console.log('Storage metadata files initialized.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
