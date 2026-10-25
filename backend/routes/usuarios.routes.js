const express = require('express');
const router = express.Router();

const usuariosController = require('../controllers/usuarios.controller');
const { validarUsuario, validarIdUsuario } = require('../middlewares/usuarios.validator');

router.post('/', validarUsuario, usuariosController.crearUsuario);
router.get('/:id', validarIdUsuario, usuariosController.obtenerUsuarioPorId);

module.exports = router;