
const {
    procesarEmailsPendientes,
    procesarPushPendientes
} = require('../services/envios.service');

const INTERVALO_REVISION_MS = 30 * 1000;

let procesando = false;

async function ejecutarEnvios() {
    if (procesando) return;

    procesando = true;

    try {
        await procesarEmailsPendientes();
        await procesarPushPendientes();
    } catch (error) {
        console.error('Error al procesar envíos:', error.message);
    } finally {
        procesando = false;
    }
}

function iniciarEnvios() {
    console.log('Iniciando procesamiento de envíos');

    ejecutarEnvios();

    return setInterval(ejecutarEnvios, INTERVALO_REVISION_MS);
}

module.exports = { iniciarEnvios };
