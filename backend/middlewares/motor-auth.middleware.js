const crypto = require('crypto');

function motorAuth(req, res, next) {
    const tokenConfigurado = process.env.MOTOR_INTERNAL_TOKEN;
    const tokenRecibido = req.get('x-motor-token');

    if (!tokenConfigurado) {
        return res.status(503).json({
            ok: false,
            mensaje: 'La autenticación interna no está configurada.'
        });
    }

    if (!tokenRecibido) {
        return res.status(401).json({
            ok: false,
            mensaje: 'Acceso no autorizado.'
        });
    }

    const esperado = Buffer.from(tokenConfigurado);
    const recibido = Buffer.from(tokenRecibido);

    if (
        esperado.length !== recibido.length ||
        !crypto.timingSafeEqual(esperado, recibido)
    ) {
        return res.status(401).json({
            ok: false,
            mensaje: 'Acceso no autorizado.'
        });
    }

    next();
}

module.exports = motorAuth;