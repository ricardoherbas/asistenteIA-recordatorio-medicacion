const transporter = require('../config/conexion-email');

async function enviarEmail(destinatario, asunto, mensaje) {
    const resultado = await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: destinatario,
        subject: asunto,
        text: mensaje
    });

    return resultado;
}

module.exports = { enviarEmail };