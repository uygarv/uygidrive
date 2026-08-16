import "dotenv/config";
import { loadConfig } from "../config.js";
import { createFirebaseServices } from "../plugins/firebase.js";
import { FirestoreDriveRepository } from "../repositories/firestore-drive-repository.js";
import { DriveService } from "../services/drive-service.js";
import { StorageService } from "../services/storage-service.js";

const config = loadConfig();
const firebase = createFirebaseServices(config);
const repository = new FirestoreDriveRepository(firebase.firestore, config.defaultStorageLimitBytes);
const drive = new DriveService(repository, new StorageService(firebase.bucket), config.uploadIntentTtlMinutes);
const result = await drive.purgeExpiredTrash(config.trashRetentionDays);

console.log(`Purged ${result.deletedItems} item${result.deletedItems === 1 ? "" : "s"} from Trash (checked ${result.candidates} expired root candidates).`);
