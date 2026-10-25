const { body, param } = require('express-validator');
const validarCampos = require('./validar-campos');

const validarCrearMedicamento = [
    body('usuarioId')
        .isInt({ min: 1 })
        .withMessage('El identificador del usuario debe ser un entero positivo.'),
    body('nombre')
        .trim()
        .notEmpty()
        .withMessage('El nombre del medicamento es obligatorio.')
        .isLength({ max: 150 })
        .withMessage('El nombre no puede superar los 150 caracteres.'),
    body('dosis')
        .trim()
        .notEmpty()
        .withMessage('La dosis es obligatoria.')
        .isLength({ max: 100 })
        .withMessage('La dosis no puede superar los 100 caracteres.'),
    body('observaciones')
        .optional({ values: 'null' })
        .isString()
        .withMessage('Las observaciones deben ser texto.')
        .trim()
        .isLength({ max: 2000 })
        .withMessage('Las observaciones no pueden superar los 2000 caracteres.'),
    body('fechaHoraInicio')
        .isISO8601({ strict: true, strictSeparator: true })
        .withMessage('La fecha de inicio debe ser válida y estar en formato ISO 8601.')
        .custom((valor) => /(?:Z|[+-]\d{2}:\d{2})$/.test(valor))
        .withMessage('La fecha de inicio debe incluir zona horaria.'),
    body('intervaloHoras')
        .isInt({ min: 1, max: 168 })
        .withMessage('El intervalo debe ser un entero entre 1 y 168 horas.'),
    body('fechaHoraFin')
        .optional({ values: 'null' })
        .custom((valor) => valor === '' || (
            typeof valor === 'string'
            && /(?:Z|[+-]\d{2}:\d{2})$/.test(valor)
            && !Number.isNaN(Date.parse(valor))
        ))
        .withMessage('La fecha de finalización debe ser válida e incluir zona horaria.')
        .custom((valor, { req }) => {
            if (!valor || !req.body.fechaHoraInicio) return true;
            return Date.parse(valor) > Date.parse(req.body.fechaHoraInicio);
        })
        .withMessage('La fecha de finalización debe ser posterior a la fecha de inicio.'),
    validarCampos
];

const validarUsuarioId = [
    param('usuarioId')
        .isInt({ min: 1 })
        .withMessage('El identificador del usuario debe ser un entero positivo.'),
    validarCampos
];

const validarDesactivarMedicamento = [
    param('id')
        .isInt({ min: 1 })
        .withMessage('El identificador del medicamento debe ser un entero positivo.'),
    body('usuarioId')
        .isInt({ min: 1 })
        .withMessage('El identificador del usuario debe ser un entero positivo.'),
    validarCampos
];

module.exports = {
    validarCrearMedicamento,
    validarUsuarioId,
    validarDesactivarMedicamento
};