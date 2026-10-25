const pool = require('../config/conexion-db');

const crearUsuario = async ({ nombre, apellido, email }) => {
    const consulta = `
        INSERT INTO usuarios (
            nombre,
            apellido,
            email
        )
        VALUES ($1, $2, $3)
        RETURNING
            id,
            nombre,
            apellido,
            email,
            creado_en;
    `;

    const valores = [nombre, apellido, email];

    const resultado = await pool.query(consulta, valores);

    return resultado.rows[0];
};

const obtenerUsuarioPorId = async (id) => {
    const consulta = `
        SELECT
            id,
            nombre,
            apellido,
            email,
            creado_en
        FROM usuarios
        WHERE id = $1;
    `;

    const resultado = await pool.query(consulta, [id]);

    return resultado.rows[0] || null;
};

const obtenerUsuarioPorEmail = async (email) => {
    const consulta = `
        SELECT
            id,
            nombre,
            apellido,
            email,
            creado_en
        FROM usuarios
        WHERE email = $1;
    `;

    const resultado = await pool.query(consulta, [email]);

    return resultado.rows[0] || null;
};

module.exports = {
    crearUsuario,
    obtenerUsuarioPorId,
    obtenerUsuarioPorEmail
};