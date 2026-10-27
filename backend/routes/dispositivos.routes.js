
const { Router } = require('express');
const {registrarDispositivo} = require('../controllers/dispositivos.controller');

const router = Router();

router.post('/token', registrarDispositivo);

module.exports = router;
