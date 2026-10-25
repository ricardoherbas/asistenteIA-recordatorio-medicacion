const handError = (error, req, res, next) => {
    console.error(error);

    if (res.headersSent) {
        return next(error);
    }

    const status = error.status || error.statusCode || 500;

    res.status(status).json({
        ok: false,
        mensaje: status >= 500
            ? 'Error interno del servidor'
            : error.message
    });
};

module.exports = handError;
