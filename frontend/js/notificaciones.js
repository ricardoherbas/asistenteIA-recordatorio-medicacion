
import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
    getMessaging,
    getToken,
    onMessage,
    isSupported
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging.js';

import { firebaseConfig, vapidKey } from './firebase-config.js';

console.log('Notificaciones.js cargado correctamente');

const CLAVE_PERSONA = 'personaAsistenteMedicacion';

const elementos = {
    seccion: document.getElementById('seccion-notificaciones'),
    boton: document.getElementById('activar-notificaciones'),
    mensaje: document.getElementById('mensaje-notificaciones')
};

let messaging = null;
let promesaFirebase = null;
let activando = false;

function mostrarMensaje(texto, tipo = 'exito') {
    if (!elementos.mensaje) return;

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
    if (!elementos.seccion) return;

    elementos.seccion.hidden = !obtenerUsuarioId();
}

async function inicializarFirebase() {
    if (messaging) return messaging;

    if (promesaFirebase) return promesaFirebase;

    promesaFirebase = (async () => {
        const compatible = await isSupported();

        if (!compatible) {
            throw new Error(
                'Este navegador no admite notificaciones push de Firebase.'
            );
        }

        const app = getApps().length
            ? getApp()
            : initializeApp(firebaseConfig);

        const instancia = getMessaging(app);

        onMessage(instancia, (payload) => {
            console.log(
                '[MEMORIC PUSH] Mensaje recibido:',
                payload
            );

            const titulo =
                payload.notification?.title ||
                payload.data?.title ||
                'Memoric - Recordatorio de medicación';

            const mensaje =
                payload.notification?.body ||
                payload.data?.body ||
                'Tenés un recordatorio de medicación.';

            mostrarMensaje(`${titulo}: ${mensaje}`);

            if (Notification.permission === 'granted') {
                navigator.serviceWorker.ready
                    .then((registro) => {
                        return registro.showNotification(titulo, {
                            body: mensaje,
                            data: {
                                url: '/index.html'
                            }
                        });
                    })
                    .catch((error) => {
                        console.error(
                            '[MEMORIC PUSH] Error al mostrar notificación:',
                            error
                        );
                    });
            }
        });

        messaging = instancia;

        console.log(
            '[MEMORIC PUSH] Listener de Firebase inicializado.'
        );

        return messaging;
    })();

    try {
        return await promesaFirebase;
    } catch (error) {
        promesaFirebase = null;
        throw error;
    }
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

async function activarPush(usuarioId) {
    if (!window.isSecureContext) {
        throw new Error(
            'Las notificaciones push requieren HTTPS o localhost.'
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

    const firebaseMessaging = await inicializarFirebase();

    const permiso = await Notification.requestPermission();

    if (permiso !== 'granted') {
        throw new Error(
            'No se otorgó permiso para recibir notificaciones push.'
        );
    }

    const registro = await navigator.serviceWorker.register(
        '/firebase-messaging-sw.js'
    );

    const token = await getToken(firebaseMessaging, {
        vapidKey,
        serviceWorkerRegistration: registro
    });

    if (!token) {
        throw new Error(
            'Firebase no devolvió un token para este navegador.'
        );
    }

    await registrarToken(token, usuarioId);

    console.log(
        '[MEMORIC PUSH] Token registrado correctamente.'
    );

    return true;
}

async function restaurarPush() {
    if (!obtenerUsuarioId()) return;

    if (!window.isSecureContext) return;

    if (!('Notification' in window)) return;

    if (!('serviceWorker' in navigator)) return;

    // No solicitamos permisos automáticamente.
    // Solo restauramos Push si el usuario ya los concedió.
    if (Notification.permission !== 'granted') return;

    try {
        await activarPush(obtenerUsuarioId());

        console.log(
            '[MEMORIC PUSH] Notificaciones restauradas automáticamente.'
        );
    } catch (error) {
        console.error(
            '[MEMORIC PUSH] No se pudo restaurar Push:',
            error
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

    // Conservamos la activación de voz desde el clic.
    const activacionVoz = window.MEMORIC_VOZ
        ? window.MEMORIC_VOZ.activarAudio()
        : Promise.reject(
            new Error('No se encontró el módulo de avisos por voz.')
        );

    const activacionPush = activarPush(usuarioId);

    try {
        const resultados = await Promise.allSettled([
            activacionVoz,
            activacionPush
        ]);

        const vozActivada = resultados[0].status === 'fulfilled';
        const pushActivada = resultados[1].status === 'fulfilled';

        if (vozActivada && pushActivada) {
            mostrarMensaje(
                'Notificaciones push y audio habilitados correctamente.'
            );

            elementos.boton.textContent = 'Notificaciones activadas';
        } else if (vozActivada) {
            const errorPush = resultados[1].reason;

            mostrarMensaje(
                'Audio habilitado. No se pudieron activar las notificaciones push: ' +
                (errorPush?.message || 'Error desconocido.'),
                'error'
            );

            elementos.boton.textContent = 'Reintentar notificaciones';
        } else if (pushActivada) {
            const errorVoz = resultados[0].reason;

            mostrarMensaje(
                'Notificaciones push activadas. No se pudo habilitar el audio: ' +
                (errorVoz?.message || 'Error desconocido.'),
                'error'
            );

            elementos.boton.textContent = 'Reintentar notificaciones';
        } else {
            const errorPush = resultados[1].reason;
            const errorVoz = resultados[0].reason;

            mostrarMensaje(
                'No se pudieron habilitar los avisos. ' +
                'Push: ' +
                (errorPush?.message || 'Error desconocido.') +
                '. Audio: ' +
                (errorVoz?.message || 'Error desconocido.'),
                'error'
            );

            elementos.boton.textContent = 'Reintentar notificaciones';
        }

        console.log('[NOTIFICACIONES] Resultado:', {
            vozActivada,
            pushActivada
        });
    } catch (error) {
        console.error(
            'Error al activar notificaciones:',
            error
        );

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

function inicializar() {
    if (
        !elementos.seccion ||
        !elementos.boton ||
        !elementos.mensaje
    ) {
        return;
    }

    actualizarSeccion();

    elementos.boton.addEventListener(
        'click',
        activarNotificaciones
    );

    window.addEventListener(
        'storage',
        () => {
            actualizarSeccion();
            restaurarPush();
        }
    );

    document.getElementById('form-persona')?.addEventListener(
        'submit',
        () => {
            setTimeout(() => {
                actualizarSeccion();
                restaurarPush();
            }, 500);
        }
    );

    if (window.MEMORIC_VOZ?.estaActivado()) {
        elementos.boton.textContent = 'Activar notificaciones';
    }

    // Inicializar el listener sin esperar al botón.
    inicializarFirebase().catch((error) => {
        console.error(
            '[MEMORIC PUSH] Error al inicializar Firebase:',
            error
        );
    });

    // Recuperar el token si el usuario ya dio permiso.
    restaurarPush();
}

inicializar();
