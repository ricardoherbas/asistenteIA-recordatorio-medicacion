const express = require('express');
const recordatoriosController = require('../controllers/recordatorios.controller');
const motorAuth = require('../middlewares/motor-auth.middleware');

const crearRecordatoriosRoutes = (websocket) => {
    const router = express.Router();

    router.post(
        '/voz',
        motorAuth,
        recordatoriosController.enviarRecordatorioVoz(websocket)
    );

    return router;
};

module.exports = crearRecordatoriosRoutes;