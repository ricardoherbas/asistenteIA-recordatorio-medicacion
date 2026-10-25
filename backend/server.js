const express = require('express');
const http = require('http');
const cors = require('cors');

const { registrarWebSocket } = require('./websocket/voice.websocket');

const usuariosRoutes = require('./routes/usuarios.routes');
const medicamentosRoutes = require('./routes/medicamentos.routes');
const tomasRoutes = require('./routes/tomas.routes');

const handError = require('./middlewares/hand-error');

class Server {
    constructor() {
        this.app = express();
        this.puerto = Number(process.env.PORT || 4000);

        this.configurarMiddlewares();
        this.configurarRutas();
        this.configurarManejoErrores();

        this.servidorHttp = http.createServer(this.app);

        this.websocket = registrarWebSocket(this.servidorHttp);
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
                `WebSocket disponible en ws://localhost:${this.puerto}`
            );
        });
    }
}

module.exports = Server;