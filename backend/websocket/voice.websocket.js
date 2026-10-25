
const WebSocket = require('ws');
const { transcribirConWhisper } = require('../services/whisper.service');
const { analizarIntencion } = require('../services/intencion.service');
const { consultarProlog } = require('../services/prolog.service');
const { consultarGemma } = require('../services/gemma.service');
const { sintetizarConPiper } = require('../services/piper.service');

const registrarWebSocket = (servidor) => {
    const wss = new WebSocket.Server({ server: servidor, path: '/ws' });

    wss.on('connection', (ws) => {
        console.log('Cliente conectado al WebSocket.');

        let requestId = 0;
        let controladorActual = null;
        let saludoSolicitado = false;

        const enviarJSON = (mensaje) => {
            if (ws.readyState !== WebSocket.OPEN) return false;

            ws.send(JSON.stringify(mensaje), (error) => {
                if (error) console.error('Error enviando mensaje JSON:', error.message);
            });

            return true;
        };

        const cancelarActual = () => {
            if (!controladorActual) return;
            controladorActual.abort();
            controladorActual = null;
        };

        const solicitudVigente = (id, signal) => !signal.aborted && id === requestId && ws.readyState === WebSocket.OPEN;

        const procesarSaludo = async (nombre) => {
            if (saludoSolicitado) return;
            saludoSolicitado = true;

            requestId++;
            cancelarActual();

            const id = requestId;
            const controller = new AbortController();
            controladorActual = controller;
            const signal = controller.signal;

            const nombreSeguro = typeof nombre === 'string' ? nombre.trim().slice(0, 80) : '';
            const nombreSaludo = nombreSeguro || 'qué bueno tenerte aquí';
            const texto = `¡Hola, ${nombreSaludo}! 😊 Estoy acá para ayudarte con tus medicamentos y recordatorios. ¡Vamos paso a paso, cuidarte es importante!`;
            const textoParaVoz = texto.replace('😊', '');

            try {
                const audio = await sintetizarConPiper(textoParaVoz, signal);
                if (!solicitudVigente(id, signal)) return;

                enviarJSON({ tipo: 'saludo', texto });

                ws.send(audio, { binary: true }, (error) => {
                    if (error) console.error('Error enviando el audio del saludo:', error.message);
                });

                enviarJSON({ tipo: 'fin_saludo' });
                console.log('Saludo inicial enviado.');
            } catch (error) {
                if (signal.aborted || error.message === 'PIPELINE_CANCELADO') return;

                console.error('Error al generar el saludo:', error);
                enviarJSON({ tipo: 'error', mensaje: 'No se pudo generar el saludo inicial.' });
            } finally {
                if (controladorActual === controller) controladorActual = null;
            }
        };

        const procesarAudio = async (audioBuffer, id, controller) => {
            const signal = controller.signal;
            const vigente = () => solicitudVigente(id, signal);

            try {
                console.log('Enviando audio a Whisper...');

                const transcripcion = await transcribirConWhisper(audioBuffer, signal);
                if (!vigente()) return;

                const textoUsuario = transcripcion.trim();

                if (!textoUsuario) {
                    enviarJSON({ tipo: 'error', mensaje: 'No se pudo reconocer el audio.' });
                    return;
                }

                enviarJSON({ tipo: 'transcripcion', texto: textoUsuario });

                const analisis = analizarIntencion(textoUsuario);
                if (!vigente()) return;

                console.log('Intención detectada:', analisis.intencion);
                enviarJSON({ tipo: 'intencion', intencion: analisis.intencion, datos: analisis.datos });

                const accion = await consultarProlog(analisis.intencion);
                if (!vigente()) return;

                console.log('Acción determinada por Prolog:', accion);
                enviarJSON({ tipo: 'accion', accion });

                const contextoGemma = [
                    'Sos un asistente de voz para recordatorios de medicación.',
                    'Respondé en español, con frases claras y breves.',
                    'No afirmes que una dosis fue registrada, tomada o modificada si esa operación no se ejecutó realmente.',
                    'Detectá ambigüedades y pedí aclaraciones cuando corresponda.',
                    'Si el usuario dice que no tomó la medicación, no afirmes que la tomó.',
                    `Texto reconocido del usuario: "${textoUsuario}"`,
                    `Intención detectada: ${analisis.intencion}`,
                    `Datos extraídos: ${JSON.stringify(analisis.datos)}`,
                    `Acción determinada por Prolog: ${JSON.stringify(accion)}`
                ].join('\n');

                let respuestaCompleta = '';
                let cola = '';

                const procesarParte = async (parte) => {
                    if (!vigente()) return;

                    const texto = parte.trim();
                    if (!texto) return;

                    const audio = await sintetizarConPiper(texto, signal);
                    if (!vigente()) return;

                    enviarJSON({ tipo: 'respuesta', texto });
                    if (!vigente()) return;

                    ws.send(audio, { binary: true }, (error) => {
                        if (error) console.error('Error enviando audio:', error.message);
                    });
                };

                console.log('Gemma está generando una respuesta...');

                const respuesta = await consultarGemma(contextoGemma, signal, async (fragmento) => {
                    if (!vigente()) return;

                    respuestaCompleta += fragmento;
                    cola += fragmento;

                    while (vigente()) {
                        const coincidencia = cola.match(/^([\s\S]*?[.!?]+)(?:\s+|$)/);
                        if (!coincidencia) break;

                        const parte = coincidencia[1];
                        cola = cola.slice(coincidencia[0].length);

                        await procesarParte(parte);
                        if (!vigente()) return;
                    }
                });

                if (!vigente()) return;
                if (cola.trim()) await procesarParte(cola);
                if (!vigente()) return;

                const textoFinal = respuestaCompleta.trim() || (typeof respuesta === 'string' ? respuesta.trim() : '');

                if (!textoFinal) {
                    enviarJSON({ tipo: 'error', mensaje: 'Gemma no devolvió ninguna respuesta.' });
                    return;
                }

                enviarJSON({ tipo: 'fin_respuesta' });
                console.log('Respuesta de Gemma procesada.');
            } catch (error) {
                if (signal.aborted || error.message === 'PIPELINE_CANCELADO') return;

                console.error('Error en el pipeline de voz:', error);
                enviarJSON({ tipo: 'error', mensaje: 'Ocurrió un error al procesar la consulta de voz.' });
            } finally {
                if (controladorActual === controller) controladorActual = null;
            }
        };

        ws.on('message', (datos, esBinario) => {
            if (!esBinario) {
                let mensaje;

                try {
                    mensaje = JSON.parse(datos.toString());
                } catch {
                    enviarJSON({ tipo: 'error', mensaje: 'El mensaje recibido no es JSON válido.' });
                    return;
                }

                if (mensaje.type === 'iniciar_asistente') {
                    procesarSaludo(mensaje.nombre);
                    return;
                }

                if (mensaje.type === 'cancelar') {
                    console.log('Cancelación solicitada por el usuario.');
                    requestId++;
                    cancelarActual();
                }

                return;
            }

            const audioBuffer = Buffer.from(datos);

            if (audioBuffer.length === 0) {
                enviarJSON({ tipo: 'error', mensaje: 'El audio recibido está vacío.' });
                return;
            }

            requestId++;
            cancelarActual();

            const controller = new AbortController();
            controladorActual = controller;

            console.log(`Audio recibido: ${audioBuffer.length} bytes.`);
            procesarAudio(audioBuffer, requestId, controller);
        });

        ws.on('close', () => {
            console.log('Cliente desconectado del WebSocket.');
            requestId++;
            cancelarActual();
        });

        ws.on('error', (error) => {
            console.error('Error en WebSocket:', error.message);
            requestId++;
            cancelarActual();
        });
    });

    return wss;
};

module.exports = { registrarWebSocket };
