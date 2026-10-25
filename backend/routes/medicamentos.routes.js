const express = require('express');
const router = express.Router();

const medicamentosController = require('../controllers/medicamentos.controller');
const {validarCrearMedicamento, validarUsuarioId, validarDesactivarMedicamento} = require('../middlewares/medicamentos.validator');

router.post('/', validarCrearMedicamento, medicamentosController.crearMedicamento);
router.get('/usuario/:usuarioId', validarUsuarioId, medicamentosController.obtenerMedicamentosPorUsuario);
router.patch('/:id/desactivar', validarDesactivarMedicamento, medicamentosController.desactivarMedicamento);

module.exports = router;