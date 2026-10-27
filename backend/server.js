
const express = require('express');
const http = require('http');
const cors = require('cors');

const { registrarWebSocket } = require('./websocket/voice.websocket');
const motorAuth = require('./middlewares/motor-auth.middleware');

const usuariosRoutes = require('./routes/usuarios.routes');
const medicamentosRoutes = require('./routes/medicamentos.routes');
const tomasRoutes = require('./routes/tomas.routes');
const dispositivosRoutes = require('./routes/dispositivos.routes');

const handError = require('./middlewares/hand-error');

class Server {
    constructor() {
        this.app = express();
        this.puerto = Number(process.env.PORT || 4000);

        this.configurarMiddlewares();

        this.servidorHttp = http.createServer(this.app);
        this.websocket = registrarWebSocket(this.servidorHttp);

        this.configurarRutas();
        this.configurarManejoErrores();
    }

    configurarMiddlewares() {
        this.app.use(cors());
        this.app.use(express.json());
    }

    configurarRutas() {
        this.app.get('/api/health', (req, res) => {
            res.status(200).json({
                ok: true,
                mensaje: 'Servidor funcionando correctamente.'
            });
        });

        this.app.use('/api/usuarios', usuariosRoutes);
        this.app.use('/api/medicamentos', medicamentosRoutes);
        this.app.use('/api/tomas', tomasRoutes);
        this.app.use('/api/dispositivos', dispositivosRoutes);

        /*
         * ENDPOINT INTERNO PARA RECORDATORIOS POR VOZ
         *
         * El motor de recordatorios envía:
         * {
         *     usuarioId: 1,
         *     mensaje: "Es hora de tomar tu medicamento.",
         *     envioId: 10
         * }
         *
         * El backend genera el audio con Piper y lo
         * envía por WebSocket al navegador del usuario.
         */
        this.app.post(
            '/api/interno/recordatorios/voz',
            motorAuth,
            async (req, res, next) => {
                try {
                    const { usuarioId, mensaje, envioId } = req.body || {};

                    const id = Number(usuarioId);
                    const identificadorEnvio = Number(envioId);

                    if (
                        !Number.isSafeInteger(id) ||
                        id <= 0 ||
                        typeof mensaje !== 'string' ||
                        !mensaje.trim() ||
                        !Number.isSafeInteger(identificadorEnvio) ||
                        identificadorEnvio <= 0
                    ) {
                        return res.status(400).json({
                            ok: false,
                            mensaje: 'Los datos del recordatorio no son válidos.'
                        });
                    }

                    console.log(
                        '[RECORDATORIO] Solicitud recibida:',
                        {
                            usuarioId: id,
                            envioId: identificadorEnvio
                        }
                    );

                    const resultado =
                        await this.websocket.enviarRecordatorioVoz(
                            id,
                            mensaje.trim(),
                            identificadorEnvio
                        );

                    if (!resultado.ok) {
                        if (
                            resultado.motivo === 'usuario_desconectado' ||
                            resultado.motivo === 'avisos_voz_no_disponibles'
                        ) {
                            return res.status(409).json({
                                ok: false,
                                motivo: resultado.motivo,
                                mensaje: 'El usuario no tiene una conexión disponible para recibir el recordatorio por voz.'
                            });
                        }

                        return res.status(503).json({
                            ok: false,
                            motivo: resultado.motivo,
                            mensaje: 'No se pudo enviar el recordatorio por voz.'
                        });
                    }

                    return res.status(200).json({
                        ok: true,
                        mensaje: 'Audio del recordatorio enviado al navegador.',
                        envioId: resultado.envioId
                    });
                } catch (error) {
                    next(error);
                }
            }
        );

        this.app.use((req, res) => {
            res.status(404).json({
                ok: false,
                mensaje: 'La ruta solicitada no existe.'
            });
        });
    }

    configurarManejoErrores() {
        this.app.use(handError);
    }

    iniciar() {
        this.servidorHttp.listen(this.puerto, '0.0.0.0', () => {
            console.log(
                `Servidor HTTP escuchando en el puerto ${this.puerto}.`
            );

            console.log(
                `WebSocket disponible en ws://localhost:${this.puerto}/ws`
            );
        });
    }
}

module.exports = Server;
