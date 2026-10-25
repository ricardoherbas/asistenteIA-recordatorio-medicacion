const { param, body, query } = require('express-validator');
const validarCampos = require('./validar-campos');

const validarIdToma = [
    param('id').isInt({ min: 1 }).withMessage('El identificador de la toma debe ser un entero positivo.'),
    validarCampos
];

const validarConfirmarToma = [
    param('id').isInt({ min: 1 }).withMessage('El identificador de la toma debe ser un entero positivo.'),
    body('usuarioId').isInt({ min: 1 }).withMessage('El identificador del usuario debe ser un entero positivo.'),
    body('origen').isIn(['web', 'voz']).withMessage('El origen de la confirmación debe ser web o voz.'),
    validarCampos
];

const validarUsuarioId = [
    param('usuarioId').isInt({ min: 1 }).withMessage('El identificador del usuario debe ser un entero positivo.'),
    validarCampos
];

const validarListadoTomas = [
    param('usuarioId').isInt({ min: 1 }).withMessage('El identificador del usuario debe ser un entero positivo.'),
    query('dias').optional().isInt({ min: 1, max: 30 }).withMessage('La cantidad de días debe ser un entero entre 1 y 30.'),
    validarCampos
];

const validarTomaSinConfirmacion = [
    param('id').isInt({ min: 1 }).withMessage('El identificador de la toma debe ser un entero positivo.'),
    body('usuarioId').isInt({ min: 1 }).withMessage('El identificador del usuario debe ser un entero positivo.'),
    validarCampos
];

const validarHorarioId = [
    param('horarioId').isInt({ min: 1 }).withMessage('El identificador del horario debe ser un entero positivo.'),
    query('dias').optional().isInt({ min: 1, max: 30 }).withMessage('La cantidad de días debe ser un entero entre 1 y 30.'),
    validarCampos
];

module.exports = {
    validarIdToma,
    validarConfirmarToma,
    validarUsuarioId,
    validarListadoTomas,
    validarTomaSinConfirmacion,
    validarHorarioId
};