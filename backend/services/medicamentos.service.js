const pool = require('../config/conexion-db');

const crearMedicamento = async ({
    usuarioId,
    nombre,
    dosis,
    observaciones,
    fechaHoraInicio,
    intervaloHoras,
    fechaHoraFin
}) => {
    const conexion = await pool.connect();

    try {
        await conexion.query('BEGIN');

        const consultaMedicamento = `
            INSERT INTO medicamentos (
                usuario_id,
                nombre,
                dosis,
                instrucciones
            )
            VALUES ($1, $2, $3, $4)
            RETURNING
                id,
                usuario_id,
                nombre,
                dosis,
                instrucciones,
                activo,
                creado_en;
        `;

        const valoresMedicamento = [
            usuarioId,
            nombre,
            dosis,
            observaciones || null
        ];

        const resultadoMedicamento = await conexion.query(
            consultaMedicamento,
            valoresMedicamento
        );

        const medicamento = resultadoMedicamento.rows[0];

        const consultaHorario = `
            INSERT INTO horarios_medicacion (
                medicamento_id,
                fecha_hora_inicio,
                intervalo_horas,
                fecha_hora_fin
            )
            VALUES ($1, $2, $3, $4)
            RETURNING
                id,
                medicamento_id,
                fecha_hora_inicio,
                intervalo_horas,
                fecha_hora_fin,
                activo,
                creado_en;
        `;

        const valoresHorario = [
            medicamento.id,
            fechaHoraInicio,
            intervaloHoras,
            fechaHoraFin || null
        ];

        const resultadoHorario = await conexion.query(
            consultaHorario,
            valoresHorario
        );

        await conexion.query('COMMIT');

        return {
            ...medicamento,
            horario: resultadoHorario.rows[0]
        };
    } catch (error) {
        await conexion.query('ROLLBACK');
        throw error;
    } finally {
        conexion.release();
    }
};

const obtenerMedicamentosPorUsuario = async (usuarioId) => {
    const consulta = `
        SELECT
            m.id,
            m.usuario_id,
            m.nombre,
            m.dosis,
            m.instrucciones AS observaciones,
            m.activo,
            m.creado_en,
            h.id AS horario_id,
            h.fecha_hora_inicio,
            h.intervalo_horas,
            h.fecha_hora_fin,
            h.activo AS horario_activo
        FROM medicamentos AS m
        LEFT JOIN horarios_medicacion AS h
            ON h.medicamento_id = m.id
        WHERE m.usuario_id = $1
          AND m.activo = TRUE
        ORDER BY m.creado_en DESC, h.fecha_hora_inicio ASC;
    `;

    const resultado = await pool.query(consulta, [usuarioId]);

    return resultado.rows;
};

const desactivarMedicamento = async (medicamentoId, usuarioId) => {
    const conexion = await pool.connect();

    try {
        await conexion.query('BEGIN');

        const consultaMedicamento = `
            UPDATE medicamentos
            SET activo = FALSE
            WHERE id = $1
              AND usuario_id = $2
              AND activo = TRUE
            RETURNING id, usuario_id, nombre, dosis, activo;
        `;

        const resultadoMedicamento = await conexion.query(
            consultaMedicamento,
            [medicamentoId, usuarioId]
        );

        if (resultadoMedicamento.rowCount === 0) {
            await conexion.query('ROLLBACK');
            return null;
        }

        const consultaHorario = `
            UPDATE horarios_medicacion
            SET activo = FALSE
            WHERE medicamento_id = $1
              AND activo = TRUE;
        `;

        await conexion.query(consultaHorario, [medicamentoId]);

        await conexion.query('COMMIT');

        return resultadoMedicamento.rows[0];
    } catch (error) {
        await conexion.query('ROLLBACK');
        throw error;
    } finally {
        conexion.release();
    }
};

module.exports = {
    crearMedicamento,
    obtenerMedicamentosPorUsuario,
    desactivarMedicamento
};