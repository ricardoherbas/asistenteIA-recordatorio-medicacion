const medicamentosService = require('../services/medicamentos.service');

const crearMedicamento = async (req, res, next) => {
    try {
        const {
            usuarioId,
            nombre,
            dosis,
            observaciones,
            fechaHoraInicio,
            intervaloHoras,
            fechaHoraFin
        } = req.body;

        const medicamento = await medicamentosService.crearMedicamento({
            usuarioId,
            nombre,
            dosis,
            observaciones,
            fechaHoraInicio,
            intervaloHoras,
            fechaHoraFin
        });

        return res.status(201).json({
            ok: true,
            mensaje: 'Medicamento registrado correctamente.',
            datos: medicamento
        });
    } catch (error) {
        next(error);
    }
};

const obtenerMedicamentosPorUsuario = async (req, res, next) => {
    try {
        const { usuarioId } = req.params;

        const medicamentos =
            await medicamentosService.obtenerMedicamentosPorUsuario(usuarioId);

        return res.status(200).json({
            ok: true,
            datos: medicamentos
        });
    } catch (error) {
        next(error);
    }
};

const desactivarMedicamento = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { usuarioId } = req.body;

        const medicamento = await medicamentosService.desactivarMedicamento(
            id,
            usuarioId
        );

        if (!medicamento) {
            return res.status(404).json({
                ok: false,
                mensaje: 'No se encontró el medicamento activo para ese usuario.'
            });
        }

        return res.status(200).json({
            ok: true,
            mensaje: 'Medicamento desactivado correctamente.',
            datos: medicamento
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    crearMedicamento,
    obtenerMedicamentosPorUsuario,
    desactivarMedicamento
};