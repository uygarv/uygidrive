const DEFAULT_STORAGE_LIMIT_BYTES = 2 * 1024 * 1024 * 1024;
const STORAGE_METADATA_FILENAME = '.uygidrive-storage.json';
const storageUsageCache = new Map();
const STORAGE_USAGE_CACHE_TTL_MS = 5000;

function parseStorageExceptionIds(rawValue) {
  if (!rawValue) {
    return [];
  }

  return rawValue
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function getStorageLimitConfig(userId, env = process.env) {
  const exceptionIds = parseStorageExceptionIds(env.STORAGE_LIMIT_EXCEPTIONS);
  const isUnlimited = exceptionIds.includes(userId);

  return {
    isUnlimited,
    limitBytes: isUnlimited ? null : DEFAULT_STORAGE_LIMIT_BYTES,
    limitLabel: isUnlimited ? 'Unlimited' : '2 GB',
  };
}

function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function wouldExceedStorageLimit(currentUsageBytes, existingFileSizeBytes, projectedBytes, storageLimit) {
  if (storageLimit.isUnlimited || storageLimit.limitBytes === null) {
    return false;
  }

  const projectedUsage = currentUsageBytes - existingFileSizeBytes + projectedBytes;
  return projectedUsage >= storageLimit.limitBytes;
}

function getStorageMetadataPath(userId) {
  return `${userId}/${STORAGE_METADATA_FILENAME}`;
}

function getCachedUserStorageUsage(userId) {
  const prefix = `${userId}/`;
  const cacheKey = `${userId}:${prefix}`;
  const cachedValue = storageUsageCache.get(cacheKey);

  if (cachedValue && Date.now() - cachedValue.timestamp < STORAGE_USAGE_CACHE_TTL_MS) {
    return cachedValue.value;
  }

  return null;
}

function setUserStorageUsageCache(userId, value) {
  const prefix = `${userId}/`;
  const cacheKey = `${userId}:${prefix}`;
  storageUsageCache.set(cacheKey, { timestamp: Date.now(), value });
}

function invalidateUserStorageUsageCache(userId) {
  const prefix = `${userId}/`;
  const cacheKey = `${userId}:${prefix}`;
  storageUsageCache.delete(cacheKey);
}

async function getUserStorageUsageFromFiles(bucket, userId) {
  const prefix = `${userId}/`;
  const [files] = await bucket.getFiles({ prefix, autoPaginate: false });

  let totalBytes = 0;

  for (const file of files) {
    if (file.name === `${prefix}${STORAGE_METADATA_FILENAME}` || file.name.endsWith('/')) {
      continue;
    }

    totalBytes += Number(file.metadata?.size || 0);
  }

  return totalBytes;
}

async function readUserStorageUsageFromMetadata(bucket, userId) {
  const metadataFile = bucket.file(getStorageMetadataPath(userId));
  const [exists] = await metadataFile.exists();

  if (!exists) {
    return 0;
  }

  try {
    const [buffer] = await metadataFile.download();
    const payload = JSON.parse(buffer.toString('utf8'));

    return Number(payload.bytesUsed || 0);
  } catch (error) {
    console.error('Failed to read storage usage metadata:', error.message);
    return 0;
  }
}

async function writeUserStorageUsage(bucket, userId, bytesUsed) {
  const metadataFile = bucket.file(getStorageMetadataPath(userId));
  const payload = {
    bytesUsed: Math.max(0, Number(bytesUsed) || 0),
    updatedAt: new Date().toISOString(),
  };

  await metadataFile.save(Buffer.from(JSON.stringify(payload, null, 2)), {
    metadata: { contentType: 'application/json' },
  });

  setUserStorageUsageCache(userId, payload.bytesUsed);
  return payload.bytesUsed;
}

async function updateUserStorageUsage(bucket, userId, deltaBytes) {
  const currentUsage = await getUserStorageUsage(bucket, userId);
  const nextUsage = Math.max(0, currentUsage + deltaBytes);
  return writeUserStorageUsage(bucket, userId, nextUsage);
}

async function getUserStorageUsage(bucket, userId) {
  const cachedValue = getCachedUserStorageUsage(userId);
  if (cachedValue !== null) {
    return cachedValue;
  }

  const isUnlimited = getStorageLimitConfig(userId).isUnlimited;
  if (isUnlimited) {
    setUserStorageUsageCache(userId, 0);
    return 0;
  }

  const usageFromFiles = await getUserStorageUsageFromFiles(bucket, userId);
  const usageFromMetadata = await readUserStorageUsageFromMetadata(bucket, userId);
  const effectiveUsage = Math.max(usageFromFiles, usageFromMetadata);

  setUserStorageUsageCache(userId, effectiveUsage);
  return effectiveUsage;
}

module.exports = {
  DEFAULT_STORAGE_LIMIT_BYTES,
  STORAGE_METADATA_FILENAME,
  parseStorageExceptionIds,
  getStorageLimitConfig,
  formatBytes,
  getStorageMetadataPath,
  getUserStorageUsage,
  getUserStorageUsageFromFiles,
  writeUserStorageUsage,
  updateUserStorageUsage,
  getCachedUserStorageUsage,
  setUserStorageUsageCache,
  invalidateUserStorageUsageCache,
  wouldExceedStorageLimit,
};
