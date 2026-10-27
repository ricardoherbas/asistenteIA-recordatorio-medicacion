
const pool = require('../config/conexion-db');

async function crearAlerta(horario, registroToma, fechaHora) {
    const mensaje = `Es hora de tomar ${horario.medicamento}, dosis: ${horario.dosis}.`;

    const resultado = await pool.query(`
        INSERT INTO alertas (
            usuario_id,
            registro_toma_id,
            tipo,
            mensaje,
            programada_en
        )
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (registro_toma_id, tipo)
        DO NOTHING
        RETURNING id
    `, [
        horario.usuario_id,
        registroToma.id,
        'recordatorio_medicacion',
        mensaje,
        fechaHora.toISOString()
    ]);

    return resultado.rows[0] || null;
}

async function crearCanalesEnvio(alertaId) {
    await pool.query(`
        INSERT INTO envios_alertas (
            alerta_id,
            canal
        )
        VALUES
            ($1, 'email'),
            ($1, 'push')
        ON CONFLICT (alerta_id, canal)
        DO NOTHING
    `, [alertaId]);
}

module.exports = {
    crearAlerta,
    crearCanalesEnvio
};
