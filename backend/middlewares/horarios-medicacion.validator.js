const { body } = require('express-validator');
const validarCampos = require('./validar-campos');

const fechaISOConZona = (valor) => {
    return typeof valor === 'string'
        && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(valor)
        && !Number.isNaN(Date.parse(valor));
};

const validarHorarioMedicacion = [
    body('medicamento_id')
        .isInt({ min: 1 })
        .withMessage('El identificador del medicamento debe ser un entero positivo.'),

    body('fecha_hora_inicio')
        .custom(fechaISOConZona)
        .withMessage('La fecha de inicio debe estar en formato ISO 8601 e incluir zona horaria.'),

    body('intervalo_horas')
        .isInt({ min: 1, max: 168 })
        .withMessage('El intervalo debe ser un entero entre 1 y 168 horas.'),

    body('fecha_hora_fin')
        .optional({ values: 'null' })
        .custom(fechaISOConZona)
        .withMessage('La fecha de finalización debe estar en formato ISO 8601 e incluir zona horaria.')
        .custom((valor, { req }) => {
            if (!fechaISOConZona(req.body.fecha_hora_inicio)) {
                return true;
            }

            return Date.parse(valor) > Date.parse(req.body.fecha_hora_inicio);
        })
        .withMessage('La fecha de finalización debe ser posterior a la fecha de inicio.'),

    validarCampos
];

module.exports = validarHorarioMedicacion;