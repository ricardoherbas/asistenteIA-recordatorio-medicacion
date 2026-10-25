const net = require('net');

const WHISPER_HOST = process.env.WHISPER_HOST;
const WHISPER_PORT = Number(process.env.WHISPER_PORT);
const WHISPER_TIMEOUT_MS = Number(process.env.WHISPER_TIMEOUT_MS);

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

        let respuesta = '';
        let finalizado = false;
        let temporizador;

        const cliente = net.createConnection({
            host: WHISPER_HOST,
            port: WHISPER_PORT
        });

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

        signal?.addEventListener('abort', cancelar, { once: true });

        temporizador = setTimeout(() => {
            finalizar(
                new Error('Tiempo de espera agotado al consultar Whisper.')
            );
        }, WHISPER_TIMEOUT_MS);

        cliente.on('connect', () => {
            cliente.setNoDelay(true);

            const enviarMensaje = (mensaje) => {
                cliente.write(`${JSON.stringify(mensaje)}\n`);
            };

            enviarMensaje({
                type: 'transcribe',
                data: { language: 'es' }
            });

            enviarMensaje({
                type: 'audio-start',
                data: {
                    rate: 16000,
                    width: 2,
                    channels: 1
                }
            });

            enviarMensaje({
                type: 'audio-chunk',
                data: {
                    rate: 16000,
                    width: 2,
                    channels: 1,
                    timestamp: 0
                },
                payload_length: pcmBuffer.length
            });

            cliente.write(pcmBuffer);

            enviarMensaje({
                type: 'audio-stop'
            });
        });

        cliente.on('data', (datos) => {
            respuesta += datos.toString('utf8');

            const lineas = respuesta.split('\n');
            respuesta = lineas.pop() || '';

            for (const linea of lineas) {
                if (!linea.trim()) continue;

                let mensaje;

                try {
                    mensaje = JSON.parse(linea);
                } catch {
                    finalizar(
                        new Error(
                            'Whisper devolvió un mensaje Wyoming inválido.'
                        )
                    );
                    return;
                }

                if (mensaje.type === 'error') {
                    finalizar(
                        new Error(
                            mensaje.data?.text || 'Whisper informó un error.'
                        )
                    );
                    return;
                }

                if (
                    mensaje.type === 'transcript' ||
                    mensaje.type === 'transcription'
                ) {
                    const texto = mensaje.data?.text?.trim();

                    if (texto) {
                        finalizar(null, texto);
                        return;
                    }
                }
            }
        });

        cliente.on('error', (error) => {
            finalizar(
                new Error(
                    `Error de conexión con Whisper: ${error.message}`
                )
            );
        });

        cliente.on('end', () => {
            if (respuesta.trim()) {
                try {
                    const mensaje = JSON.parse(respuesta);

                    if (
                        mensaje.type === 'transcript' ||
                        mensaje.type === 'transcription'
                    ) {
                        const texto = mensaje.data?.text?.trim();

                        if (texto) {
                            finalizar(null, texto);
                            return;
                        }
                    }
                } catch {
                    // La respuesta final no contiene un mensaje JSON completo.
                }
            }

            finalizar(
                new Error(
                    'Whisper cerró la conexión sin una transcripción válida.'
                )
            );
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
