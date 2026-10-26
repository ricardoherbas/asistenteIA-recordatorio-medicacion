const net = require('net');

const PIPER_HOST = process.env.PIPER_HOST;
const PIPER_PORT = Number(process.env.PIPER_PORT);
const TIMEOUT_MS = Number(process.env.PIPER_TIMEOUT_MS || 15000);

function crearWav(pcmBuffer, sampleRate, canales, bitsPorMuestra) {
    const bytesPorMuestra = bitsPorMuestra / 8;
    const blockAlign = canales * bytesPorMuestra;
    const byteRate = sampleRate * blockAlign;
    const header = Buffer.alloc(44);

    header.write('RIFF', 0);
    header.writeUInt32LE(36 + pcmBuffer.length, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(canales, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(byteRate, 28);
    header.writeUInt16LE(blockAlign, 32);
    header.writeUInt16LE(bitsPorMuestra, 34);
    header.write('data', 36);
    header.writeUInt32LE(pcmBuffer.length, 40);

    return Buffer.concat([header, pcmBuffer]);
}

function convertirFloat32AInt16(buffer) {
    const cantidad = Math.floor(buffer.length / 4);
    const salida = Buffer.alloc(cantidad * 2);

    for (let i = 0; i < cantidad; i++) {
        const muestra = buffer.readFloatLE(i * 4);
        const limitada = Math.max(-1, Math.min(1, muestra));

        const valor = limitada < 0
            ? limitada * 32768
            : limitada * 32767;

        salida.writeInt16LE(Math.round(valor), i * 2);
    }

    return salida;
}

function sintetizarConPiper(texto, signal) {
    return new Promise((resolve, reject) => {
        if (typeof texto !== 'string' || !texto.trim()) {
            reject(new Error('El texto para sintetizar está vacío.'));
            return;
        }

        if (!PIPER_HOST || !PIPER_PORT) {
            reject(new Error('Falta configurar PIPER_HOST o PIPER_PORT.'));
            return;
        }

        if (signal?.aborted) {
            reject(new Error('La síntesis fue cancelada.'));
            return;
        }

        const cliente = new net.Socket();

        let bufferEntrada = Buffer.alloc(0);
        let eventoPendiente = null;
        let etapa = 'cabecera';
        let fragmentosAudio = [];

        let sampleRate = 22050;
        let canales = 1;
        let anchoMuestra = 2;
        let finalizado = false;
        let temporizador;

        function finalizar(error, resultado) {
            if (finalizado) {
                return;
            }

            finalizado = true;

            clearTimeout(temporizador);
            signal?.removeEventListener('abort', cancelar);
            cliente.destroy();

            if (error) {
                reject(error);
            } else {
                resolve(resultado);
            }
        }

        function cancelar() {
            finalizar(new Error('La síntesis fue cancelada.'));
        }

        function extraerLinea() {
            const indice = bufferEntrada.indexOf(0x0A);

            if (indice === -1) {
                return null;
            }

            const linea = bufferEntrada
                .subarray(0, indice)
                .toString('utf8')
                .replace(/\r$/, '');

            bufferEntrada = bufferEntrada.subarray(indice + 1);

            return linea;
        }

        function procesarEvento(mensaje, datos, payload) {
            mensaje.data = datos || {};

            if (mensaje.type === 'error') {
                finalizar(
                    new Error(
                        mensaje.data.text ||
                        'Piper devolvió un error de síntesis.'
                    )
                );
                return;
            }

            if (mensaje.type === 'audio-start') {
                sampleRate = Number(mensaje.data.rate || 22050);
                canales = Number(mensaje.data.channels || 1);
                anchoMuestra = Number(mensaje.data.width || 2);

                if (
                    !Number.isInteger(sampleRate) ||
                    sampleRate <= 0 ||
                    !Number.isInteger(canales) ||
                    canales <= 0 ||
                    ![2, 4].includes(anchoMuestra)
                ) {
                    finalizar(
                        new Error(
                            'Piper devolvió parámetros de audio inválidos.'
                        )
                    );
                }

                return;
            }

            if (mensaje.type === 'audio-chunk') {
                if (payload?.length) {
                    fragmentosAudio.push(payload);
                }

                return;
            }

            if (mensaje.type === 'audio-stop') {
                const audioOriginal = Buffer.concat(fragmentosAudio);

                if (audioOriginal.length === 0) {
                    finalizar(
                        new Error('Piper no devolvió muestras de audio.')
                    );
                    return;
                }

                let audioPCM;

                if (anchoMuestra === 4) {
                    if (audioOriginal.length % 4 !== 0) {
                        finalizar(
                            new Error(
                                'El audio Float32 de Piper tiene una longitud inválida.'
                            )
                        );
                        return;
                    }

                    audioPCM = convertirFloat32AInt16(audioOriginal);
                } else {
                    if (audioOriginal.length % 2 !== 0) {
                        finalizar(
                            new Error(
                                'El audio PCM16 de Piper tiene una longitud inválida.'
                            )
                        );
                        return;
                    }

                    audioPCM = audioOriginal;
                }

                const wav = crearWav(audioPCM, sampleRate, canales, 16);
                finalizar(null, wav);
            }
        }

        function procesarMensajes() {
            while (!finalizado) {
                if (etapa === 'cabecera') {
                    const linea = extraerLinea();

                    if (linea === null) {
                        return;
                    }

                    if (!linea.trim()) {
                        continue;
                    }

                    let mensaje;

                    try {
                        mensaje = JSON.parse(linea);
                    } catch {
                        finalizar(
                            new Error(
                                `Piper devolvió una cabecera Wyoming inválida: ${linea}`
                            )
                        );
                        return;
                    }

                    const longitudDatos = mensaje.data_length ?? 0;
                    const longitudPayload = mensaje.payload_length ?? 0;

                    if (
                        !Number.isSafeInteger(longitudDatos) ||
                        longitudDatos < 0 ||
                        !Number.isSafeInteger(longitudPayload) ||
                        longitudPayload < 0
                    ) {
                        finalizar(
                            new Error(
                                'Piper devolvió longitudes Wyoming inválidas.'
                            )
                        );
                        return;
                    }

                    eventoPendiente = {
                        mensaje,
                        longitudDatos,
                        longitudPayload,
                        datos: mensaje.data || {},
                        payload: Buffer.alloc(0)
                    };

                    if (longitudDatos > 0) {
                        etapa = 'datos';
                    } else if (longitudPayload > 0) {
                        etapa = 'payload';
                    } else {
                        etapa = 'procesar';
                    }

                    continue;
                }

                if (etapa === 'datos') {
                    const longitud = eventoPendiente.longitudDatos;

                    if (bufferEntrada.length < longitud) {
                        return;
                    }

                    const bytesDatos = bufferEntrada.subarray(0, longitud);
                    bufferEntrada = bufferEntrada.subarray(longitud);

                    try {
                        eventoPendiente.datos = JSON.parse(
                            bytesDatos.toString('utf8')
                        );
                    } catch {
                        finalizar(
                            new Error(
                                'Piper devolvió datos JSON inválidos.'
                            )
                        );
                        return;
                    }

                    etapa = eventoPendiente.longitudPayload > 0
                        ? 'payload'
                        : 'procesar';

                    continue;
                }

                if (etapa === 'payload') {
                    const longitud = eventoPendiente.longitudPayload;

                    if (bufferEntrada.length < longitud) {
                        return;
                    }

                    eventoPendiente.payload = bufferEntrada.subarray(
                        0,
                        longitud
                    );

                    bufferEntrada = bufferEntrada.subarray(longitud);
                    etapa = 'procesar';

                    continue;
                }

                if (etapa === 'procesar') {
                    const evento = eventoPendiente;

                    eventoPendiente = null;
                    etapa = 'cabecera';

                    procesarEvento(
                        evento.mensaje,
                        evento.datos,
                        evento.payload
                    );

                    continue;
                }

                finalizar(
                    new Error(`Estado Wyoming desconocido: ${etapa}`)
                );

                return;
            }
        }

        temporizador = setTimeout(() => {
            finalizar(
                new Error(
                    `Piper no respondió dentro de ${TIMEOUT_MS} ms.`
                )
            );
        }, TIMEOUT_MS);

        signal?.addEventListener('abort', cancelar, { once: true });

        cliente.on('connect', () => {
            const mensaje = {
                type: 'synthesize',
                data: {
                    text: texto.trim()
                }
            };

            cliente.write(`${JSON.stringify(mensaje)}\n`);
        });

        cliente.on('data', (datos) => {
            bufferEntrada = Buffer.concat([bufferEntrada, datos]);
            procesarMensajes();
        });

        cliente.on('error', (error) => {
            finalizar(
                new Error(`Error de conexión con Piper: ${error.message}`)
            );
        });

        cliente.on('close', () => {
            if (!finalizado) {
                finalizar(
                    new Error(
                        'Piper cerró la conexión antes de completar la síntesis.'
                    )
                );
            }
        });

        cliente.connect(PIPER_PORT, PIPER_HOST);
    });
}

module.exports = {
    sintetizarConPiper
};
