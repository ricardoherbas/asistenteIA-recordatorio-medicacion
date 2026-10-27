
importScripts(
    'https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js'
);

importScripts(
    'https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js'
);

const firebaseConfig = {
    apiKey: 'AIzaSyABePfAYG4-mzbtiAbhjpNKtNr7FwV9vU0',
    authDomain: 'asistenteia-recmedicacion.firebaseapp.com',
    projectId: 'asistenteia-recmedicacion',
    storageBucket: 'asistenteia-recmedicacion.firebasestorage.app',
    messagingSenderId: '13628763678',
    appId: '1:13628763678:web:316a9708f7638f575e880f',
    measurementId: 'G-3HHE66356D'
};

firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

console.log('[MEMORIC PUSH] Service Worker de Firebase inicializado.');

messaging.onBackgroundMessage((payload) => {
    console.log(
        '[MEMORIC PUSH] Notificación recibida en segundo plano:',
        payload
    );

    // Firebase muestra automáticamente las notificaciones
    // que incluyen el campo notification.
    // Evitamos mostrarlas dos veces.
    if (payload.notification) {
        console.log(
            '[MEMORIC PUSH] Notificación gestionada por Firebase.'
        );
        return;
    }

    // Para mensajes que contienen únicamente datos,
    // mostramos la notificación manualmente.
    const titulo = payload.data?.title ||
        'Memoric - Recordatorio de medicación';

    const opciones = {
        body: payload.data?.body ||
            'Es hora de tomar tu medicamento.',
        tag: payload.data?.envioId
            ? `memoric-${payload.data.envioId}`
            : 'memoric-recordatorio',
        data: {
            url: '/index.html'
        }
    };

    return self.registration.showNotification(titulo, opciones);
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
