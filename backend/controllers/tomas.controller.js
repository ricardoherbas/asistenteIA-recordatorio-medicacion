const tomasService = require('../services/tomas.service');

const generarTomasParaHorario = async (req, res, next) => {
    try {
        const { horarioId } = req.params;
        const dias = Number(req.query.dias || 7);

        const tomas = await tomasService.generarTomasParaHorario(
            horarioId,
            dias
        );

        return res.status(200).json({
            ok: true,
            mensaje: 'Tomas programadas generadas correctamente.',
            datos: tomas
        });
    } catch (error) {
        next(error);
    }
};

const obtenerTomasPorUsuario = async (req, res, next) => {
    try {
        const { usuarioId } = req.params;
        const dias = Number(req.query.dias || 7);

        const tomas = await tomasService.obtenerTomasPorUsuario(
            usuarioId,
            dias
        );

        return res.status(200).json({
            ok: true,
            datos: tomas
        });
    } catch (error) {
        next(error);
    }
};

const confirmarToma = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { usuarioId, origen } = req.body;

        const toma = await tomasService.confirmarToma(
            id,
            usuarioId,
            origen
        );

        if (!toma) {
            return res.status(404).json({
                ok: false,
                mensaje: 'No se encontró una toma pendiente para ese usuario.'
            });
        }

        return res.status(200).json({
            ok: true,
            mensaje: 'Toma confirmada correctamente.',
            datos: toma
        });
    } catch (error) {
        next(error);
    }
};

const marcarTomaSinConfirmacion = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { usuarioId } = req.body;

        const toma = await tomasService.marcarTomaSinConfirmacion(
            id,
            usuarioId
        );

        if (!toma) {
            return res.status(404).json({
                ok: false,
                mensaje: 'No se encontró una toma pendiente vencida para ese usuario.'
            });
        }

        return res.status(200).json({
            ok: true,
            mensaje: 'Se registró que la toma no tuvo confirmación.',
            datos: toma
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    generarTomasParaHorario,
    obtenerTomasPorUsuario,
    confirmarToma,
    marcarTomaSinConfirmacion
};