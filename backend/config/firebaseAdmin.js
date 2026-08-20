const { getApps, initializeApp, cert } = require("firebase-admin/app");
const { getMessaging } = require("firebase-admin/messaging");

const fs = require("fs");
const path = require("path");

const folderPath = path.join(__dirname, "../secretAssets");
const filePath = path.join(folderPath, "serviceAccountKey.json");

if (!fs.existsSync(filePath)) {
  throw new Error(`Firebase service account file not found: ${filePath}`);
}

const serviceAccount = require(filePath);

if (
  !serviceAccount.project_id ||
  !serviceAccount.client_email ||
  !serviceAccount.private_key
) {
  throw new Error("Invalid Firebase serviceAccountKey.json");
}

// Get existing Firebase app or initialize it
const app =
  getApps().length > 0
    ? getApps()[0]
    : initializeApp({
        credential: cert(serviceAccount),
        databaseURL: "https://coachcritic-50810.firebaseio.com",
      });

// Get Firebase Cloud Messaging instance
const messaging = getMessaging(app);

module.exports = {
  app,
  messaging,
};
