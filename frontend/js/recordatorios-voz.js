
(() => {
    'use strict';

    const CLAVE_ACTIVACION = 'memoricAvisosVozActivados';
    const CLAVE_PERSONA = 'personaAsistenteMedicacion';

    let contextoAudio = null;
    let websocket = null;
    let usuarioConectado = null;
    let reconexion = null;
    let conexionRegistrada = false;
    let colaAudio = Promise.resolve();
    let recordatorioActual = null;

    function estaActivado() {
        return localStorage.getItem(CLAVE_ACTIVACION) === 'true';
    }

    function obtenerContextoAudio() {
        return contextoAudio;
    }

    function obtenerUsuarioId() {
        try {
            const usuario = JSON.parse(
                localStorage.getItem(CLAVE_PERSONA)
            );

            const id = Number(usuario?.id);

            return Number.isSafeInteger(id) && id > 0
                ? id
                : null;
        } catch {
            return null;
        }
    }

    function obtenerUrlWebSocket() {
        if (window.APP_CONFIG?.WEBSOCKET_URL) {
            return window.APP_CONFIG.WEBSOCKET_URL;
        }

        const protocolo = location.protocol === 'https:'
            ? 'wss:'
            : 'ws:';

        return `${protocolo}//${location.host}/ws`;
    }

    async function prepararAudio() {
        const AudioContextDisponible =
            window.AudioContext || window.webkitAudioContext;

        if (!AudioContextDisponible) {
            throw new Error(
                'Este navegador no permite reproducir avisos por voz.'
            );
        }

        if (!contextoAudio || contextoAudio.state === 'closed') {
            contextoAudio = new AudioContextDisponible();
        }

        if (contextoAudio.state === 'suspended') {
            await contextoAudio.resume();
        }

        if (contextoAudio.state !== 'running') {
            throw new Error(
                'El navegador no permitió habilitar el audio.'
            );
        }

        console.log(
            '[MEMORIC VOZ] AudioContext preparado:',
            contextoAudio.state
        );

        return contextoAudio;
    }

    async function activarAudio() {
        await prepararAudio();

        localStorage.setItem(CLAVE_ACTIVACION, 'true');

        conectarWebSocket();

        return true;
    }

    function registrarRecordatorios() {
        if (
            !websocket ||
            websocket.readyState !== WebSocket.OPEN
        ) {
            return;
        }

        const usuarioId = obtenerUsuarioId();

        if (!usuarioId) {
            return;
        }

        websocket.send(JSON.stringify({
            type: 'registrar_recordatorios',
            usuarioId
        }));

        usuarioConectado = usuarioId;
    }

    function programarReconexion() {
        if (reconexion || !estaActivado()) {
            return;
        }

        reconexion = setTimeout(() => {
            reconexion = null;
            conectarWebSocket();
        }, 5000);
    }

    function conectarWebSocket() {
        if (!estaActivado()) {
            return;
        }

        const usuarioId = obtenerUsuarioId();

        if (!usuarioId) {
            return;
        }

        if (
            websocket &&
            (
                websocket.readyState === WebSocket.OPEN ||
                websocket.readyState === WebSocket.CONNECTING
            )
        ) {
            if (
                websocket.readyState === WebSocket.OPEN &&
                usuarioConectado !== usuarioId
            ) {
                registrarRecordatorios();
            }

            return;
        }

        try {
            websocket = new WebSocket(
                obtenerUrlWebSocket()
            );

            websocket.binaryType = 'arraybuffer';

            websocket.addEventListener('open', () => {
                console.log(
                    '[MEMORIC VOZ] WebSocket conectado.'
                );

                conexionRegistrada = false;
                registrarRecordatorios();
            });

            websocket.addEventListener('message', manejarMensaje);

            websocket.addEventListener('close', () => {
                console.log(
                    '[MEMORIC VOZ] WebSocket desconectado.'
                );

                conexionRegistrada = false;
                usuarioConectado = null;
                recordatorioActual = null;

                programarReconexion();
            });

            websocket.addEventListener('error', (error) => {
                console.error(
                    '[MEMORIC VOZ] Error de WebSocket:',
                    error
                );
            });
        } catch (error) {
            console.error(
                '[MEMORIC VOZ] Error al conectar:',
                error
            );

            programarReconexion();
        }
    }

    function reproducirAudio(datos) {
        colaAudio = colaAudio
            .catch(() => {})
            .then(async () => {
                const contexto = obtenerContextoAudio();

                console.log(
                    '[MEMORIC VOZ] Estado del AudioContext:',
                    contexto?.state ?? 'no inicializado'
                );

                if (!contexto) {
                    console.warn(
                        '[MEMORIC VOZ] Audio no habilitado en esta página.'
                    );
                    return;
                }

                if (contexto.state === 'suspended') {
                    await contexto.resume();
                }

                if (contexto.state !== 'running') {
                    console.warn(
                        '[MEMORIC VOZ] El navegador bloqueó la reproducción.'
                    );
                    return;
                }

                const audioDecodificado =
                    await contexto.decodeAudioData(
                        datos.slice(0)
                    );

                console.log(
                    '[MEMORIC VOZ] Audio decodificado correctamente.'
                );

                await new Promise((resolve) => {
                    const fuente = contexto.createBufferSource();

                    fuente.buffer = audioDecodificado;
                    fuente.connect(contexto.destination);

                    fuente.onended = () => {
                        console.log(
                            '[MEMORIC VOZ] Reproducción finalizada.'
                        );

                        resolve();
                    };

                    console.log(
                        '[MEMORIC VOZ] Iniciando reproducción del recordatorio.'
                    );

                    fuente.start();
                });
            })
            .catch((error) => {
                console.error(
                    '[MEMORIC VOZ] Error reproduciendo audio:',
                    error
                );
            });

        return colaAudio;
    }

    function manejarMensaje(evento) {
        if (evento.data instanceof ArrayBuffer) {
            if (!recordatorioActual) {
                console.warn(
                    '[MEMORIC VOZ] Audio recibido sin recordatorio activo.'
                );
                return;
            }

            console.log(
                '[MEMORIC VOZ] Audio recibido:',
                evento.data.byteLength,
                'bytes'
            );

            reproducirAudio(evento.data);
            return;
        }

        if (typeof evento.data !== 'string') {
            return;
        }

        let mensaje;

        try {
            mensaje = JSON.parse(evento.data);
        } catch {
            return;
        }

        switch (mensaje.tipo) {
            case 'recordatorios_registrados':
                conexionRegistrada = true;

                console.log(
                    '[MEMORIC VOZ] Recordatorios registrados.'
                );
                break;

            case 'recordatorio_voz':
                recordatorioActual = mensaje.envioId;

                console.log(
                    '[MEMORIC VOZ] Recordatorio recibido:',
                    mensaje.texto
                );
                break;

            case 'fin_recordatorio_voz':
                console.log(
                    '[MEMORIC VOZ] Fin de transmisión del recordatorio:',
                    mensaje.envioId
                );

                recordatorioActual = null;
                break;

            case 'error':
                console.error(
                    '[MEMORIC VOZ] Error del servidor:',
                    mensaje.mensaje
                );
                break;
        }
    }

    function inicializar() {
        if (!estaActivado()) {
            return;
        }

        if (!obtenerUsuarioId()) {
            return;
        }

        // Reconecta automáticamente al abrir la página.
        conectarWebSocket();

        // Permite preparar o reactivar el audio cuando
        // el usuario vuelve a interactuar con la página.
        document.addEventListener('pointerdown', () => {
            if (contextoAudio?.state !== 'running') {
                prepararAudio().catch((error) => {
                    console.error(
                        '[MEMORIC VOZ] No se pudo preparar el audio:',
                        error
                    );
                });
            }
        });
    }

    window.MEMORIC_VOZ = {
        activarAudio,
        estaActivado,
        obtenerContextoAudio,
        conectarWebSocket
    };

    inicializar();
})();
