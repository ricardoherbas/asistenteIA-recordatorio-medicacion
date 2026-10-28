
const pool = require('../config/conexion-db');
const { enviarEmail } = require('./email.service');
const { enviarPush } = require('./push.service');

const BACKEND_INTERNAL_URL = process.env.BACKEND_INTERNAL_URL;
const MOTOR_INTERNAL_TOKEN = process.env.MOTOR_INTERNAL_TOKEN;

async function obtenerEmailsPendientes() {
    const resultado = await pool.query(`
        SELECT
            e.id,
            e.alerta_id,
            a.mensaje,
            u.email
        FROM envios_alertas e
        INNER JOIN alertas a ON a.id = e.alerta_id
        INNER JOIN usuarios u ON u.id = a.usuario_id
        INNER JOIN registro_tomas r ON r.id = a.registro_toma_id
        WHERE e.canal = 'email'
          AND e.estado = 'pendiente'
          AND a.estado = 'pendiente'
          AND r.estado = 'pendiente'
          AND a.programada_en <= CURRENT_TIMESTAMP
        ORDER BY a.programada_en ASC
    `);

    return resultado.rows;
}

async function procesarEmailsPendientes() {
    const envios = await obtenerEmailsPendientes();

    for (const envio of envios) {
        try {
            await enviarEmail(
                envio.email,
                'Memoric - Recordatorio de medicación',
                envio.mensaje
            );

            await pool.query(`
                UPDATE envios_alertas
                SET estado = 'enviado',
                    enviado_en = CURRENT_TIMESTAMP,
                    intentos = intentos + 1,
                    ultimo_error = NULL
                WHERE id = $1
            `, [envio.id]);

            console.log(`Correo enviado a ${envio.email}`);
        } catch (error) {
            await pool.query(`
                UPDATE envios_alertas
                SET estado = 'error',
                    intentos = intentos + 1,
                    ultimo_error = $2
                WHERE id = $1
            `, [envio.id, error.message]);

            console.error(
                `Error al enviar correo: ${error.message}`
            );
        }
    }
}

async function obtenerPushPendientes() {
    const resultado = await pool.query(`
        SELECT
            e.id,
            e.alerta_id,
            a.usuario_id,
            a.mensaje
        FROM envios_alertas e
        INNER JOIN alertas a ON a.id = e.alerta_id
        INNER JOIN registro_tomas r ON r.id = a.registro_toma_id
        WHERE e.canal = 'push'
          AND e.estado = 'pendiente'
          AND a.estado = 'pendiente'
          AND r.estado = 'pendiente'
          AND a.programada_en <= CURRENT_TIMESTAMP
        ORDER BY a.programada_en ASC
    `);

    return resultado.rows;
}

async function procesarPushPendientes() {
    const envios = await obtenerPushPendientes();

    for (const envio of envios) {
        try {
            const resultado = await pool.query(`
                SELECT token
                FROM tokens_dispositivos
                WHERE usuario_id = $1
                  AND activo = TRUE
            `, [envio.usuario_id]);

            if (resultado.rows.length === 0) {
                console.log(
                    `No hay dispositivos registrados para el usuario ${envio.usuario_id}`
                );
                continue;
            }

            let enviados = 0;
            let ultimoError = null;

            for (const dispositivo of resultado.rows) {
                try {
                    await enviarPush(
                        dispositivo.token,
                        envio.mensaje
                    );

                    enviados++;
                } catch (error) {
                    ultimoError = error.message;

                    console.error(
                        `Error al enviar push al usuario ${envio.usuario_id}: ${error.message}`
                    );
                }
            }

            if (enviados > 0) {
                await pool.query(`
                    UPDATE envios_alertas
                    SET estado = 'enviado',
                        enviado_en = CURRENT_TIMESTAMP,
                        intentos = intentos + 1,
                        ultimo_error = NULL
                    WHERE id = $1
                `, [envio.id]);

                console.log(
                    `Push enviado al usuario ${envio.usuario_id}`
                );
            } else {
                await pool.query(`
                    UPDATE envios_alertas
                    SET estado = 'error',
                        intentos = intentos + 1,
                        ultimo_error = $2
                    WHERE id = $1
                `, [envio.id, ultimoError]);
            }
        } catch (error) {
            console.error(
                `Error al procesar push ${envio.id}: ${error.message}`
            );
        }
    }
}

