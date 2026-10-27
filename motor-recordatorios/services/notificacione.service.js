
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
    getMessaging,
    getToken,
    onMessage,
    isSupported
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging.js';

import { firebaseConfig, vapidKey } from './firebase-config.js';

const CLAVE_PERSONA = 'personaAsistenteMedicacion';

const seccion = document.getElementById('seccion-notificaciones');
const boton = document.getElementById('activar-notificaciones');
const mensaje = document.getElementById('mensaje-notificaciones');

let messaging = null;
let activando = false;

function mostrarMensaje(texto, error = false) {
    if (!mensaje) return;

    mensaje.textContent = texto;
    mensaje.hidden = !texto;
    mensaje.classList.toggle('mensaje--error', error);
    mensaje.classList.toggle('mensaje--exito', !error);
}

function obtenerUsuarioId() {
    try {
        const usuario = JSON.parse(
            localStorage.getItem(CLAVE_PERSONA)
        );

        const id = Number(usuario?.id);

        return Number.isSafeInteger(id) && id > 0 ? id : null;
    } catch {
        return null;
    }
}

function actualizarSeccion() {
    if (!seccion) return;

    seccion.hidden = !obtenerUsuarioId();
}

async function inicializarFirebase() {
    if (!(await isSupported())) {
        throw new Error(
            'Este navegador no admite notificaciones push de Firebase.'
        );
    }

    const app = initializeApp(firebaseConfig);
    messaging = getMessaging(app);

    onMessage(messaging, async (payload) => {
        const titulo = payload.notification?.title ||
            'Memoric - Recordatorio de medicación';

        const cuerpo = payload.notification?.body ||
            'Tenés un recordatorio de medicación.';

        mostrarMensaje(`${titulo}: ${cuerpo}`);

        if (Notification.permission === 'granted') {
            try {
                const registro = await navigator.serviceWorker.ready;

                await registro.showNotification(titulo, {
                    body: cuerpo,
                    data: {
                        url: '/index.html'
                    }
                });
            } catch (error) {
                console.error('Error al mostrar notificación:', error);
            }
        }
    });
}

async function registrarToken(token, usuarioId) {
    const respuesta = await fetch('/api/dispositivos/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            usuarioId,
            token
        })
    });

    const datos = await respuesta.json();

    if (!respuesta.ok || !datos.ok) {
        throw new Error(
            datos.mensaje || 'No se pudo registrar el dispositivo.'
        );
    }

    return datos;
}

async function activarNotificaciones() {
    if (activando) return;

    const usuarioId = obtenerUsuarioId();

    if (!usuarioId) {
        mostrarMensaje(
            'Primero necesitás registrar tus datos personales.',
            true
        );
        return;
    }

    activando = true;
    boton.disabled = true;
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
                'Tenés que permitir las notificaciones en el navegador.'
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
            'Notificaciones activadas correctamente.'
        );

        boton.textContent = 'Notificaciones activadas';

        console.log('Dispositivo registrado correctamente en Memoric.');
    } catch (error) {
        console.error('Error al activar notificaciones:', error);

        mostrarMensaje(
            error.message || 'No se pudieron activar las notificaciones.',
            true
        );
    } finally {
        activando = false;
        boton.disabled = false;
    }
}

function inicializar() {
    if (!seccion || !boton || !mensaje) {
        console.error(
            'No se encontraron los elementos de notificaciones en el HTML.'
        );
        return;
    }

    actualizarSeccion();

    boton.addEventListener('click', activarNotificaciones);

    window.addEventListener('storage', actualizarSeccion);

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            actualizarSeccion();
        }
    });
}

inicializar();
