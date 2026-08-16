import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import type { AppConfig } from "../config.js";

export type FirebaseServices = {
  auth: Auth;
  firestore: Firestore;
  bucket: ReturnType<ReturnType<typeof getStorage>["bucket"]>;
};

export function createFirebaseServices(config: AppConfig): FirebaseServices {
  const app = getApps()[0] ?? initializeApp({
    credential: cert(config.firebaseServiceAccount),
    storageBucket: config.firebaseStorageBucket,
  });

  return {
    auth: getAuth(app),
    firestore: getFirestore(app),
    bucket: getStorage(app).bucket(config.firebaseStorageBucket),
  };
}