async function obtenerVozPendientes() {
    const resultado = await pool.query(`
        SELECT
            e.id,
            e.alerta_id,
            a.usuario_id,
            a.registro_toma_id,
            a.mensaje
        FROM envios_alertas e
        INNER JOIN alertas a ON a.id = e.alerta_id
        INNER JOIN registro_tomas r ON r.id = a.registro_toma_id
        WHERE e.canal = 'voz'
          AND e.estado = 'pendiente'
          AND a.estado = 'pendiente'
          AND r.estado = 'pendiente'
          AND a.programada_en <= CURRENT_TIMESTAMP
        ORDER BY a.programada_en ASC
    `);

    return resultado.rows;
}

/*
 * Envía el recordatorio al backend de Memoric.
 *
 * El backend utiliza Piper para generar el audio
 * y WebSocket para enviarlo al navegador.
 *
 * Se incluye registroTomaId para permitir que
 * el usuario confirme la toma correspondiente.
 */
async function enviarRecordatorioVoz(envio) {
    if (!BACKEND_INTERNAL_URL || !MOTOR_INTERNAL_TOKEN) {
        throw new Error(
            'Falta configurar BACKEND_INTERNAL_URL o MOTOR_INTERNAL_TOKEN.'
        );
    }

    const url = `${BACKEND_INTERNAL_URL.replace(/\/$/, '')}/api/interno/recordatorios/voz`;

    const respuesta = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-motor-token': MOTOR_INTERNAL_TOKEN
        },
        body: JSON.stringify({
            usuarioId: envio.usuario_id,
            mensaje: envio.mensaje,
            envioId: envio.id,
            registroTomaId: envio.registro_toma_id
        }),
        signal: AbortSignal.timeout(60000)
    });

    const datos = await respuesta.json();

    if (!respuesta.ok || !datos.ok) {
        const error = new Error(
            datos.mensaje || 'No se pudo enviar el recordatorio por voz.'
        );

        error.motivo = datos.motivo;
        error.status = respuesta.status;

        throw error;
    }

    return datos;
}

/*
 * Procesa los recordatorios por voz pendientes.
 *
 * Si el usuario está desconectado, conserva el
 * envío como pendiente para reintentarlo después.
 */
async function procesarVozPendientes() {
    const envios = await obtenerVozPendientes();

    for (const envio of envios) {
        try {
            console.log(
                `[VOZ] Procesando envío ${envio.id} para usuario ${envio.usuario_id}`
            );

            await enviarRecordatorioVoz(envio);

            await pool.query(`
                UPDATE envios_alertas
                SET estado = 'enviado',
                    enviado_en = CURRENT_TIMESTAMP,
                    intentos = intentos + 1,
                    ultimo_error = NULL
                WHERE id = $1
            `, [envio.id]);

            console.log(
                `[VOZ] Recordatorio ${envio.id} enviado correctamente.`
            );
        } catch (error) {
            if (
                error.motivo === 'usuario_desconectado' ||
                error.motivo === 'avisos_voz_no_disponibles'
            ) {
                console.log(
                    `[VOZ] Usuario ${envio.usuario_id} desconectado. El envío ${envio.id} seguirá pendiente.`
                );

                continue;
            }

            await pool.query(`
                UPDATE envios_alertas
                SET intentos = intentos + 1,
                    ultimo_error = $2
                WHERE id = $1
            `, [envio.id, error.message]);

            console.error(
                `[VOZ] Error al procesar envío ${envio.id}: ${error.message}`
            );
        }
    }
}

module.exports = {
    procesarEmailsPendientes,
    procesarPushPendientes,
    obtenerVozPendientes,
    procesarVozPendientes
};
