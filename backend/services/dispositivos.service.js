
const pool = require('../config/conexion-db');

async function registrarToken(usuarioId, token) {
    const resultado = await pool.query(`
        INSERT INTO tokens_dispositivos (
            usuario_id,
            token,
            activo
        )
        VALUES ($1, $2, TRUE)
        ON CONFLICT (token)
        DO UPDATE SET
            usuario_id = EXCLUDED.usuario_id,
            activo = TRUE
        RETURNING id, usuario_id, activo
    `, [usuarioId, token]);

    return resultado.rows[0];
}

module.exports = {
    registrarToken
};
