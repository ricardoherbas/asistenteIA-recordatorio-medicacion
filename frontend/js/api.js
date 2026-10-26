/* =========================================
   Cliente HTTP para el backend
========================================= */

(() => {
    'use strict';

    const config = window.APP_CONFIG;

    if (!config?.API_BASE_URL) {
        throw new Error('No se encontró la configuración del backend.');
    }

    const solicitar = async (ruta, opciones = {}) => {
        const controlador = new AbortController();

        const temporizador = setTimeout(
            () => controlador.abort(),
            config.TIMEOUT_MS
        );

        try {
            const respuesta = await fetch(
                `${config.API_BASE_URL}${ruta}`,
                {
                    ...opciones,
                    signal: controlador.signal,
                    headers: {
                        'Content-Type': 'application/json',
                        ...opciones.headers
                    }
                }
            );

            const contenido = await respuesta.text();
            let datos = null;

            if (contenido) {
                try {
                    datos = JSON.parse(contenido);
                } catch {
                    throw new Error(
                        'El servidor devolvió una respuesta inválida.'
                    );
                }
            }

            if (!respuesta.ok) {
                throw new Error(
                    datos?.mensaje ||
                    datos?.error ||
                    `Error del servidor: HTTP ${respuesta.status}.`
                );
            }

            return datos;
        } catch (error) {
            if (error.name === 'AbortError') {
                throw new Error(
                    'Se agotó el tiempo de espera del servidor.'
                );
            }

            if (error instanceof TypeError) {
                throw new Error(
                    'No se pudo conectar con el backend.'
                );
            }

            throw error;
        } finally {
            clearTimeout(temporizador);
        }
    };

    window.API = Object.freeze({
        get: (ruta) => solicitar(ruta),

        post: (ruta, datos) => solicitar(ruta, {
            method: 'POST',
            body: JSON.stringify(datos)
        }),

        put: (ruta, datos) => solicitar(ruta, {
            method: 'PUT',
            body: JSON.stringify(datos)
        }),

        patch: (ruta, datos) => solicitar(ruta, {
            method: 'PATCH',
            body: JSON.stringify(datos)
        }),

        delete: (ruta) => solicitar(ruta, {
            method: 'DELETE'
        })
    });
})();