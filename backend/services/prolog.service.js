const axios = require('axios');

const PROLOG_HOST = process.env.PROLOG_HOST;
const PROLOG_PORT = Number(process.env.PROLOG_PORT);
const PROLOG_TIMEOUT_MS = Number(process.env.PROLOG_TIMEOUT_MS);

const consultarProlog = async (intencion) => {
    if (typeof intencion !== 'string' || !intencion.trim()) {
        throw new Error('La intención enviada a Prolog no es válida.');
    }

    if (
        !PROLOG_HOST ||
        !Number.isInteger(PROLOG_PORT) ||
        PROLOG_PORT <= 0 ||
        !Number.isFinite(PROLOG_TIMEOUT_MS) ||
        PROLOG_TIMEOUT_MS <= 0
    ) {
        throw new Error('La configuración de Prolog en .env no es válida.');
    }

    try {
        const respuesta = await axios.post(
            `${PROLOG_HOST}:${PROLOG_PORT}/consultar`,
            { intencion: intencion.trim() },
            {
                timeout: PROLOG_TIMEOUT_MS,
                headers: {
                    'Content-Type': 'application/json'
                }
            }
        );

        const { accion } = respuesta.data;

        if (typeof accion !== 'string' || !accion.trim()) {
            throw new Error('Prolog devolvió una acción inválida.');
        }

        return accion;
    } catch (error) {
        if (error.response) {
            throw new Error(
                `Prolog respondió con el estado HTTP ${error.response.status}.`
            );
        }

        if (error.code === 'ECONNABORTED') {
            throw new Error('Se agotó el tiempo de espera de Prolog.');
        }

        throw new Error(`No se pudo consultar Prolog: ${error.message}`);
    }
};

module.exports = {
    consultarProlog
};
