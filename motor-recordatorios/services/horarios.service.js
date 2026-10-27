
const pool = require('../config/conexion-db');
const { crearAlerta, crearCanalesEnvio } = require('./alertas.service');

const MINUTO_MS = 60 * 1000;
const HORA_MS = 60 * MINUTO_MS;
const VENTANA_MINUTOS = 5;

async function obtenerHorariosActivos() {
    const resultado = await pool.query(`
        SELECT
            h.id AS horario_id,
            h.fecha_hora_inicio,
            h.fecha_hora_fin,
            h.intervalo_horas,
            m.usuario_id,
            m.nombre AS medicamento,
            m.dosis,
            m.instrucciones
        FROM horarios_medicacion h
        INNER JOIN medicamentos m
            ON m.id = h.medicamento_id
        WHERE h.activo = TRUE
          AND m.activo = TRUE
    `);

    return resultado.rows;
}

function calcularTomas(horario, desde, hasta) {
    const inicio = new Date(horario.fecha_hora_inicio).getTime();

    const fin = horario.fecha_hora_fin
        ? new Date(horario.fecha_hora_fin).getTime()
        : Infinity;

    const intervalo = horario.intervalo_horas * HORA_MS;

    const desdeMs = Math.max(desde.getTime(), inicio);
    const hastaMs = Math.min(hasta.getTime(), fin);

    if (desdeMs > hastaMs) {
        return [];
    }

    const primeraPosicion = Math.max(
        0,
        Math.ceil((desdeMs - inicio) / intervalo)
    );

    const tomas = [];

    for (
        let posicion = primeraPosicion;
        inicio + posicion * intervalo <= hastaMs;
        posicion++
    ) {
        tomas.push(new Date(inicio + posicion * intervalo));
    }

    return tomas;
}

async function registrarToma(horario, fechaHora) {
    const fechaISO = fechaHora.toISOString();

    const resultado = await pool.query(`
        INSERT INTO registro_tomas (
            horario_id,
            fecha_programada,
            hora_programada
        )
        VALUES (
            $1,
            ($2::timestamptz AT TIME ZONE 'America/Argentina/Buenos_Aires')::date,
            ($2::timestamptz AT TIME ZONE 'America/Argentina/Buenos_Aires')::time
        )
        ON CONFLICT (horario_id, fecha_programada, hora_programada)
        DO NOTHING
        RETURNING id
    `, [
        horario.horario_id,
        fechaISO
    ]);

    if (resultado.rows.length > 0) {
        return {
            id: resultado.rows[0].id,
            nueva: true,
            estado: 'pendiente'
        };
    }

    const existente = await pool.query(`
        SELECT id, estado
        FROM registro_tomas
        WHERE horario_id = $1
          AND fecha_programada =
              ($2::timestamptz AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
          AND hora_programada =
              ($2::timestamptz AT TIME ZONE 'America/Argentina/Buenos_Aires')::time
    `, [
        horario.horario_id,
        fechaISO
    ]);

    if (existente.rows.length === 0) {
        return null;
    }

    return {
        id: existente.rows[0].id,
        nueva: false,
        estado: existente.rows[0].estado
    };
}

async function procesarHorarios() {
    const ahora = new Date();

    const desde = new Date(
        ahora.getTime() - VENTANA_MINUTOS * MINUTO_MS
    );

    const hasta = new Date(
        ahora.getTime() + VENTANA_MINUTOS * MINUTO_MS
    );

    const horarios = await obtenerHorariosActivos();

    let tomasCreadas = 0;
    let alertasCreadas = 0;

    for (const horario of horarios) {
        const tomas = calcularTomas(horario, desde, hasta);

        for (const fechaHora of tomas) {
            const registro = await registrarToma(horario, fechaHora);

            if (!registro) {
                continue;
            }

            if (registro.nueva) {
                tomasCreadas++;
            }

            // No generar recordatorios para tomas ya resueltas.
            if (registro.estado !== 'pendiente') {
                continue;
            }

            const alerta = await crearAlerta(
                horario,
                registro,
                fechaHora
            );

            if (alerta) {
                alertasCreadas++;

                console.log(
                    `Alerta creada: ${horario.medicamento} - ${fechaHora.toISOString()}`
                );
            }

            // Recuperar la alerta aunque ya existiera.
            const resultadoAlerta = await pool.query(`
                SELECT id, estado
                FROM alertas
                WHERE registro_toma_id = $1
                  AND tipo = 'recordatorio_medicacion'
            `, [registro.id]);

            if (resultadoAlerta.rows.length === 0) {
                continue;
            }

            const alertaExistente = resultadoAlerta.rows[0];

            // No volver a preparar canales para alertas cerradas.
            if (alertaExistente.estado !== 'pendiente') {
                continue;
            }

            await crearCanalesEnvio(alertaExistente.id);
        }
    }

    console.log(`Tomas nuevas registradas: ${tomasCreadas}`);
    console.log(`Alertas nuevas registradas: ${alertasCreadas}`);

    return {
        tomasCreadas,
        alertasCreadas
    };
}

module.exports = {
    obtenerHorariosActivos,
    calcularTomas,
    registrarToma,
    procesarHorarios
};
