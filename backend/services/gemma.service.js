
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
                keep_alive: -1,
                options: {
                    temperature: 0.2,
                    num_predict: 120
                }
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
            let flujoTerminado = false;
            const cola = [];

            const limpiar = () => {
                flujo.removeListener('data', recibirDatos);
                flujo.removeListener('end', alFinalizarFlujo);
                flujo.removeListener('error', alOcurrirError);
                flujo.removeListener('close', alCerrarFlujo);
                signal?.removeEventListener('abort', cancelar);
            };

            const finalizar = (error) => {
                if (finalizado) return;

                finalizado = true;
                limpiar();

                if (error) {
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

                        if (mensaje.done === true) {
                            finalizar();
                            return;
                        }
                    }

                    if (flujoTerminado && !finalizado) {
                        if (buffer.trim()) {
                            throw new Error(
                                'Ollama terminó el flujo con datos JSON incompletos.'
                            );
                        }

                        throw new Error(
                            'Ollama terminó el flujo sin enviar done: true.'
                        );
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
                    } else if (!finalizado && flujoTerminado) {
                        procesarCola();
                    }
                }
            };

            const recibirDatos = (datos) => {
                if (finalizado) return;

                buffer += datos.toString('utf8');

                const lineas = buffer.split('\n');
                buffer = lineas.pop() || '';

                for (const linea of lineas) {
                    if (!linea.trim()) continue;

                    try {
                        cola.push(JSON.parse(linea));
                    } catch {
                        finalizar(
                            new Error(
                                'Ollama devolvió una respuesta JSON inválida.'
                            )
                        );
                        return;
                    }
                }

                procesarCola();
            };

            const alFinalizarFlujo = () => {
                if (finalizado) return;

                if (buffer.trim()) {
                    try {
                        cola.push(JSON.parse(buffer));
                        buffer = '';
                    } catch {
                        finalizar(
                            new Error(
                                'No se pudo interpretar la respuesta final de Gemma.'
                            )
                        );
                        return;
                    }
                }

                flujoTerminado = true;
                procesarCola();
            };

            const cancelar = () => {
                finalizar(new Error('PIPELINE_CANCELADO'));
                flujo.destroy();
            };

            const alOcurrirError = (error) => {
                if (finalizado) return;

                if (signal?.aborted || error.code === 'ERR_CANCELED') {
                    finalizar(new Error('PIPELINE_CANCELADO'));
                    return;
                }

                finalizar(
                    new Error(
                        `Error durante la generación de Gemma: ${error.message}`
                    )
                );
            };

            const alCerrarFlujo = () => {
                if (finalizado || flujoTerminado) return;

                finalizar(
                    signal?.aborted
                        ? new Error('PIPELINE_CANCELADO')
                        : new Error(
                            'La conexión con Ollama se cerró antes de completar la respuesta.'
                        )
                );
            };

            signal?.addEventListener('abort', cancelar, { once: true });

            flujo.on('data', recibirDatos);
            flujo.on('end', alFinalizarFlujo);
            flujo.on('error', alOcurrirError);
            flujo.on('close', alCerrarFlujo);
        });
    } catch (error) {
        if (signal?.aborted || error.code === 'ERR_CANCELED') {
            throw new Error('PIPELINE_CANCELADO');
        }

        if (error.message?.startsWith('Error de Gemma:')) {
            throw error;
        }

        if (error.response?.data?.error) {
            throw new Error(`Error de Gemma: ${error.response.data.error}`);
        }

        throw new Error(`No se pudo consultar Gemma: ${error.message}`);
    }
};

module.exports = {
    consultarGemma
};
