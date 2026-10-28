
const WebSocket = require('ws');
const { transcribirConWhisper } = require('../services/whisper.service');
const { analizarIntencion } = require('../services/intencion.service');
const { consultarProlog } = require('../services/prolog.service');
const { ejecutarAccionProlog } = require('../services/accionesProlog.service');
const { consultarGemma } = require('../services/gemma.service');
const { prepararContextoGemma } = require('../services/contextoGemma.service');
const { sintetizarConPiper } = require('../services/piper.service');

const registrarWebSocket = (servidor) => {
    const wss = new WebSocket.Server({
        server: servidor,
        path: '/ws'
    });

    const conexionesUsuarios = new Map();

    const usuarioValido = (valor) => {
        const id = Number(valor);
        return Number.isSafeInteger(id) && id > 0;
    };

    const enviarJSON = (ws, mensaje) => {
        if (ws.readyState !== WebSocket.OPEN) {
            return false;
        }

        ws.send(JSON.stringify(mensaje), (error) => {
            if (error) {
                console.error('[WS] Error enviando JSON:', error.message);
            }
        });

        return true;
    };

    const enviarBinario = (ws, audio) => {
        return new Promise((resolve, reject) => {
            if (ws.readyState !== WebSocket.OPEN) {
                reject(new Error('La conexión WebSocket está cerrada.'));
                return;
            }

            ws.send(audio, { binary: true }, (error) => {
                if (error) {
                    reject(error);
                } else {
                    resolve();
                }
            });
        });
    };

    const registrarConexionUsuario = (usuarioId, ws) => {
        if (!conexionesUsuarios.has(usuarioId)) {
            conexionesUsuarios.set(usuarioId, new Set());
        }

        conexionesUsuarios.get(usuarioId).add(ws);
    };

    const quitarConexionUsuario = (usuarioId, ws) => {
        if (!usuarioId) return;

        const conexiones = conexionesUsuarios.get(usuarioId);

        if (!conexiones) return;

        conexiones.delete(ws);

        if (conexiones.size === 0) {
            conexionesUsuarios.delete(usuarioId);
        }
    };

    /*
     * ENVÍO AUTOMÁTICO DE RECORDATORIOS
     *
     * El motor de recordatorios llamará a esta función
     * mediante el backend.
     *
     * Para este prototipo se utiliza el usuarioId
     * proporcionado por el frontend.
     */
    const enviarRecordatorioVoz = async (
        usuarioId,
        mensaje,
        envioId,
        registroTomaId
    ) => {
        const id = Number(usuarioId);
        const identificadorEnvio = Number(envioId);
        const identificadorToma = Number(registroTomaId);

        if (!usuarioValido(id)) {
            throw new Error('El usuario del recordatorio no es válido.');
        }

        if (typeof mensaje !== 'string' || !mensaje.trim()) {
            throw new Error('El mensaje del recordatorio no es válido.');
        }

        if (
            !Number.isSafeInteger(identificadorEnvio) ||
            identificadorEnvio <= 0
        ) {
            throw new Error('El identificador del envío no es válido.');
        }

        if (
            !Number.isSafeInteger(identificadorToma) ||
            identificadorToma <= 0
        ) {
            throw new Error('El identificador de la toma no es válido.');
        }

        const conexiones = conexionesUsuarios.get(id);

        if (!conexiones || conexiones.size === 0) {
            console.log(
                '[RECORDATORIO] Usuario desconectado:',
                id
            );

            return {
                ok: false,
                motivo: 'usuario_desconectado'
            };
        }

        const conexionesDisponibles = [...conexiones].filter((ws) => {
            return (
                ws.readyState === WebSocket.OPEN &&
                ws.avisosVozActivos === true
            );
        });

        if (conexionesDisponibles.length === 0) {
            return {
                ok: false,
                motivo: 'avisos_voz_no_disponibles'
            };
        }

        // Priorizar chat.html; utilizar index.html como alternativa.
        // Enviar a una sola conexión para evitar audio duplicado.
        const ws = conexionesDisponibles.find(
            (conexion) => conexion.modoConexion === 'asistente'
        ) || conexionesDisponibles.find(
            (conexion) => conexion.modoConexion === 'recordatorios'
        );

        if (!ws) {
            return {
                ok: false,
                motivo: 'avisos_voz_no_disponibles'
            };
        }

        console.log(
            '[RECORDATORIO] Conexión seleccionada:',
            ws.modoConexion
        );

        try {
            console.log(
                '[RECORDATORIO] Generando audio con Piper:',
                mensaje
            );

            const audio = await sintetizarConPiper(
                mensaje.trim()
            );

            if (ws.readyState !== WebSocket.OPEN) {
                return {
                    ok: false,
                    motivo: 'usuario_desconectado'
                };
            }

            enviarJSON(ws, {
                tipo: 'recordatorio_voz',
                envioId: identificadorEnvio,
                registroTomaId: identificadorToma,
                texto: mensaje.trim()
            });

            await enviarBinario(ws, audio);

            enviarJSON(ws, {
                tipo: 'fin_recordatorio_voz',
                envioId: identificadorEnvio
            });

            console.log(
                '[RECORDATORIO] Audio enviado correctamente:',
                identificadorEnvio
            );

            return {
                ok: true,
                envioId: identificadorEnvio
            };
        } catch (error) {
            console.error(
                '[RECORDATORIO] Error enviando audio:',
                error
            );

            return {
                ok: false,
                motivo: 'error_envio'
            };
        }
    };

    wss.enviarRecordatorioVoz = enviarRecordatorioVoz;

    wss.on('connection', (ws) => {
        console.log('[WS] Cliente conectado al WebSocket.');

        let requestId = 0;
        let controladorActual = null;
        let saludoSolicitado = false;
        let usuarioIdActual = null;
        let nombreUsuarioActual = '';
        let modoConexion = null;

        ws.avisosVozActivos = false;
        ws.modoConexion = null;

        const responder = (mensaje) => {
            return enviarJSON(ws, mensaje);
        };

        const cancelarActual = () => {
            if (!controladorActual) return;

            console.log('[WS] Cancelando operación anterior.');

            controladorActual.abort();
            controladorActual = null;
        };

        const solicitudVigente = (id, signal) => {
            return (
                !signal.aborted &&
                id === requestId &&
                ws.readyState === WebSocket.OPEN
            );
        };

        const seleccionarUsuario = (id, nombre) => {
            if (
                usuarioIdActual !== null &&
                usuarioIdActual !== id
            ) {
                requestId++;
                cancelarActual();

                quitarConexionUsuario(usuarioIdActual, ws);

                saludoSolicitado = false;
                ws.avisosVozActivos = false;
            }

            usuarioIdActual = id;
            nombreUsuarioActual = nombre;

            registrarConexionUsuario(id, ws);
        };

        /*
         * REGISTRO DE RECORDATORIOS
         *
         * Se utiliza desde index.html.
         * No inicia el asistente ni genera un saludo.
         */
        const registrarRecordatorios = (mensaje) => {
            const id = Number(mensaje.usuarioId);

            if (!usuarioValido(id)) {
                responder({
                    tipo: 'error',
                    mensaje: 'El usuario indicado no es válido.'
                });

                return;
            }

            seleccionarUsuario(id, '');

            ws.avisosVozActivos = true;

            if (modoConexion !== 'asistente') {
                modoConexion = 'recordatorios';
                ws.modoConexion = 'recordatorios';
            }

            responder({
                tipo: 'recordatorios_registrados',
                mensaje: 'Conexión habilitada para recibir recordatorios.'
            });

            console.log(
                '[RECORDATORIO] Usuario registrado:',
                id
            );
        };

        /*
         * SALUDO INICIAL DEL ASISTENTE
         */
        const procesarSaludo = async () => {
            if (saludoSolicitado) {
                console.log(
                    '[SALUDO] El saludo ya fue solicitado.'
                );

                return;
            }

            saludoSolicitado = true;

            requestId++;
            cancelarActual();

            const id = requestId;
            const controller = new AbortController();
            controladorActual = controller;
            const signal = controller.signal;

            const nombreSaludo = nombreUsuarioActual ||
                'qué bueno tenerte aquí';

            const texto =
                `¡Hola, ${nombreSaludo}! 😊 ` +
                'Estoy acá para ayudarte con tus medicamentos y recordatorios. ' +
                '¡Vamos paso a paso, cuidarte es importante!';

            const textoParaVoz = texto.replace('😊', '');

            try {
                console.log(
                    '[SALUDO] Solicitando síntesis a Piper.'
                );

                const audio = await sintetizarConPiper(
                    textoParaVoz,
                    signal
                );

                if (!solicitudVigente(id, signal)) {
                    return;
                }

                responder({
                    tipo: 'saludo',
                    texto
                });

                await enviarBinario(ws, audio);

                if (!solicitudVigente(id, signal)) {
                    return;
                }

                responder({
                    tipo: 'fin_saludo'
                });

                console.log(
                    '[SALUDO] Saludo inicial procesado.'
                );
            } catch (error) {
                if (
                    signal.aborted ||
                    error.message === 'PIPELINE_CANCELADO'
                ) {
                    console.log('[SALUDO] Operación cancelada.');
                    return;
                }

                console.error(
                    '[SALUDO] Error generando saludo:',
                    error
                );

                responder({
                    tipo: 'error',
                    mensaje: 'No se pudo generar el saludo inicial.'
                });
            } finally {
                if (controladorActual === controller) {
                    controladorActual = null;
                }
            }
        };

        /*
         * PIPELINE DE VOZ
         *
         * Whisper -> Intención -> Prolog ->
         * Acción -> Contexto -> Gemma -> Piper
         */
        const procesarAudio = async (
            audioBuffer,
            id,
            controller
        ) => {
            const signal = controller.signal;
            const vigente = () => solicitudVigente(id, signal);

            try {
                console.log(
                    '\n========== PIPELINE DE VOZ =========='
                );

                console.log('[VOZ] Solicitud:', id);
                console.log('[VOZ] Usuario ID:', usuarioIdActual);
                console.log(
                    '[VOZ] Audio recibido:',
                    audioBuffer.length,
                    'bytes'
                );

                if (!usuarioIdActual) {
                    responder({
                        tipo: 'error',
                        mensaje: 'Primero tenés que iniciar el asistente con tu perfil.'
                    });

                    return;
                }

                // 1. TRANSCRIPCIÓN CON WHISPER
                console.log(
                    '[WHISPER] Enviando audio para transcripción...'
                );

                const transcripcion = await transcribirConWhisper(
                    audioBuffer,
                    signal
                );

                if (!vigente()) {
                    return;
                }

                if (typeof transcripcion !== 'string') {
                    throw new Error(
                        'Whisper devolvió una transcripción inválida.'
                    );
                }

                const textoUsuario = transcripcion.trim();

                console.log(
                    '[WHISPER] Texto reconocido:',
                    textoUsuario
                );

                if (!textoUsuario) {
                    responder({
                        tipo: 'error',
                        mensaje: 'No se pudo reconocer el audio.'
                    });

                    return;
                }

                responder({
                    tipo: 'transcripcion',
                    texto: textoUsuario
                });

                // 2. CLASIFICACIÓN DE INTENCIÓN
                console.log(
                    '[INTENCION] Analizando texto reconocido...'
                );

                const analisis = analizarIntencion(textoUsuario);

                if (!vigente()) {
                    return;
                }

                console.log(
                    '[INTENCION] Resultado:',
                    JSON.stringify(analisis)
                );

                responder({
                    tipo: 'intencion',
                    intencion: analisis.intencion,
                    datos: analisis.datos
                });

                // 3. CONSULTA A PROLOG
                console.log(
                    '[PROLOG] Consultando acción para:',
                    analisis.intencion
                );

                const accion = await consultarProlog(
                    analisis.intencion
                );

                if (!vigente()) {
                    return;
                }

                console.log(
                    '[PROLOG] Acción devuelta:',
                    accion
                );

                responder({
                    tipo: 'accion',
                    accion
                });

                // 4. EJECUCIÓN DE ACCIÓN
                console.log(
                    '[ACCION] Ejecutando acción:',
                    accion
                );

                const resultadoOperacion = await ejecutarAccionProlog({
                    accion,
                    usuarioId: usuarioIdActual,
                    datos: analisis.datos || {},
                    origen: 'voz'
                });

                if (!vigente()) {
                    return;
                }

                console.log(
                    '[ACCION] Resultado:',
                    JSON.stringify(resultadoOperacion)
                );

                responder({
                    tipo: 'resultado_operacion',
                    resultado: resultadoOperacion.resultado,
                    ok: resultadoOperacion.ok,
                    datos: resultadoOperacion.datos || null,
                    mensaje: resultadoOperacion.mensaje
                });

                // 5. CONTEXTO PARA GEMMA
                // Convierte los datos de la operación en texto
                // antes de enviarlos al modelo.
                const contextoGemma = prepararContextoGemma(
                    textoUsuario,
                    accion,
                    resultadoOperacion
                );

                console.log(
                    '[GEMMA] Contexto preparado:',
                    contextoGemma
                );

                console.log(
                    '[GEMMA] Iniciando generación de respuesta...'
                );

                // 6. GEMMA + PIPER
                let respuestaCompleta = '';
                let cola = '';

                const procesarParte = async (parte) => {
                    if (!vigente()) {
                        return;
                    }

                    const texto = parte.trim();

                    if (!texto) {
                        return;
                    }

                    console.log(
                        '[PIPER] Sintetizando fragmento:',
                        JSON.stringify(texto)
                    );

                    const audio = await sintetizarConPiper(
                        texto,
                        signal
                    );

                    if (!vigente()) {
                        return;
                    }

                    responder({
                        tipo: 'respuesta',
                        texto
                    });

                    await enviarBinario(ws, audio);
                };

                const respuesta = await consultarGemma(
                    contextoGemma,
                    signal,
                    async (fragmento) => {
                        if (!vigente()) {
                            return;
                        }

                        respuestaCompleta += fragmento;
                        cola += fragmento;

                        while (vigente()) {
                            const coincidencia = cola.match(
                                /^([\s\S]*?[.!?]+)(?:\s+|$)/
                            );

                            if (!coincidencia) {
                                break;
                            }

                            const parte = coincidencia[1];

                            cola = cola.slice(
                                coincidencia[0].length
                            );

                            await procesarParte(parte);

                            if (!vigente()) {
                                return;
                            }
                        }
                    }
                );

                if (!vigente()) {
                    return;
                }

                if (cola.trim()) {
                    await procesarParte(cola);
                }

                if (!vigente()) {
                    return;
                }

                const textoFinal = respuestaCompleta.trim() ||
                    (
                        typeof respuesta === 'string'
                            ? respuesta.trim()
                            : ''
                    );

                console.log(
                    '[GEMMA] Respuesta final:',
                    JSON.stringify(textoFinal)
                );

                if (!textoFinal) {
                    responder({
                        tipo: 'error',
                        mensaje: 'Gemma no devolvió ninguna respuesta.'
                    });

                    return;
                }

                responder({
                    tipo: 'fin_respuesta'
                });

                console.log(
                    '[VOZ] Pipeline completado correctamente.'
                );

                console.log(
                    '========== FIN DEL PIPELINE ==========\n'
                );
            } catch (error) {
                if (
                    signal.aborted ||
                    error.message === 'PIPELINE_CANCELADO'
                ) {
                    console.log('[VOZ] Pipeline cancelado.');
                    return;
                }

                console.error(
                    '[VOZ] Error en el pipeline:',
                    error
                );

                responder({
                    tipo: 'error',
                    mensaje: 'Ocurrió un error al procesar la consulta de voz.'
                });
            } finally {
                if (controladorActual === controller) {
                    controladorActual = null;
                }
            }
        };

        /*
         * MENSAJES DEL NAVEGADOR
         */
        ws.on('message', (datos, esBinario) => {
            if (!esBinario) {
                let mensaje;

                try {
                    mensaje = JSON.parse(datos.toString());
                } catch (error) {
                    console.error(
                        '[WS] Error interpretando JSON:',
                        error.message
                    );

                    responder({
                        tipo: 'error',
                        mensaje: 'El mensaje recibido no es JSON válido.'
                    });

                    return;
                }

                if (
                    !mensaje ||
                    typeof mensaje !== 'object' ||
                    Array.isArray(mensaje)
                ) {
                    responder({
                        tipo: 'error',
                        mensaje: 'El mensaje recibido no es válido.'
                    });

                    return;
                }

                console.log(
                    '[WS] Mensaje recibido:',
                    mensaje.type
                );

                // REGISTRAR RECORDATORIOS
                if (mensaje.type === 'registrar_recordatorios') {
                    registrarRecordatorios(mensaje);
                    return;
                }

                // INICIAR ASISTENTE
                if (mensaje.type === 'iniciar_asistente') {
                    const id = Number(mensaje.usuarioId);

                    const nombre =
                        typeof mensaje.nombre === 'string'
                            ? mensaje.nombre.trim().slice(0, 80)
                            : '';

                    if (!usuarioValido(id) || !nombre) {
                        responder({
                            tipo: 'error',
                            mensaje: 'El perfil recibido no es válido. Volvé a seleccionar tu perfil.'
                        });

                        return;
                    }

                    seleccionarUsuario(id, nombre);

                    modoConexion = 'asistente';
                    ws.modoConexion = 'asistente';

                    // El asistente también puede recibir
                    // recordatorios automáticos.
                    ws.avisosVozActivos = true;

                    console.log(
                        '[WS] Perfil seleccionado:',
                        {
                            usuarioId: usuarioIdActual,
                            nombre: nombreUsuarioActual
                        }
                    );

                    procesarSaludo();
                    return;
                }

                // CANCELAR CONSULTA
                if (mensaje.type === 'cancelar') {
                    console.log(
                        '[WS] Cancelación solicitada.'
                    );

                    requestId++;
                    cancelarActual();

                    responder({
                        tipo: 'cancelado'
                    });

                    return;
                }

                console.warn(
                    '[WS] Tipo de mensaje no compatible:',
                    mensaje.type
                );

                responder({
                    tipo: 'error',
                    mensaje: 'El tipo de mensaje recibido no es compatible.'
                });

                return;
            }

            /*
             * AUDIO DEL MICRÓFONO
             *
             * Solo se acepta desde una conexión
             * que haya iniciado el asistente.
             */
            if (modoConexion !== 'asistente') {
                responder({
                    tipo: 'error',
                    mensaje: 'Primero tenés que iniciar el asistente.'
                });

                return;
            }

            const audioBuffer = Buffer.from(datos);

            if (audioBuffer.length === 0) {
                responder({
                    tipo: 'error',
                    mensaje: 'El audio recibido está vacío.'
                });

                return;
            }

            if (!usuarioIdActual) {
                responder({
                    tipo: 'error',
                    mensaje: 'Primero tenés que iniciar el asistente con tu perfil.'
                });

                return;
            }

            requestId++;
            cancelarActual();

            const controller = new AbortController();
            controladorActual = controller;

            const id = requestId;

            console.log(
                `[WS] Audio recibido: ${audioBuffer.length} bytes.`
            );

            console.log(
                `[WS] Iniciando procesamiento de solicitud ${id}.`
            );

            procesarAudio(
                audioBuffer,
                id,
                controller
            );
        });

        /*
         * LIMPIEZA DE CONEXIONES
         */
        const limpiarConexion = () => {
            quitarConexionUsuario(usuarioIdActual, ws);

            usuarioIdActual = null;
            ws.avisosVozActivos = false;
            ws.modoConexion = null;

            requestId++;
            cancelarActual();
        };

        ws.on('close', () => {
            console.log('[WS] Cliente desconectado.');

            limpiarConexion();
        });

        ws.on('error', (error) => {
            console.error(
                '[WS] Error del WebSocket:',
                error.message
            );

            limpiarConexion();
        });
    });

    return wss;
};

module.exports = {
    registrarWebSocket
};
