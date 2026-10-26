const usuariosService = require('../services/usuarios.service');

const crearUsuario = async (req, res, next) => {
    try {
        const { nombre, apellido, email } = req.body;

        const usuarioExistente =
            await usuariosService.obtenerUsuarioPorEmail(email);

        if (usuarioExistente) {
            return res.status(409).json({
                ok: false,
                mensaje: 'Ya existe un usuario registrado con ese correo electrónico.'
            });
        }

        const usuario = await usuariosService.crearUsuario({
            nombre,
            apellido,
            email
        });

        return res.status(201).json({
            ok: true,
            mensaje: 'Usuario creado correctamente.',
            datos: usuario
        });
    } catch (error) {
        next(error);
    }
};

const obtenerUsuarioPorId = async (req, res, next) => {
    try {
        const { id } = req.params;

        const usuario = await usuariosService.obtenerUsuarioPorId(id);

        if (!usuario) {
            return res.status(404).json({
                ok: false,
                mensaje: 'No se encontró el usuario solicitado.'
            });
        }

        return res.status(200).json({
            ok: true,
            datos: usuario
        });
    } catch (error) {
        next(error);
    }
};

const actualizarUsuario = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { nombre, apellido, email } = req.body;

        const usuarioActual = await usuariosService.obtenerUsuarioPorId(id);

        if (!usuarioActual) {
            return res.status(404).json({
                ok: false,
                mensaje: 'No se encontró el usuario solicitado.'
            });
        }

        const usuarioConEmail =
            await usuariosService.obtenerUsuarioPorEmail(email);

        if (usuarioConEmail && String(usuarioConEmail.id) !== String(id)) {
            return res.status(409).json({
                ok: false,
                mensaje: 'Ese correo electrónico ya pertenece a otro usuario.'
            });
        }

        const usuario = await usuariosService.actualizarUsuario(id, {
            nombre,
            apellido,
            email
        });

        return res.status(200).json({
            ok: true,
            mensaje: 'Usuario actualizado correctamente.',
            datos: usuario
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    crearUsuario,
    obtenerUsuarioPorId,
    actualizarUsuario
};
