const pool = require('../config/conexion-db');

const generarTomasParaHorario = async (horarioId, dias = 7) => {
    const consulta = `
        INSERT INTO registro_tomas (
            horario_id,
            fecha_programada,
            hora_programada,
            estado
        )
        SELECT
            h.id,
            momento::date,
            momento::time,
            'pendiente'
        FROM horarios_medicacion AS h
        CROSS JOIN LATERAL generate_series(
            h.fecha_hora_inicio,
            LEAST(
                COALESCE(
                    h.fecha_hora_fin,
                    CURRENT_TIMESTAMP + ($2 * INTERVAL '1 day')
                ),
                CURRENT_TIMESTAMP + ($2 * INTERVAL '1 day')
            ),
            h.intervalo_horas * INTERVAL '1 hour'
        ) AS momento
        WHERE h.id = $1
          AND h.activo = TRUE
          AND momento >= CURRENT_TIMESTAMP
          AND (
              h.fecha_hora_fin IS NULL
              OR momento <= h.fecha_hora_fin
          )
        ON CONFLICT (horario_id, fecha_programada, hora_programada)
        DO NOTHING
        RETURNING
            id,
            horario_id,
            fecha_programada,
            hora_programada,
            estado;
    `;

    const resultado = await pool.query(consulta, [horarioId, dias]);

    return resultado.rows;
};

const obtenerTomasPorUsuario = async (usuarioId, dias = 7) => {
    const consulta = `
        SELECT
            rt.id,
            rt.horario_id,
            rt.fecha_programada,
            rt.hora_programada,
            rt.estado,
            rt.confirmada_en,
            rt.origen_confirmacion,
            m.id AS medicamento_id,
            m.nombre AS medicamento,
            m.dosis,
            h.intervalo_horas
        FROM registro_tomas AS rt
        INNER JOIN horarios_medicacion AS h
            ON h.id = rt.horario_id
        INNER JOIN medicamentos AS m
            ON m.id = h.medicamento_id
        WHERE m.usuario_id = $1
          AND m.activo = TRUE
          AND h.activo = TRUE
          AND rt.fecha_programada >= CURRENT_DATE
          AND rt.fecha_programada <= CURRENT_DATE + ($2::integer)
        ORDER BY
            rt.fecha_programada ASC,
            rt.hora_programada ASC;
    `;

    const resultado = await pool.query(consulta, [usuarioId, dias]);

    return resultado.rows;
};

const obtenerTomasPendientesPorUsuario = async (usuarioId) => {
    const consulta = `
        SELECT
            rt.id,
            rt.horario_id,
            rt.fecha_programada,
            rt.hora_programada,
            rt.estado,
            m.id AS medicamento_id,
            m.nombre AS medicamento,
            m.dosis
        FROM registro_tomas AS rt
        INNER JOIN horarios_medicacion AS h
            ON h.id = rt.horario_id
        INNER JOIN medicamentos AS m
            ON m.id = h.medicamento_id
        WHERE m.usuario_id = $1
          AND m.activo = TRUE
          AND h.activo = TRUE
          AND rt.estado = 'pendiente'
          AND rt.fecha_programada <= CURRENT_DATE
        ORDER BY
            rt.fecha_programada ASC,
            rt.hora_programada ASC;
    `;

    const resultado = await pool.query(consulta, [usuarioId]);

    return resultado.rows;
};

const obtenerMedicamentosPorUsuario = async (usuarioId) => {
    const consulta = `
        SELECT
            id,
            nombre,
            dosis,
            instrucciones,
            activo,
            creado_en
        FROM medicamentos
        WHERE usuario_id = $1
          AND activo = TRUE
        ORDER BY nombre ASC;
    `;

    const resultado = await pool.query(consulta, [usuarioId]);

    return resultado.rows;
};

const confirmarToma = async (tomaId, usuarioId, origen) => {
    const consulta = `
        UPDATE registro_tomas AS rt
        SET
            estado = 'confirmada',
            confirmada_en = CURRENT_TIMESTAMP,
            origen_confirmacion = $3
        FROM horarios_medicacion AS h
        INNER JOIN medicamentos AS m
            ON m.id = h.medicamento_id
        WHERE rt.id = $1
          AND rt.horario_id = h.id
          AND m.usuario_id = $2
          AND m.activo = TRUE
          AND h.activo = TRUE
          AND rt.estado = 'pendiente'
        RETURNING
            rt.id,
            rt.horario_id,
            rt.fecha_programada,
            rt.hora_programada,
            rt.estado,
            rt.confirmada_en,
            rt.origen_confirmacion;
    `;

    const resultado = await pool.query(consulta, [
        tomaId,
        usuarioId,
        origen
    ]);

    return resultado.rows[0] || null;
};

const marcarTomaSinConfirmacion = async (tomaId, usuarioId) => {
    const consulta = `
        UPDATE registro_tomas AS rt
        SET
            estado = 'sin_confirmacion',
            confirmada_en = NULL,
            origen_confirmacion = NULL
        FROM horarios_medicacion AS h
        INNER JOIN medicamentos AS m
            ON m.id = h.medicamento_id
        WHERE rt.id = $1
          AND rt.horario_id = h.id
          AND m.usuario_id = $2
          AND rt.estado = 'pendiente'
          AND (
              rt.fecha_programada < CURRENT_DATE
              OR (
                  rt.fecha_programada = CURRENT_DATE
                  AND rt.hora_programada < LOCALTIME
              )
          )
        RETURNING
            rt.id,
            rt.horario_id,
            rt.fecha_programada,
            rt.hora_programada,
            rt.estado;
    `;

    const resultado = await pool.query(consulta, [
        tomaId,
        usuarioId
    ]);

    return resultado.rows[0] || null;
};

module.exports = {
    generarTomasParaHorario,
    obtenerTomasPorUsuario,
    obtenerTomasPendientesPorUsuario,
    obtenerMedicamentosPorUsuario,
    confirmarToma,
    marcarTomaSinConfirmacion
};