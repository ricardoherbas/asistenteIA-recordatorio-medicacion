
const { procesarHorarios } = require('../services/horarios.service');

const INTERVALO_REVISION_MS = 30 * 1000;

let procesando = false;

async function ejecutarRecordatorios() {
    if (procesando) {
        console.log('Ya hay una revisión de recordatorios en ejecución');
        return;
    }

    procesando = true;

    try {
        await procesarHorarios();
    } catch (error) {
        console.error(
            'Error al procesar recordatorios:',
            error.message
        );
    } finally {
        procesando = false;
    }
}

function iniciarRecordatorios() {
    console.log('Iniciando revisión automática de recordatorios');

    ejecutarRecordatorios();

    return setInterval(
        ejecutarRecordatorios,
        INTERVALO_REVISION_MS
    );
}

module.exports = {
    ejecutarRecordatorios,
    iniciarRecordatorios
};
