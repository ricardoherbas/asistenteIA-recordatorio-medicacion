
const pool = require('../config/conexion-db');
const { enviarEmail } = require('./email.service');
const { enviarPush } = require('./push.service');

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

            console.error(`Error al enviar correo: ${error.message}`);
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

module.exports = {
    procesarEmailsPendientes,
    procesarPushPendientes
};
