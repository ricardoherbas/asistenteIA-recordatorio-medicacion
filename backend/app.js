
require('dotenv').config({ path: '../.env' });

const Server = require('./server');

const servidor = new Server();

servidor.iniciar();
