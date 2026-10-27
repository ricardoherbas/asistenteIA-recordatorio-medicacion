
const { getMessaging } = require('firebase-admin/messaging');

async function enviarPush(token, mensaje) {
    const notificacion = {
        token,
        notification: {
            title: 'Memoric - Recordatorio de medicación',
            body: mensaje
        }
    };

    if (process.env.FRONTEND_URL) {
        notificacion.webpush = {
            fcmOptions: {
                link: `${process.env.FRONTEND_URL.replace(/\/$/, '')}/index.html`
            }
        };
    }

    return getMessaging().send(notificacion);
}

module.exports = {
    enviarPush
};
