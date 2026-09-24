import { Firestore } from "@google-cloud/firestore";

let firestore;

export function getFirestore() {
  if (!firestore) {
    firestore = new Firestore();
  }
  return firestore;
}
