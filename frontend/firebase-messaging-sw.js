
importScripts(
    'https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js'
);

importScripts(
    'https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js'
);

const firebaseConfig = {
    apiKey: 'TU_API_KEY',
    authDomain: 'TU_AUTH_DOMAIN',
    projectId: 'TU_PROJECT_ID',
    storageBucket: 'TU_STORAGE_BUCKET',
    messagingSenderId: 'TU_MESSAGING_SENDER_ID',
    appId: 'TU_APP_ID'
};

firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
    console.log('Notificación recibida en segundo plano:', payload);

    // Firebase muestra automáticamente las notificaciones
    // que incluyen el campo notification.
    // Evitamos mostrarlas dos veces.
    if (payload.notification) {
        return;
    }

    const titulo = payload.data?.title ||
        'Memoric - Recordatorio de medicación';

    const opciones = {
        body: payload.data?.body ||
            'Es hora de tomar tu medicamento.',
        icon: '/favicon.ico',
        data: {
            url: '/index.html'
        }
    };

    self.registration.showNotification(titulo, opciones);
});

self.addEventListener('notificationclick', (evento) => {
    evento.notification.close();

    const url = new URL(
        evento.notification.data?.url || '/index.html',
        self.location.origin
    );

    if (url.origin !== self.location.origin) {
        return;
    }

    evento.waitUntil(
        (async () => {
            const ventanas = await clients.matchAll({
                type: 'window',
                includeUncontrolled: true
            });

            for (const ventana of ventanas) {
                if (ventana.url.startsWith(self.location.origin)) {
                    await ventana.focus();
                    return;
                }
            }

            await clients.openWindow(url.href);
        })()
    );
});
