const express = require('express');
const router = express.Router();

const tomasController = require('../controllers/tomas.controller');
const { validarConfirmarToma, validarListadoTomas, validarTomaSinConfirmacion, validarHorarioId } = require('../middlewares/tomas.validator');

router.post('/horario/:horarioId/generar', validarHorarioId, tomasController.generarTomasParaHorario);
router.get('/usuario/:usuarioId', validarListadoTomas, tomasController.obtenerTomasPorUsuario);
router.patch('/:id/confirmar', validarConfirmarToma, tomasController.confirmarToma);
router.patch('/:id/sin-confirmacion', validarTomaSinConfirmacion, tomasController.marcarTomaSinConfirmacion);

module.exports = router;