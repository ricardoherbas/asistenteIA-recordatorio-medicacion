require('dotenv').config();

const pool = require('./config/conexion-db');
const transporter = require('./config/conexion-email');
const messaging = require('./config/conexion-firebase');
const { iniciarRecordatorios } = require('./jobs/procesarRecordatorios');
const { iniciarEnvios } = require('./jobs/procesarEnvios');

async function iniciarMotor() {
    try {
        await pool.query('SELECT 1');
        console.log('PostgreSQL conectado correctamente');

        await transporter.verify();
        console.log('Servidor de correo conectado correctamente');

        if (!messaging) {
            throw new Error('Firebase no se inicializó correctamente');
        }

        console.log('Firebase inicializado correctamente');

        iniciarRecordatorios();
        iniciarEnvios();

        console.log('Motor de recordatorios de Memoric iniciado');
    } catch (error) {
        console.error('Error al iniciar el motor:', error.message);

        await pool.end();
        process.exitCode = 1;
    }
}

iniciarMotor();