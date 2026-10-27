
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
    getMessaging,
    getToken,
    onMessage,
    isSupported
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging.js';

import { firebaseConfig, vapidKey } from './firebase-config.js';

const CLAVE_PERSONA = 'personaAsistenteMedicacion';

const elementos = {
    seccion: document.getElementById('seccion-notificaciones'),
    boton: document.getElementById('activar-notificaciones'),
    mensaje: document.getElementById('mensaje-notificaciones')
};

let messaging = null;
let activando = false;

function mostrarMensaje(texto, tipo = 'exito') {
    elementos.mensaje.textContent = texto;
    elementos.mensaje.hidden = !texto;

    elementos.mensaje.classList.toggle(
        'mensaje--exito',
        tipo === 'exito'
    );

    elementos.mensaje.classList.toggle(
        'mensaje--error',
        tipo === 'error'
    );
}

function obtenerUsuarioId() {
    try {
        const datos = JSON.parse(
            localStorage.getItem(CLAVE_PERSONA)
        );

        const usuarioId = Number(datos?.id);

        if (!Number.isSafeInteger(usuarioId) || usuarioId <= 0) {
            return null;
        }

        return usuarioId;
    } catch {
        return null;
    }
}

function actualizarSeccion() {
    elementos.seccion.hidden = !obtenerUsuarioId();
}

async function inicializarFirebase() {
    const compatible = await isSupported();

    if (!compatible) {
        throw new Error(
            'Este navegador no admite notificaciones push de Firebase.'
        );
    }

    const app = initializeApp(firebaseConfig);
    messaging = getMessaging(app);

    onMessage(messaging, (payload) => {
        const titulo = payload.notification?.title ||
            'Memoric - Recordatorio de medicación';

        const mensaje = payload.notification?.body ||
            'Tenés un recordatorio de medicación.';

        mostrarMensaje(`${titulo}: ${mensaje}`);

        if (Notification.permission === 'granted') {
            navigator.serviceWorker.ready.then((registro) => {
                registro.showNotification(titulo, {
                    body: mensaje,
                    icon: '/favicon.ico',
                    data: {
                        url: '/index.html'
                    }
                });
            }).catch(console.error);
        }
    });
}

async function registrarToken(token, usuarioId) {
    const respuesta = await window.API.post(
        '/api/dispositivos/token',
        {
            usuarioId,
            token
        }
    );

    if (!respuesta?.ok) {
        throw new Error(
            respuesta?.mensaje ||
            'No se pudo registrar el dispositivo.'
        );
    }
}

async function activarNotificaciones() {
    if (activando) return;

    const usuarioId = obtenerUsuarioId();

    if (!usuarioId) {
        mostrarMensaje(
            'Primero necesitás guardar tus datos personales.',
            'error'
        );
        return;
    }

    activando = true;
    elementos.boton.disabled = true;
    mostrarMensaje('');

    try {
        if (!window.isSecureContext) {
            throw new Error(
                'Las notificaciones requieren HTTPS o localhost.'
            );
        }

        if (!('Notification' in window)) {
            throw new Error(
                'Este navegador no admite notificaciones.'
            );
        }

        if (!('serviceWorker' in navigator)) {
            throw new Error(
                'Este navegador no admite service workers.'
            );
        }

        if (!messaging) {
            await inicializarFirebase();
        }

        const permiso = await Notification.requestPermission();

        if (permiso !== 'granted') {
            throw new Error(
                'No se otorgó permiso para recibir notificaciones.'
            );
        }

        const registro = await navigator.serviceWorker.register(
            '/firebase-messaging-sw.js'
        );

        const token = await getToken(messaging, {
            vapidKey,
            serviceWorkerRegistration: registro
        });

        if (!token) {
            throw new Error(
                'Firebase no devolvió un token para este navegador.'
            );
        }

        await registrarToken(token, usuarioId);

        mostrarMensaje(
            'Notificaciones activadas correctamente en este dispositivo.'
        );

        elementos.boton.textContent = 'Notificaciones activadas';
    } catch (error) {
        console.error('Error al activar notificaciones:', error);

        mostrarMensaje(
            error.message ||
            'No se pudieron activar las notificaciones.',
            'error'
        );
    } finally {
        activando = false;
        elementos.boton.disabled = false;
    }
}

async function inicializar() {
    if (!elementos.seccion || !elementos.boton || !elementos.mensaje) {
        return;
    }

    actualizarSeccion();

    elementos.boton.addEventListener(
        'click',
        activarNotificaciones
    );

    window.addEventListener('storage', actualizarSeccion);

    document.getElementById('form-persona')?.addEventListener(
        'submit',
        () => {
            setTimeout(actualizarSeccion, 500);
        }
    );

    if (Notification.permission === 'granted') {
        elementos.boton.textContent = 'Activar notificaciones';
    }
}

inicializar();
