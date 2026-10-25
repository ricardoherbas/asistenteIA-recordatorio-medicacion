const axios = require('axios');

const OLLAMA_HOST = process.env.OLLAMA_HOST;
const GEMMA_MODEL = process.env.GEMMA_MODEL;
const GEMMA_TIMEOUT_MS = Number(process.env.GEMMA_TIMEOUT_MS);

const consultarGemma = async (prompt, signal, onFragment) => {
    if (typeof prompt !== 'string' || !prompt.trim()) {
        throw new Error('El prompt enviado a Gemma está vacío o no es válido.');
    }

    if (
        !OLLAMA_HOST ||
        !GEMMA_MODEL ||
        !Number.isFinite(GEMMA_TIMEOUT_MS) ||
        GEMMA_TIMEOUT_MS <= 0
    ) {
        throw new Error('La configuración de Gemma en .env no es válida.');
    }

    if (signal?.aborted) {
        throw new Error('PIPELINE_CANCELADO');
    }

    let respuestaCompleta = '';
    let buffer = '';

    try {
        const respuesta = await axios.post(
            `${OLLAMA_HOST}/api/generate`,
            {
                model: GEMMA_MODEL,
                prompt,
                stream: true,
                keep_alive: -1
            },
            {
                responseType: 'stream',
                timeout: GEMMA_TIMEOUT_MS,
                signal
            }
        );

        const flujo = respuesta.data;

        return await new Promise((resolve, reject) => {
            let finalizado = false;
            let procesando = false;
            let cola = [];
            let lineaFinalPendiente = false;

            const limpiar = () => {
                flujo.removeAllListeners();
                signal?.removeEventListener('abort', cancelar);
            };

            const finalizar = (error) => {
                if (finalizado) return;

                finalizado = true;
                limpiar();

                if (error) {
                    flujo.destroy();
                    reject(error);
                    return;
                }

                resolve(respuestaCompleta);
            };

            const procesarCola = async () => {
                if (procesando || finalizado) return;

                procesando = true;

                try {
                    while (cola.length > 0 && !finalizado) {
                        if (signal?.aborted) {
                            throw new Error('PIPELINE_CANCELADO');
                        }

                        const mensaje = cola.shift();

                        if (mensaje.error) {
                            throw new Error(`Error de Gemma: ${mensaje.error}`);
                        }

                        if (
                            typeof mensaje.response === 'string' &&
                            mensaje.response.length > 0
                        ) {
                            respuestaCompleta += mensaje.response;

                            if (typeof onFragment === 'function') {
                                await onFragment(mensaje.response);
                            }
                        }

                        if (mensaje.done) {
                            finalizar();
                            return;
                        }
                    }

                    if (lineaFinalPendiente && !finalizado) {
                        lineaFinalPendiente = false;
                        finalizar();
                    }
                } catch (error) {
                    finalizar(
                        signal?.aborted
                            ? new Error('PIPELINE_CANCELADO')
                            : error
                    );
                } finally {
                    procesando = false;

                    if (!finalizado && cola.length > 0) {
                        procesarCola();
                    }
                }
            };

            const recibirDatos = (datos) => {
                buffer += datos.toString('utf8');

                const lineas = buffer.split('\n');
                buffer = lineas.pop() || '';

                for (const linea of lineas) {
                    if (!linea.trim()) continue;

                    try {
                        cola.push(JSON.parse(linea));
                    } catch {
                        finalizar(
                            new Error('Ollama devolvió una respuesta JSON inválida.')
                        );
                        return;
                    }
                }

                procesarCola();
            };

            const cancelar = () => {
                finalizar(new Error('PIPELINE_CANCELADO'));
            };

            signal?.addEventListener('abort', cancelar, { once: true });

            flujo.on('data', recibirDatos);

            flujo.on('end', () => {
                if (buffer.trim()) {
                    try {
                        cola.push(JSON.parse(buffer));
                    } catch {
                        finalizar(
                            new Error(
                                'No se pudo interpretar la respuesta final de Gemma.'
                            )
                        );
                        return;
                    }
                }

                lineaFinalPendiente = true;
                procesarCola();
            });

            flujo.on('error', (error) => {
                if (signal?.aborted || error.code === 'ERR_CANCELED') {
                    finalizar(new Error('PIPELINE_CANCELADO'));
                    return;
                }

                finalizar(
                    new Error(
                        `Error durante la generación de Gemma: ${error.message}`
                    )
                );
            });

            flujo.on('close', () => {
                if (!finalizado) {
                    finalizar(
                        signal?.aborted
                            ? new Error('PIPELINE_CANCELADO')
                            : new Error(
                                'La conexión con Ollama se cerró antes de completar la respuesta.'
                            )
                    );
                }
            });
        });
    } catch (error) {
        if (signal?.aborted || error.code === 'ERR_CANCELED') {
            throw new Error('PIPELINE_CANCELADO');
        }

        if (error.response?.data?.error) {
            throw new Error(`Error de Gemma: ${error.response.data.error}`);
        }

        if (error.message?.startsWith('Error de Gemma:')) {
            throw error;
        }

        throw new Error(`No se pudo consultar Gemma: ${error.message}`);
    }
};

module.exports = {
    consultarGemma
};