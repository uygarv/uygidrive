const test = require('node:test');
const assert = require('node:assert/strict');
const { getStorageLimitConfig, parseStorageExceptionIds, setUserStorageUsageCache, getCachedUserStorageUsage, invalidateUserStorageUsageCache, wouldExceedStorageLimit, getUserStorageUsageFromFiles } = require('./storageQuota');

test('parses storage exception ids from env', () => {
  assert.deepEqual(parseStorageExceptionIds('uid-1, uid-2 ,uid-3'), ['uid-1', 'uid-2', 'uid-3']);
  assert.deepEqual(parseStorageExceptionIds(''), []);
});

test('marks exception users as unlimited and others as limited', () => {
  assert.equal(getStorageLimitConfig('uid-1', { STORAGE_LIMIT_EXCEPTIONS: 'uid-1,uid-2' }).isUnlimited, true);
  assert.equal(getStorageLimitConfig('uid-3', { STORAGE_LIMIT_EXCEPTIONS: 'uid-1,uid-2' }).isUnlimited, false);
  assert.equal(getStorageLimitConfig('uid-3', { STORAGE_LIMIT_EXCEPTIONS: 'uid-1,uid-2' }).limitBytes, 2 * 1024 * 1024 * 1024);
});

test('stores and invalidates cached storage usage values', () => {
  setUserStorageUsageCache('uid-test', 1024);
  assert.equal(getCachedUserStorageUsage('uid-test'), 1024);
  invalidateUserStorageUsageCache('uid-test');
  assert.equal(getCachedUserStorageUsage('uid-test'), null);
});

test('flags uploads that would exceed the configured storage limit', () => {
  const storageLimit = getStorageLimitConfig('uid-3', { STORAGE_LIMIT_EXCEPTIONS: '' });
  assert.equal(wouldExceedStorageLimit(1 * 1024 * 1024 * 1024, 0, 0.5 * 1024 * 1024 * 1024, storageLimit), false);
  assert.equal(wouldExceedStorageLimit(1.5 * 1024 * 1024 * 1024, 0, 1 * 1024 * 1024 * 1024, storageLimit), true);
  assert.equal(wouldExceedStorageLimit(2 * 1024 * 1024 * 1024, 0, 1, storageLimit), true);
});

test('calculates storage usage from the user files in storage', async () => {
  const fakeBucket = {
    getFiles: async ({ prefix }) => {
      assert.equal(prefix, 'uid-test/');
      return [[
        { name: 'uid-test/file-a.bin', metadata: { size: '100' } },
        { name: 'uid-test/folder/', metadata: { size: '0' } },
        { name: 'uid-test/.uygidrive-storage.json', metadata: { size: '50' } },
      ]];
    },
  };

  assert.equal(await getUserStorageUsageFromFiles(fakeBucket, 'uid-test'), 100);
});
