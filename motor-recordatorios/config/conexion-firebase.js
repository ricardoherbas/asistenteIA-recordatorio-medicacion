const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getMessaging } = require('firebase-admin/messaging');

const credenciales = require(process.env.FIREBASE_CREDENTIALS_PATH);

if (getApps().length === 0) {
    initializeApp({
        credential: cert(credenciales)
    });
}

module.exports = getMessaging();