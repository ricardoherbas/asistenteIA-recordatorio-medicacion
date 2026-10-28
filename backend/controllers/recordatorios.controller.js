const recordatoriosService = require('../services/recordatorios.service');

const enviarRecordatorioVoz = (websocket) => {
    return async (req, res, next) => {
        try {
            const {
                usuarioId,
                mensaje,
                envioId,
                registroTomaId
            } = req.body || {};

            const id = Number(usuarioId);
            const identificadorEnvio = Number(envioId);
            const identificadorToma = Number(registroTomaId);

            if (
                !Number.isSafeInteger(id) ||
                id <= 0 ||
                typeof mensaje !== 'string' ||
                !mensaje.trim() ||
                !Number.isSafeInteger(identificadorEnvio) ||
                identificadorEnvio <= 0 ||
                !Number.isSafeInteger(identificadorToma) ||
                identificadorToma <= 0
            ) {
                return res.status(400).json({
                    ok: false,
                    mensaje: 'Los datos del recordatorio no son válidos.'
                });
            }

            const recordatorioValido =
                await recordatoriosService.validarRecordatorioVoz(
                    identificadorEnvio,
                    identificadorToma,
                    id
                );

            if (!recordatorioValido) {
                return res.status(409).json({
                    ok: false,
                    mensaje: 'El recordatorio no corresponde a una toma pendiente válida.'
                });
            }

            console.log('[RECORDATORIO] Solicitud recibida:', {
                usuarioId: id,
                envioId: identificadorEnvio,
                registroTomaId: identificadorToma
            });

            const resultado = await websocket.enviarRecordatorioVoz(
                id,
                mensaje.trim(),
                identificadorEnvio,
                identificadorToma
            );

            if (!resultado.ok) {
                if (
                    resultado.motivo === 'usuario_desconectado' ||
                    resultado.motivo === 'avisos_voz_no_disponibles'
                ) {
                    return res.status(409).json({
                        ok: false,
                        motivo: resultado.motivo,
                        mensaje: 'El usuario no tiene una conexión disponible para recibir el recordatorio por voz.'
                    });
                }

                return res.status(503).json({
                    ok: false,
                    motivo: resultado.motivo,
                    mensaje: 'No se pudo enviar el recordatorio por voz.'
                });
            }

            return res.status(200).json({
                ok: true,
                mensaje: 'Audio del recordatorio enviado al navegador.',
                envioId: resultado.envioId,
                registroTomaId: identificadorToma
            });
        } catch (error) {
            next(error);
        }
    };
};

module.exports = {
    enviarRecordatorioVoz
};