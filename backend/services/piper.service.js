
const net = require('net');

const PIPER_HOST = process.env.PIPER_HOST;
const PIPER_PORT = Number(process.env.PIPER_PORT);
const PIPER_TIMEOUT_MS = Number(process.env.PIPER_TIMEOUT_MS);

const convertirFloat32AInt16 = (buffer) => {
    if (buffer.length % 4 !== 0) {
        throw new Error('El audio Float32 recibido de Piper no es válido.');
    }

    const resultado = Buffer.alloc(buffer.length / 2);

    for (let i = 0; i < buffer.length; i += 4) {
        const muestra = buffer.readFloatLE(i);
        const normalizada = Math.max(-1, Math.min(1, muestra));
        const valor = normalizada < 0
            ? normalizada * 32768
            : normalizada * 32767;

        resultado.writeInt16LE(Math.round(valor), i / 2);
    }

    return resultado;
};

const crearWav = (pcmBuffer, sampleRate, canales, bitsPorMuestra) => {
    const bytesPorMuestra = bitsPorMuestra / 8;
    const bytesPorSegundo = sampleRate * canales * bytesPorMuestra;
    const tamanoCabecera = 44;

    const cabecera = Buffer.alloc(tamanoCabecera);

    cabecera.write('RIFF', 0);
    cabecera.writeUInt32LE(36 + pcmBuffer.length, 4);
    cabecera.write('WAVE', 8);
    cabecera.write('fmt ', 12);
    cabecera.writeUInt32LE(16, 16);
    cabecera.writeUInt16LE(1, 20);
    cabecera.writeUInt16LE(canales, 22);
    cabecera.writeUInt32LE(sampleRate, 24);
    cabecera.writeUInt32LE(bytesPorSegundo, 28);
    cabecera.writeUInt16LE(canales * bytesPorMuestra, 32);
    cabecera.writeUInt16LE(bitsPorMuestra, 34);
    cabecera.write('data', 36);
    cabecera.writeUInt32LE(pcmBuffer.length, 40);

    return Buffer.concat([cabecera, pcmBuffer]);
};

const sintetizarConPiper = (texto, signal) => {
    return new Promise((resolve, reject) => {
        if (typeof texto !== 'string' || !texto.trim()) {
            reject(new Error('El texto enviado a Piper está vacío o no es válido.'));
            return;
        }

        if (signal?.aborted) {
            reject(new Error('PIPELINE_CANCELADO'));
            return;
        }

        if (!PIPER_HOST || !Number.isInteger(PIPER_PORT) || PIPER_PORT <= 0) {
            reject(new Error('La configuración de conexión con Piper no es válida.'));
            return;
        }

        const cliente = net.createConnection({
            host: PIPER_HOST,
            port: PIPER_PORT
        });

        const textoBuffer = Buffer.from(texto.trim(), 'utf8');
        const fragmentosAudio = [];

        let bufferEntrada = Buffer.alloc(0);
        let sampleRate = 22050;
        let canales = 1;
        let anchoMuestra = 2;
        let finalizado = false;
        let temporizador;

        const finalizar = (error, audio) => {
            if (finalizado) return;

            finalizado = true;
            clearTimeout(temporizador);
            signal?.removeEventListener('abort', cancelar);
            cliente.destroy();

            if (error) {
                reject(error);
                return;
            }

            resolve(audio);
        };

        const cancelar = () => {
            finalizar(new Error('PIPELINE_CANCELADO'));
        };

        const procesarMensajes = () => {
            while (!finalizado) {
                const finCabecera = bufferEntrada.indexOf('\n');

                if (finCabecera === -1) return;

                let mensaje;

                try {
                    mensaje = JSON.parse(
                        bufferEntrada.subarray(0, finCabecera).toString('utf8')
                    );
                } catch {
                    finalizar(new Error('Piper devolvió un encabezado Wyoming inválido.'));
                    return;
                }

                const longitudPayload = Number(mensaje.payload_length || 0);

                if (!Number.isInteger(longitudPayload) || longitudPayload < 0) {
                    finalizar(new Error('Piper devolvió una longitud de audio inválida.'));
                    return;
                }

                const inicioPayload = finCabecera + 1;
                const finPayload = inicioPayload + longitudPayload;

                if (bufferEntrada.length < finPayload) return;

                const payload = bufferEntrada.subarray(inicioPayload, finPayload);

                bufferEntrada = bufferEntrada.subarray(finPayload);

                if (mensaje.type === 'error') {
                    finalizar(new Error(
                        mensaje.data?.text || 'Piper informó un error de síntesis.'
                    ));
                    return;
                }

                if (mensaje.type === 'audio-start') {
                    sampleRate = Number(mensaje.data?.rate || sampleRate);
                    canales = Number(mensaje.data?.channels || canales);
                    anchoMuestra = Number(mensaje.data?.width || anchoMuestra);

                    if (
                        !Number.isInteger(sampleRate) ||
                        sampleRate <= 0 ||
                        !Number.isInteger(canales) ||
                        canales <= 0 ||
                        ![2, 4].includes(anchoMuestra)
                    ) {
                        finalizar(new Error('Piper devolvió un formato de audio no compatible.'));
                        return;
                    }
                }

                if (mensaje.type === 'audio-chunk' && payload.length > 0) {
                    fragmentosAudio.push(Buffer.from(payload));
                }

                if (mensaje.type === 'audio-stop') {
                    const audioPCM = Buffer.concat(fragmentosAudio);

                    if (audioPCM.length === 0) {
                        finalizar(new Error('Piper no generó audio.'));
                        return;
                    }

                    if (anchoMuestra === 4) {
                        const audioInt16 = convertirFloat32AInt16(audioPCM);

                        finalizar(
                            null,
                            crearWav(audioInt16, sampleRate, canales, 16)
                        );
                        return;
                    }

                    if (audioPCM.length % 2 !== 0) {
                        finalizar(new Error('Piper devolvió audio PCM incompleto.'));
                        return;
                    }

                    finalizar(
                        null,
                        crearWav(audioPCM, sampleRate, canales, 16)
                    );
                    return;
                }
            }
        };

        signal?.addEventListener('abort', cancelar, { once: true });

        temporizador = setTimeout(() => {
            finalizar(new Error('Tiempo de espera agotado al consultar Piper.'));
        }, PIPER_TIMEOUT_MS);

        cliente.on('connect', () => {
            cliente.setNoDelay(true);

            cliente.write(
                `${JSON.stringify({
                    type: 'synthesize',
                    data: { text: texto.trim() },
                    payload_length: textoBuffer.length
                })}\n`
            );

            cliente.write(textoBuffer);
        });

        cliente.on('data', (datos) => {
            bufferEntrada = Buffer.concat([bufferEntrada, datos]);
            procesarMensajes();
        });

        cliente.on('error', (error) => {
            if (signal?.aborted) {
                finalizar(new Error('PIPELINE_CANCELADO'));
                return;
            }

            finalizar(new Error(`Error de conexión con Piper: ${error.message}`));
        });

        cliente.on('end', () => {
            if (!finalizado) {
                finalizar(new Error('Piper cerró la conexión sin completar el audio.'));
            }
        });

        cliente.on('close', () => {
            if (!finalizado) {
                finalizar(new Error('La conexión con Piper se cerró inesperadamente.'));
            }
        });
    });
};

module.exports = {
    sintetizarConPiper
};
