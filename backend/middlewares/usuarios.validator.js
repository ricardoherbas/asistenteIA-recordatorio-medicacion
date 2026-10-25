const { body, param } = require('express-validator');
const validarCampos = require('./validar-campos');

const validarUsuario = [
    body('nombre').trim().notEmpty().withMessage('El nombre es obligatorio.').isLength({ max: 100 }).withMessage('El nombre no puede superar los 100 caracteres.'),
    body('apellido').trim().notEmpty().withMessage('El apellido es obligatorio.').isLength({ max: 100 }).withMessage('El apellido no puede superar los 100 caracteres.'),
    body('email').trim().notEmpty().withMessage('El correo electrónico es obligatorio.').isEmail().withMessage('El correo electrónico no es válido.').isLength({ max: 150 }).withMessage('El correo no puede superar los 150 caracteres.').normalizeEmail(),
    validarCampos
];

const validarIdUsuario = [
    param('id').isInt({ min: 1 }).withMessage('El identificador del usuario debe ser un entero positivo.'),
    validarCampos
];

module.exports = { validarUsuario, validarIdUsuario };