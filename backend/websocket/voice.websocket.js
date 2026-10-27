const WebSocket = require('ws');
const { transcribirConWhisper } = require('../services/whisper.service');
const { analizarIntencion } = require('../services/intencion.service');
const { consultarProlog } = require('../services/prolog.service');
const { ejecutarAccionProlog } = require('../services/accionesProlog.service');
const { consultarGemma } = require('../services/gemma.service');
const { sintetizarConPiper } = require('../services/piper.service');

const registrarWebSocket = (servidor) => {
    const wss = new WebSocket.Server({
        server: servidor,
        path: '/ws'
    });

    wss.on('connection', (ws) => {
        console.log('[WS] Cliente conectado al WebSocket.');

        let requestId = 0;
        let controladorActual = null;
        let saludoSolicitado = false;
        let usuarioIdActual = null;
        let nombreUsuarioActual = '';

        const enviarJSON = (mensaje) => {
            if (ws.readyState !== WebSocket.OPEN) {
                console.warn('[WS] No se pudo enviar JSON: conexión cerrada.');
                return false;
            }

            ws.send(JSON.stringify(mensaje), (error) => {
                if (error) {
                    console.error('[WS] Error enviando JSON:', error.message);
                }
            });

            return true;
        };

        const cancelarActual = () => {
            if (!controladorActual) return;

            console.log('[WS] Cancelando la operación anterior.');
            controladorActual.abort();
            controladorActual = null;
        };

        const solicitudVigente = (id, signal) =>
            !signal.aborted &&
            id === requestId &&
            ws.readyState === WebSocket.OPEN;

        const procesarSaludo = async () => {
            if (saludoSolicitado) {
                console.log('[SALUDO] El saludo ya fue solicitado.');
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
                console.log('[SALUDO] Solicitando síntesis a Piper.');

                const audio = await sintetizarConPiper(
                    textoParaVoz,
                    signal
                );

                if (!solicitudVigente(id, signal)) {
                    console.log('[SALUDO] Solicitud cancelada.');
                    return;
                }

                console.log('[SALUDO] Audio generado correctamente.');

                enviarJSON({
                    tipo: 'saludo',
                    texto
                });

                if (!solicitudVigente(id, signal)) return;

                ws.send(audio, { binary: true }, (error) => {
                    if (error) {
                        console.error(
                            '[SALUDO] Error enviando audio:',
                            error.message
                        );
                    } else {
                        console.log('[SALUDO] Audio enviado al cliente.');
                    }
                });

                enviarJSON({
                    tipo: 'fin_saludo'
                });

                console.log('[SALUDO] Saludo inicial procesado.');
            } catch (error) {
                if (
                    signal.aborted ||
                    error.message === 'PIPELINE_CANCELADO'
                ) {
                    console.log('[SALUDO] Operación cancelada.');
                    return;
                }

                console.error('[SALUDO] Error generando saludo:', error);

                enviarJSON({
                    tipo: 'error',
                    mensaje: 'No se pudo generar el saludo inicial.'
                });
            } finally {
                if (controladorActual === controller) {
                    controladorActual = null;
                }
            }
        };

        const procesarAudio = async (audioBuffer, id, controller) => {
            const signal = controller.signal;
            const vigente = () => solicitudVigente(id, signal);

            try {
                console.log('\n========== PIPELINE DE VOZ ==========');
                console.log('[VOZ] Solicitud:', id);
                console.log('[VOZ] Usuario ID:', usuarioIdActual);
                console.log('[VOZ] Audio recibido:', audioBuffer.length, 'bytes');

                if (!usuarioIdActual) {
                    console.error('[VOZ] No hay un usuario seleccionado.');

                    enviarJSON({
                        tipo: 'error',
                        mensaje: 'Primero tenés que iniciar el asistente con tu perfil.'
                    });

                    return;
                }

                // 1. TRANSCRIPCIÓN CON WHISPER
                console.log('[WHISPER] Enviando audio para transcripción...');

                const transcripcion = await transcribirConWhisper(
                    audioBuffer,
                    signal
                );

                if (!vigente()) {
                    console.log('[VOZ] Solicitud cancelada después de Whisper.');
                    return;
                }

                console.log('[WHISPER] Transcripción recibida:', transcripcion);

                if (typeof transcripcion !== 'string') {
                    throw new Error('Whisper devolvió una transcripción inválida.');
                }

                const textoUsuario = transcripcion.trim();

                console.log('[WHISPER] Texto final:', JSON.stringify(textoUsuario));

                if (!textoUsuario) {
                    console.warn('[WHISPER] La transcripción está vacía.');

                    enviarJSON({
                        tipo: 'error',
                        mensaje: 'No se pudo reconocer el audio.'
                    });

                    return;
                }

                enviarJSON({
                    tipo: 'transcripcion',
                    texto: textoUsuario
                });

                // 2. CLASIFICACIÓN DE INTENCIÓN
                console.log('[INTENCION] Analizando texto reconocido...');

                const analisis = analizarIntencion(textoUsuario);

                if (!vigente()) {
                    console.log('[VOZ] Solicitud cancelada después del clasificador.');
                    return;
                }

                console.log('[INTENCION] Resultado completo:', JSON.stringify(analisis));
                console.log('[INTENCION] Intención:', analisis.intencion);
                console.log('[INTENCION] Datos:', JSON.stringify(analisis.datos || {}));
                console.log('[INTENCION] Motivo:', analisis.motivo || 'ninguno');

                enviarJSON({
                    tipo: 'intencion',
                    intencion: analisis.intencion,
                    datos: analisis.datos
                });

                // 3. CONSULTA A PROLOG
                console.log('[PROLOG] Consultando acción para:', analisis.intencion);

                const accion = await consultarProlog(
                    analisis.intencion
                );

                if (!vigente()) {
                    console.log('[VOZ] Solicitud cancelada después de Prolog.');
                    return;
                }

                console.log('[PROLOG] Acción devuelta:', accion);

                enviarJSON({
                    tipo: 'accion',
                    accion
                });

                // 4. EJECUCIÓN DE LA ACCIÓN Y ACCESO A POSTGRESQL
                console.log('[ACCION] Ejecutando acción:', accion);
                console.log('[ACCION] Usuario ID:', usuarioIdActual);
                console.log('[ACCION] Datos recibidos:', JSON.stringify(analisis.datos || {}));

                const resultadoOperacion = await ejecutarAccionProlog({
                    accion,
                    usuarioId: usuarioIdActual,
                    datos: analisis.datos || {},
                    origen: 'voz'
                });

                if (!vigente()) {
                    console.log('[VOZ] Solicitud cancelada después de ejecutar la acción.');
                    return;
                }

                console.log('[ACCION] Resultado completo:', JSON.stringify(resultadoOperacion));
                console.log('[ACCION] Operación:', resultadoOperacion.resultado);
                console.log('[ACCION] Correcta:', resultadoOperacion.ok);
                console.log('[ACCION] Mensaje:', resultadoOperacion.mensaje);
                console.log('[ACCION] Datos devueltos:', JSON.stringify(resultadoOperacion.datos || null));

                enviarJSON({
                    tipo: 'resultado_operacion',
                    resultado: resultadoOperacion.resultado,
                    ok: resultadoOperacion.ok,
                    datos: resultadoOperacion.datos || null,
                    mensaje: resultadoOperacion.mensaje
                });

                // 5. CONTEXTO BREVE PARA GEMMA

                // LOGS NUEVOS: DATOS QUE SE UTILIZAN PARA GEMMA
                console.log('\n========== DATOS PARA GEMMA ==========');

                console.log('[GEMMA INPUT] Texto del usuario:', textoUsuario);

                console.log('[GEMMA INPUT] Intención detectada:');
                console.log(JSON.stringify(analisis, null, 2));

                console.log('[GEMMA INPUT] Acción de Prolog:', accion);

                console.log('[GEMMA INPUT] Resultado de la operación:');
                console.log(JSON.stringify(resultadoOperacion, null, 2));

                console.log('========== FIN DE DATOS PARA GEMMA ==========\n');

                const contextoGemma = [
                    'Respondé en español rioplatense, de forma breve y natural.',
                    'No uses Markdown, saludos innecesarios ni repitas la pregunta.',
                    'Respondé únicamente con el resultado de la operación proporcionado abajo.',
                    'Usá el mensaje como base y los datos para contestar la consulta.',
                    'No inventes datos, dosis, medicamentos ni horarios.',
                    'No agregues recomendaciones ni menciones nombres internos del sistema.',
                    'Si se requiere una aclaración, formulá únicamente la pregunta indicada.',
                    '',
                    `Consulta del usuario: ${textoUsuario}`,
                    `Resultado de la operación: ${JSON.stringify({
                        ok: resultadoOperacion.ok,
                        mensaje: resultadoOperacion.mensaje,
                        datos: resultadoOperacion.datos || [],
                        requiereAclaracion: resultadoOperacion.resultado === 'requiere_aclaracion'
                    })}`
                ].join('\n');

                // LOGS NUEVOS: PROMPT EXACTO QUE SE ENVÍA A GEMMA
                console.log('\n========== PROMPT ENVIADO A GEMMA ==========');
                console.log(contextoGemma);
                console.log('========== FIN DEL PROMPT ==========\n');

                console.log('[GEMMA] Preparando contexto breve.');
                console.log('[GEMMA] Resultado de la operación recibido:', resultadoOperacion.resultado);
                console.log('[GEMMA] Iniciando generación de respuesta...');

                // 6. GENERACIÓN PROGRESIVA DE RESPUESTA Y SÍNTESIS CON PIPER
                let respuestaCompleta = '';
                let cola = '';

                const procesarParte = async (parte) => {
                    if (!vigente()) return;

                    const texto = parte.trim();

                    if (!texto) return;

                    console.log('[PIPER] Sintetizando fragmento:', JSON.stringify(texto));

                    const audio = await sintetizarConPiper(
                        texto,
                        signal
                    );

                    if (!vigente()) return;

                    console.log('[PIPER] Audio generado para el fragmento.');

                    enviarJSON({
                        tipo: 'respuesta',
                        texto
                    });

                    if (!vigente()) return;

                    ws.send(audio, { binary: true }, (error) => {
                        if (error) {
                            console.error('[PIPER] Error enviando audio:', error.message);
                        } else {
                            console.log('[PIPER] Audio enviado al cliente.');
                        }
                    });
                };

                const respuesta = await consultarGemma(
                    contextoGemma,
                    signal,
                    async (fragmento) => {
                        if (!vigente()) return;

                        respuestaCompleta += fragmento;
                        cola += fragmento;

                        while (vigente()) {
                            const coincidencia = cola.match(
                                /^([\s\S]*?[.!?]+)(?:\s+|$)/
                            );

                            if (!coincidencia) break;

                            const parte = coincidencia[1];

                            cola = cola.slice(
                                coincidencia[0].length
                            );

                            console.log('[GEMMA] Fragmento recibido.');

                            await procesarParte(parte);

                            if (!vigente()) return;
                        }
                    }
                );

                if (!vigente()) {
                    console.log('[VOZ] Solicitud cancelada durante Gemma o Piper.');
                    return;
                }

                if (cola.trim()) {
                    await procesarParte(cola);
                }

                if (!vigente()) return;

                const textoFinal = respuestaCompleta.trim() ||
                    (
                        typeof respuesta === 'string'
                            ? respuesta.trim()
                            : ''
                    );

                console.log('[GEMMA] Respuesta final:', JSON.stringify(textoFinal));

                if (!textoFinal) {
                    console.error('[GEMMA] No se recibió ninguna respuesta.');

                    enviarJSON({
                        tipo: 'error',
                        mensaje: 'Gemma no devolvió ninguna respuesta.'
                    });

                    return;
                }

                enviarJSON({
                    tipo: 'fin_respuesta'
                });

                console.log('[VOZ] Pipeline completado correctamente.');
                console.log('========== FIN DEL PIPELINE ==========\n');
            } catch (error) {
                if (
                    signal.aborted ||
                    error.message === 'PIPELINE_CANCELADO'
                ) {
                    console.log('[VOZ] Pipeline cancelado.');
                    return;
                }

                console.error('[VOZ] Error en el pipeline:', error);

                enviarJSON({
                    tipo: 'error',
                    mensaje: 'Ocurrió un error al procesar la consulta de voz.'
                });
            } finally {
                if (controladorActual === controller) {
                    controladorActual = null;
                }
            }
        };

        ws.on('message', (datos, esBinario) => {
            if (!esBinario) {
                let mensaje;

                try {
                    mensaje = JSON.parse(datos.toString());
                } catch (error) {
                    console.error('[WS] Error interpretando JSON:', error.message);

                    enviarJSON({
                        tipo: 'error',
                        mensaje: 'El mensaje recibido no es JSON válido.'
                    });

                    return;
                }

                console.log('[WS] Mensaje recibido:', mensaje.type);

                if (mensaje.type === 'iniciar_asistente') {
                    const id = Number(mensaje.usuarioId);
                    const nombre = typeof mensaje.nombre === 'string'
                        ? mensaje.nombre.trim().slice(0, 80)
                        : '';

                    if (
                        !Number.isSafeInteger(id) ||
                        id <= 0 ||
                        !nombre
                    ) {
                        console.error('[WS] Perfil recibido inválido.');

                        enviarJSON({
                            tipo: 'error',
                            mensaje: 'El perfil recibido no es válido. Volvé a seleccionar tu perfil.'
                        });

                        return;
                    }

                    usuarioIdActual = id;
                    nombreUsuarioActual = nombre;

                    console.log('[WS] Perfil seleccionado:', {
                        usuarioId: usuarioIdActual,
                        nombre: nombreUsuarioActual
                    });

                    procesarSaludo();
                    return;
                }

                if (mensaje.type === 'cancelar') {
                    console.log('[WS] Cancelación solicitada por el usuario.');

                    requestId++;
                    cancelarActual();

                    enviarJSON({
                        tipo: 'cancelado'
                    });

                    return;
                }

                console.warn('[WS] Tipo de mensaje no compatible:', mensaje.type);

                enviarJSON({
                    tipo: 'error',
                    mensaje: 'El tipo de mensaje recibido no es compatible.'
                });

                return;
            }

            const audioBuffer = Buffer.from(datos);

            if (audioBuffer.length === 0) {
                console.warn('[WS] Se recibió un audio vacío.');

                enviarJSON({
                    tipo: 'error',
                    mensaje: 'El audio recibido está vacío.'
                });

                return;
            }

            if (!usuarioIdActual) {
                console.error('[WS] Se recibió audio sin perfil seleccionado.');

                enviarJSON({
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

            console.log(`[WS] Audio recibido: ${audioBuffer.length} bytes.`);
            console.log(`[WS] Iniciando procesamiento de solicitud ${id}.`);

            procesarAudio(audioBuffer, id, controller);
        });

        ws.on('close', () => {
            console.log('[WS] Cliente desconectado.');

            requestId++;
            cancelarActual();
        });

        ws.on('error', (error) => {
            console.error('[WS] Error del WebSocket:', error.message);

            requestId++;
            cancelarActual();
        });
    });

    return wss;
};

module.exports = {
    registrarWebSocket
};