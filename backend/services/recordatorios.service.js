const pool = require('../config/conexion-db');

const validarRecordatorioVoz = async (
    envioId,
    registroTomaId,
    usuarioId
) => {
    const consulta = `
        SELECT e.id
        FROM envios_alertas AS e
        INNER JOIN alertas AS a
            ON a.id = e.alerta_id
        INNER JOIN registro_tomas AS rt
            ON rt.id = a.registro_toma_id
        WHERE e.id = $1
          AND a.registro_toma_id = $2
          AND a.usuario_id = $3
          AND e.canal = 'voz'
          AND e.estado = 'pendiente'
          AND a.estado = 'pendiente'
          AND rt.estado = 'pendiente';
    `;

    const resultado = await pool.query(consulta, [
        envioId,
        registroTomaId,
        usuarioId
    ]);

    return resultado.rows.length > 0;
};

module.exports = {
    validarRecordatorioVoz
};