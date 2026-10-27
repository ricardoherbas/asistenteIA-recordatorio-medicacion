
const {registrarToken} = require('../services/dispositivos.service');

async function registrarDispositivo(req, res, next) {
    try {
        const { usuarioId, token } = req.body;

        const id = Number(usuarioId);

        if (!Number.isSafeInteger(id) || id <= 0) {
            return res.status(400).json({
                ok: false,
                mensaje: 'El ID del usuario no es válido.'
            });
        }

        if (
            typeof token !== 'string' ||
            !token.trim() ||
            token.length > 4096
        ) {
            return res.status(400).json({
                ok: false,
                mensaje: 'El token del dispositivo no es válido.'
            });
        }

        const dispositivo = await registrarToken(
            id,
            token.trim()
        );

        return res.status(201).json({
            ok: true,
            mensaje: 'Dispositivo registrado correctamente.',
            datos: dispositivo
        });
    } catch (error) {
        if (error.code === '23503') {
            return res.status(404).json({
                ok: false,
                mensaje: 'El usuario no existe.'
            });
        }

        next(error);
    }
}

module.exports = {
    registrarDispositivo
};
