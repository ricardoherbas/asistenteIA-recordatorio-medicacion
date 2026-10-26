const net = require('net');

const WHISPER_HOST = process.env.WHISPER_HOST;
const WHISPER_PORT = Number(process.env.WHISPER_PORT);
const WHISPER_TIMEOUT_MS =
    Number(process.env.WHISPER_TIMEOUT_MS) || 30000;

const transcribirConWhisper = (pcmBuffer, signal) => {
    return new Promise((resolve, reject) => {
        if (!Buffer.isBuffer(pcmBuffer) || pcmBuffer.length === 0) {
            reject(new Error('El audio recibido está vacío o no es válido.'));
            return;
        }

        if (pcmBuffer.length % 2 !== 0) {
            reject(
                new Error(
                    'El audio PCM debe contener muestras de 16 bits completas.'
                )
            );
            return;
        }

        if (signal?.aborted) {
            reject(new Error('PIPELINE_CANCELADO'));
            return;
        }

        if (
            !WHISPER_HOST ||
            !Number.isInteger(WHISPER_PORT) ||
            WHISPER_PORT <= 0
        ) {
            reject(
                new Error(
                    'La configuración de conexión con Whisper no es válida.'
                )
            );
            return;
        }

        const cliente = net.createConnection({
            host: WHISPER_HOST,
            port: WHISPER_PORT
        });

        let bufferEntrada = Buffer.alloc(0);
        let etapa = 'cabecera';
        let mensajePendiente = null;
        let datosPendientes = null;
        let finalizado = false;
        let temporizador;

        const finalizar = (error, texto) => {
            if (finalizado) return;

            finalizado = true;
            clearTimeout(temporizador);
            signal?.removeEventListener('abort', cancelar);
            cliente.destroy();

            if (error) {
                reject(error);
                return;
            }

            resolve(texto);
        };

        const cancelar = () => {
            finalizar(new Error('PIPELINE_CANCELADO'));
        };

        const extraerLinea = () => {
            const indice = bufferEntrada.indexOf(0x0A);

            if (indice === -1) return null;

            const linea = bufferEntrada
                .subarray(0, indice)
                .toString('utf8')
                .replace(/\r$/, '');

            bufferEntrada = bufferEntrada.subarray(indice + 1);

            return linea;
        };

        const validarLongitud = (valor, nombre) => {
            const longitud = Number(valor ?? 0);

            if (
                !Number.isSafeInteger(longitud) ||
                longitud < 0
            ) {
                throw new Error(
                    `Whisper devolvió una longitud ${nombre} inválida.`
                );
            }

            return longitud;
        };

        const procesarEvento = (mensaje) => {
            const datos = mensaje.data || datosPendientes || {};

            if (mensaje.type === 'error') {
                const detalle =
                    datos.text ||
                    'Whisper informó un error de transcripción.';

                finalizar(new Error(detalle));
                return;
            }

            if (
                mensaje.type === 'transcript' ||
                mensaje.type === 'transcription'
            ) {
                const texto = datos.text;

                if (typeof texto === 'string' && texto.trim()) {
                    finalizar(null, texto.trim());
                    return;
                }

                finalizar(
                    new Error(
                        'Whisper devolvió un evento de transcripción sin texto.'
                    )
                );
                return;
            }

            mensajePendiente = null;
            datosPendientes = null;
            etapa = 'cabecera';
        };

        const procesarMensajes = () => {
            while (!finalizado) {
                try {
                    if (etapa === 'cabecera') {
                        const linea = extraerLinea();

                        if (linea === null) return;
                        if (!linea.trim()) continue;

                        try {
                            mensajePendiente = JSON.parse(linea);
                        } catch {
                            throw new Error(
                                `Whisper devolvió un encabezado Wyoming inválido: ${linea.slice(0, 200)}`
                            );
                        }

                        mensajePendiente.data_length = validarLongitud(
                            mensajePendiente.data_length,
                            'data_length'
                        );

                        mensajePendiente.payload_length = validarLongitud(
                            mensajePendiente.payload_length,
                            'payload_length'
                        );

                        datosPendientes = mensajePendiente.data || {};

                        if (mensajePendiente.data_length > 0) {
                            etapa = 'datos';
                        } else if (mensajePendiente.payload_length > 0) {
                            etapa = 'payload';
                        } else {
                            procesarEvento(mensajePendiente);
                        }

                        continue;
                    }

                    if (etapa === 'datos') {
                        const longitud = mensajePendiente.data_length;

                        if (bufferEntrada.length < longitud) return;

                        const bytesDatos = bufferEntrada.subarray(
                            0,
                            longitud
                        );

                        bufferEntrada = bufferEntrada.subarray(longitud);

                        try {
                            datosPendientes = JSON.parse(
                                bytesDatos.toString('utf8')
                            );
                        } catch {
                            throw new Error(
                                'Whisper devolvió datos JSON inválidos.'
                            );
                        }

                        mensajePendiente.data = {
                            ...(mensajePendiente.data || {}),
                            ...datosPendientes
                        };

                        datosPendientes = mensajePendiente.data;

                        if (mensajePendiente.payload_length > 0) {
                            etapa = 'payload';
                        } else {
                            procesarEvento(mensajePendiente);
                        }

                        continue;
                    }

                    if (etapa === 'payload') {
                        const longitud = mensajePendiente.payload_length;

                        if (bufferEntrada.length < longitud) return;

                        const payload = bufferEntrada.subarray(
                            0,
                            longitud
                        );

                        bufferEntrada = bufferEntrada.subarray(longitud);

                        void payload;

                        procesarEvento(mensajePendiente);
                        continue;
                    }

                    return;
                } catch (error) {
                    finalizar(error);
                    return;
                }
            }
        };

        const enviarMensaje = (tipo, data = {}, payload = null) => {
            const datosJSON = Buffer.from(
                JSON.stringify(data),
                'utf8'
            );

            const longitudDatos =
                Object.keys(data).length > 0 ? datosJSON.length : 0;

            const longitudPayload = payload?.length || 0;

            const cabecera = {
                type: tipo,
                data_length: longitudDatos,
                payload_length: longitudPayload
            };

            cliente.write(`${JSON.stringify(cabecera)}\n`);

            if (longitudDatos > 0) {
                cliente.write(datosJSON);
            }

            if (longitudPayload > 0) {
                cliente.write(payload);
            }
        };

        signal?.addEventListener('abort', cancelar, { once: true });

        temporizador = setTimeout(() => {
            finalizar(
                new Error('Tiempo de espera agotado al consultar Whisper.')
            );
        }, WHISPER_TIMEOUT_MS);

        cliente.on('connect', () => {
            cliente.setNoDelay(true);

            enviarMensaje('transcribe', {
                language: 'es'
            });

            enviarMensaje('audio-start', {
                rate: 16000,
                width: 2,
                channels: 1
            });

            enviarMensaje(
                'audio-chunk',
                {
                    rate: 16000,
                    width: 2,
                    channels: 1,
                    timestamp: 0
                },
                pcmBuffer
            );

            enviarMensaje('audio-stop');
        });

        cliente.on('data', (datos) => {
            bufferEntrada = Buffer.concat([bufferEntrada, datos]);
            procesarMensajes();
        });

        cliente.on('error', (error) => {
            finalizar(
                new Error(`Error de conexión con Whisper: ${error.message}`)
            );
        });

        cliente.on('end', () => {
            if (!finalizado) {
                finalizar(
                    new Error(
                        'Whisper cerró la conexión sin una transcripción válida.'
                    )
                );
            }
        });

        cliente.on('close', () => {
            if (!finalizado) {
                finalizar(
                    new Error(
                        'La conexión con Whisper se cerró inesperadamente.'
                    )
                );
            }
        });
    });
};

module.exports = {
    transcribirConWhisper
};