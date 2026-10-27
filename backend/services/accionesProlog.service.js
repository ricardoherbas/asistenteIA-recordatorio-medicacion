const tomasService = require('./tomas.service');

const ejecutarAccionProlog = async ({
    accion,
    usuarioId,
    datos = {},
    origen = 'voz'
}) => {
    const idUsuario = Number(usuarioId);

    if (!Number.isSafeInteger(idUsuario) || idUsuario <= 0) {
        return {
            ok: false,
            resultado: 'usuario_invalido',
            mensaje: 'No pude identificar tu perfil. Volvé a iniciar el asistente.'
        };
    }

    try {
        switch (accion) {
            case 'consultar_medicamentos': {
                const medicamentos =
                    await tomasService.obtenerMedicamentosPorUsuario(idUsuario);

                return {
                    ok: true,
                    resultado: 'medicamentos_consultados',
                    datos: medicamentos,
                    mensaje: medicamentos.length > 0
                        ? 'Encontré tus medicamentos registrados.'
                        : 'No tenés medicamentos activos registrados.'
                };
            }

            case 'registrar_confirmacion': {
                const pendientes =
                    await tomasService.obtenerTomasPendientesPorUsuario(idUsuario);

                if (pendientes.length === 0) {
                    return {
                        ok: false,
                        resultado: 'sin_tomas_pendientes',
                        mensaje: 'No encontré tomas pendientes de hoy o de días anteriores para confirmar.'
                    };
                }

                const horarioSolicitado = datos.horario;
                const medicamentoSolicitado =
                    typeof datos.medicamento === 'string'
                        ? datos.medicamento.trim().toLowerCase()
                        : '';

                let candidatas = pendientes;

                // Si se indicó un horario, filtrar por hora.
                if (horarioSolicitado) {
                    const horaNormalizada = String(horarioSolicitado)
                        .trim()
                        .slice(0, 5);

                    candidatas = candidatas.filter((toma) =>
                        String(toma.hora_programada).slice(0, 5) ===
                        horaNormalizada
                    );
                }

                // Si se indicó un medicamento, filtrar por nombre.
                if (medicamentoSolicitado) {
                    candidatas = candidatas.filter((toma) =>
                        String(toma.medicamento)
                            .toLowerCase()
                            .includes(medicamentoSolicitado)
                    );
                }

                if (candidatas.length === 0) {
                    return {
                        ok: false,
                        resultado: 'toma_no_identificada',
                        mensaje: 'No encontré una toma pendiente que coincida con el medicamento o el horario indicado.'
                    };
                }

                // No elegir automáticamente entre varias tomas.
                if (candidatas.length > 1) {
                    return {
                        ok: false,
                        resultado: 'requiere_aclaracion',
                        candidatas: candidatas.map((toma) => ({
                            medicamento: toma.medicamento,
                            dosis: toma.dosis,
                            fecha: toma.fecha_programada,
                            hora: toma.hora_programada
                        })),
                        mensaje: 'Hay varias tomas pendientes. Indicame qué medicamento tomaste y, si lo recordás, el horario.'
                    };
                }

                const toma = candidatas[0];

                // Sin medicamento ni horario explícitos, no confirmar
                // automáticamente una toma que podría ser antigua.
                if (!horarioSolicitado && !medicamentoSolicitado) {
                    return {
                        ok: false,
                        resultado: 'requiere_aclaracion',
                        candidatas: [{
                            medicamento: toma.medicamento,
                            dosis: toma.dosis,
                            fecha: toma.fecha_programada,
                            hora: toma.hora_programada
                        }],
                        mensaje: 'Encontré una toma pendiente, pero necesito que me indiques qué medicamento tomaste para evitar registrar una dosis equivocada.'
                    };
                }

                const confirmacion = await tomasService.confirmarToma(
                    toma.id,
                    idUsuario,
                    origen
                );

                if (!confirmacion) {
                    return {
                        ok: false,
                        resultado: 'confirmacion_no_realizada',
                        mensaje: 'No pude confirmar la toma. Puede que ya haya sido registrada o que ya no esté pendiente.'
                    };
                }

                return {
                    ok: true,
                    resultado: 'toma_confirmada',
                    datos: {
                        ...toma,
                        ...confirmacion
                    },
                    mensaje: 'La toma quedó registrada correctamente.'
                };
            }

            case 'mantener_pendiente':
                return {
                    ok: true,
                    resultado: 'toma_no_confirmada',
                    mensaje: 'De acuerdo, la toma sigue pendiente. No la registré como tomada.'
                };

            case 'consultar_recordatorio': {
                const tomas =
                    await tomasService.obtenerTomasPorUsuario(idUsuario, 1);

                return {
                    ok: true,
                    resultado: 'horario_consultado',
                    datos: tomas,
                    mensaje: tomas.length > 0
                        ? 'Encontré los recordatorios programados para hoy y mañana.'
                        : 'No encontré tomas programadas para hoy y mañana.'
                };
            }

            case 'solicitar_aclaracion':
            case 'pedir_aclaracion':
                return {
                    ok: true,
                    resultado: 'requiere_aclaracion',
                    mensaje: 'No entendí con suficiente claridad. ¿Podés repetirlo o decirme a qué medicamento te referís?'
                };

            case 'evaluar_seguimiento':
                return {
                    ok: true,
                    resultado: 'evaluar_seguimiento',
                    mensaje: 'La toma todavía no tiene confirmación. Necesito revisar su estado antes de informarte el resultado.'
                };

            default:
                return {
                    ok: false,
                    resultado: 'accion_no_soportada',
                    mensaje: 'La acción recibida de Prolog todavía no está implementada.'
                };
        }
    } catch (error) {
        console.error(
            '[accionesProlog] Error al ejecutar la acción:',
            error.message
        );

        return {
            ok: false,
            resultado: 'error_operacion',
            mensaje: 'No pude completar la operación en este momento. No puedo confirmar que se haya realizado.'
        };
    }
};

module.exports = {
    ejecutarAccionProlog
};
