(() => {
    'use strict';

    const CLAVE_PERSONA = 'personaAsistenteMedicacion';

    const $ = (selector) => document.querySelector(selector);

    const elementos = {
        seccionPerfil: $('#seccion-perfil'),
        formularioPersona: $('#form-persona'),
        nombrePersona: $('#persona-nombre'),
        apellidoPersona: $('#persona-apellido'),
        emailPersona: $('#persona-email'),
        mensajePersona: $('#mensaje-persona'),
        resumenPersona: $('#resumen-persona'),
        guardarPersona: $('#guardar-persona'),
        editarPersona: $('#editar-persona'),

        seccionFormularioMedicamento: $('#seccion-formulario-medicamento'),
        formularioMedicamento: $('#form-medicamento'),
        nombreMedicamento: $('#nombre'),
        dosis: $('#dosis'),
        fechaHoraInicio: $('#fecha-hora-inicio'),
        intervaloHoras: $('#intervalo-horas'),
        fechaHoraFin: $('#fecha-hora-fin'),
        observaciones: $('#observaciones'),
        resumenHorarios: $('#resumen-horarios'),
        mensajeFormulario: $('#mensaje-formulario'),
        guardarMedicamento: $('#guardar-medicamento'),

        seccionListaMedicamentos: $('#seccion-lista-medicamentos'),
        listaMedicamentos: $('#lista-medicamentos'),
        estadoVacio: $('#estado-vacio'),
        cantidadMedicamentos: $('#cantidad-medicamentos')
    };

    let persona = null;
    let medicamentos = [];
    let modoEdicion = false;

    /* =========================================
       Mensajes y almacenamiento local
    ========================================= */

    const mostrarMensaje = (elemento, mensaje, tipo = 'exito') => {
        if (!elemento) return;

        elemento.textContent = mensaje;
        elemento.hidden = !mensaje;
        elemento.classList.toggle('mensaje--error', tipo === 'error');
        elemento.classList.toggle('mensaje--exito', tipo === 'exito');
    };

    const guardarPersonaLocal = (datos) => {
        localStorage.setItem(CLAVE_PERSONA, JSON.stringify(datos));
    };

    const recuperarPersonaLocal = () => {
        try {
            const datos = JSON.parse(localStorage.getItem(CLAVE_PERSONA));

            if (
                datos &&
                Number.isInteger(Number(datos.id)) &&
                Number(datos.id) > 0
            ) {
                return {
                    ...datos,
                    id: Number(datos.id)
                };
            }
        } catch {
            localStorage.removeItem(CLAVE_PERSONA);
        }

        return null;
    };

    const mostrarSeccionMedicamentos = (mostrar) => {
        elementos.seccionFormularioMedicamento.hidden = !mostrar;
        elementos.seccionListaMedicamentos.hidden = !mostrar;
    };

    /* =========================================
       Perfil personal
    ========================================= */

    const mostrarResumenPersona = () => {
        const resumen = document.createElement('div');
        resumen.className = 'resumen-persona';

        const nombre = document.createElement('p');
        nombre.textContent = `Nombre: ${persona.nombre} ${persona.apellido}`;

        const email = document.createElement('p');
        email.textContent = `Correo electrónico: ${persona.email}`;

        resumen.append(nombre, email);

        elementos.resumenPersona.replaceChildren(resumen);
        elementos.resumenPersona.hidden = false;
    };

    const mostrarPerfilGuardado = () => {
        if (!persona) return;

        elementos.formularioPersona.hidden = true;
        elementos.editarPersona.hidden = false;

        mostrarResumenPersona();
        mostrarSeccionMedicamentos(true);
    };

    const mostrarFormularioPersona = () => {
        modoEdicion = Boolean(persona);

        elementos.formularioPersona.hidden = false;
        elementos.editarPersona.hidden = true;
        elementos.resumenPersona.hidden = true;

        elementos.nombrePersona.value = persona?.nombre ?? '';
        elementos.apellidoPersona.value = persona?.apellido ?? '';
        elementos.emailPersona.value = persona?.email ?? '';

        elementos.guardarPersona.textContent = modoEdicion
            ? 'Actualizar datos personales'
            : 'Guardar datos personales';

        mostrarMensaje(elementos.mensajePersona, '');

        if (!persona) {
            mostrarSeccionMedicamentos(false);
        }
    };

    const guardarPerfil = async (evento) => {
        evento.preventDefault();

        const nombre = elementos.nombrePersona.value.trim();
        const apellido = elementos.apellidoPersona.value.trim();
        const email = elementos.emailPersona.value.trim();

        if (!nombre || !apellido || !email) {
            mostrarMensaje(
                elementos.mensajePersona,
                'Completá el nombre, el apellido y el correo electrónico.',
                'error'
            );
            return;
        }

        const datos = { nombre, apellido, email };

        elementos.guardarPersona.disabled = true;
        mostrarMensaje(elementos.mensajePersona, '');

        try {
            let respuesta;

            if (modoEdicion && persona?.id) {
                respuesta = await window.API.put(
                    `/api/usuarios/${persona.id}`,
                    datos
                );
            } else {
                respuesta = await window.API.post('/api/usuarios', datos);
            }

            if (!respuesta?.ok || !respuesta?.datos?.id) {
                throw new Error(
                    respuesta?.mensaje ||
                    'No se pudo guardar el perfil.'
                );
            }

            persona = {
                ...respuesta.datos,
                id: Number(respuesta.datos.id)
            };

            guardarPersonaLocal(persona);
            mostrarPerfilGuardado();

            mostrarMensaje(
                elementos.mensajePersona,
                modoEdicion
                    ? 'Datos personales actualizados correctamente.'
                    : 'Perfil guardado correctamente.',
                'exito'
            );

            await cargarMedicamentos();
        } catch (error) {
            mostrarMensaje(
                elementos.mensajePersona,
                error.message || 'No se pudieron guardar los datos.',
                'error'
            );
        } finally {
            elementos.guardarPersona.disabled = false;
        }
    };

    /* =========================================
       Medicamentos
    ========================================= */

    const convertirFechaISO = (valor) => {
        if (!valor) return null;

        const fecha = new Date(valor);

        if (Number.isNaN(fecha.getTime())) {
            throw new Error('La fecha ingresada no es válida.');
        }

        return fecha.toISOString();
    };

    const normalizarMedicamento = (fila) => ({
        id: Number(fila.id),
        usuario_id: Number(fila.usuario_id),
        nombre: fila.nombre,
        dosis: fila.dosis,
        observaciones: fila.observaciones ?? fila.instrucciones ?? '',
        fecha_hora_inicio:
            fila.fecha_hora_inicio ??
            fila.fechaHoraInicio ??
            null,
        intervalo_horas: Number(
            fila.intervalo_horas ?? fila.intervaloHoras
        ),
        fecha_hora_fin:
            fila.fecha_hora_fin ??
            fila.fechaHoraFin ??
            null
    });

    const formatearFecha = (valor) => {
        if (!valor) return 'Sin fecha de finalización';

        const fecha = new Date(valor);

        if (Number.isNaN(fecha.getTime())) {
            return 'Fecha no disponible';
        }

        return fecha.toLocaleString('es-AR', {
            dateStyle: 'short',
            timeStyle: 'short'
        });
    };

    const crearElemento = (etiqueta, texto, clase) => {
        const elemento = document.createElement(etiqueta);
        elemento.textContent = texto;

        if (clase) {
            elemento.className = clase;
        }

        return elemento;
    };

    const crearTarjetaMedicamento = (medicamento) => {
        const tarjeta = document.createElement('article');
        tarjeta.className = 'tarjeta-medicamento';

        tarjeta.append(
            crearElemento('h3', medicamento.nombre),
            crearElemento('p', `Dosis: ${medicamento.dosis}`),
            crearElemento(
                'p',
                `Primera toma: ${formatearFecha(medicamento.fecha_hora_inicio)}`
            ),
            crearElemento(
                'p',
                `Frecuencia: cada ${medicamento.intervalo_horas} horas`
            ),
            crearElemento(
                'p',
                `Finalización: ${formatearFecha(medicamento.fecha_hora_fin)}`
            )
        );

        if (medicamento.observaciones) {
            tarjeta.append(
                crearElemento(
                    'p',
                    `Observaciones: ${medicamento.observaciones}`
                )
            );
        }

        const botonDesactivar = crearElemento(
            'button',
            'Desactivar medicamento',
            'boton'
        );

        botonDesactivar.type = 'button';

        botonDesactivar.addEventListener('click', async () => {
            const confirmar = window.confirm(
                `¿Querés desactivar ${medicamento.nombre}?`
            );

            if (!confirmar) return;

            botonDesactivar.disabled = true;

            try {
                const respuesta = await window.API.patch(
                    `/api/medicamentos/${medicamento.id}/desactivar`,
                    { usuarioId: persona.id }
                );

                if (!respuesta?.ok) {
                    throw new Error(
                        respuesta?.mensaje ||
                        'No se pudo desactivar el medicamento.'
                    );
                }

                await cargarMedicamentos();

                mostrarMensaje(
                    elementos.mensajeFormulario,
                    'Medicamento desactivado correctamente.'
                );
            } catch (error) {
                mostrarMensaje(
                    elementos.mensajeFormulario,
                    error.message || 'No se pudo desactivar el medicamento.',
                    'error'
                );
            } finally {
                botonDesactivar.disabled = false;
            }
        });

        tarjeta.append(botonDesactivar);

        return tarjeta;
    };

    const renderizarMedicamentos = () => {
        elementos.listaMedicamentos.replaceChildren();

        elementos.cantidadMedicamentos.textContent =
            `${medicamentos.length} ${
                medicamentos.length === 1 ? 'medicamento' : 'medicamentos'
            }`;

        if (medicamentos.length === 0) {
            elementos.listaMedicamentos.append(elementos.estadoVacio);
            elementos.estadoVacio.hidden = false;
            return;
        }

        elementos.estadoVacio.hidden = true;

        medicamentos.forEach((medicamento) => {
            elementos.listaMedicamentos.append(
                crearTarjetaMedicamento(medicamento)
            );
        });
    };

    const cargarMedicamentos = async () => {
        if (!persona?.id) return;

        try {
            const respuesta = await window.API.get(
                `/api/medicamentos/usuario/${persona.id}`
            );

            if (!respuesta?.ok || !Array.isArray(respuesta.datos)) {
                throw new Error(
                    respuesta?.mensaje ||
                    'No se pudieron recuperar los medicamentos.'
                );
            }

            medicamentos = respuesta.datos.map(normalizarMedicamento);
            renderizarMedicamentos();
        } catch (error) {
            mostrarMensaje(
                elementos.mensajeFormulario,
                error.message || 'Error al cargar los medicamentos.',
                'error'
            );
        }
    };

    const guardarMedicamento = async (evento) => {
        evento.preventDefault();

        if (!persona?.id) {
            mostrarMensaje(
                elementos.mensajeFormulario,
                'Primero necesitás guardar los datos personales.',
                'error'
            );
            mostrarFormularioPersona();
            return;
        }

        const nombre = elementos.nombreMedicamento.value.trim();
        const dosis = elementos.dosis.value.trim();
        const fechaInicio = elementos.fechaHoraInicio.value;
        const intervaloHoras = Number(elementos.intervaloHoras.value);
        const fechaFin = elementos.fechaHoraFin.value;
        const observaciones = elementos.observaciones.value.trim();

        if (!nombre || !dosis || !fechaInicio) {
            mostrarMensaje(
                elementos.mensajeFormulario,
                'Completá el nombre, la dosis y la fecha de inicio.',
                'error'
            );
            return;
        }

        if (
            !Number.isInteger(intervaloHoras) ||
            intervaloHoras < 1 ||
            intervaloHoras > 168
        ) {
            mostrarMensaje(
                elementos.mensajeFormulario,
                'La frecuencia debe ser un número entero entre 1 y 168.',
                'error'
            );
            return;
        }

        if (fechaFin && new Date(fechaFin) <= new Date(fechaInicio)) {
            mostrarMensaje(
                elementos.mensajeFormulario,
                'La finalización debe ser posterior al inicio.',
                'error'
            );
            return;
        }

        elementos.guardarMedicamento.disabled = true;
        mostrarMensaje(elementos.mensajeFormulario, '');

        try {
            const datos = {
                usuarioId: persona.id,
                nombre,
                dosis,
                observaciones,
                fechaHoraInicio: convertirFechaISO(fechaInicio),
                intervaloHoras,
                fechaHoraFin: convertirFechaISO(fechaFin)
            };

            const respuesta = await window.API.post(
                '/api/medicamentos',
                datos
            );

            if (!respuesta?.ok || !respuesta?.datos?.id) {
                throw new Error(
                    respuesta?.mensaje ||
                    'No se pudo registrar el medicamento.'
                );
            }

            const guardado = respuesta.datos;
            const horario = guardado.horario ?? {};

            /*
             * El ID del medicamento debe conservarse.
             * El ID del horario es diferente y no debe reemplazarlo.
             */
            const medicamentoGuardado = normalizarMedicamento({
                ...guardado,
                ...horario,
                id: guardado.id,
                usuario_id: guardado.usuario_id ?? persona.id,
                instrucciones:
                    guardado.instrucciones ?? observaciones,
                fecha_hora_inicio:
                    horario.fecha_hora_inicio ?? datos.fechaHoraInicio,
                intervalo_horas:
                    horario.intervalo_horas ?? intervaloHoras,
                fecha_hora_fin:
                    horario.fecha_hora_fin ?? datos.fechaHoraFin
            });

            medicamentos.unshift(medicamentoGuardado);
            renderizarMedicamentos();

            elementos.formularioMedicamento.reset();

            mostrarMensaje(
                elementos.mensajeFormulario,
                'Medicamento guardado correctamente.'
            );
        } catch (error) {
            mostrarMensaje(
                elementos.mensajeFormulario,
                error.message || 'No se pudo guardar el medicamento.',
                'error'
            );
        } finally {
            elementos.guardarMedicamento.disabled = false;
        }
    };

    /* =========================================
       Inicialización
    ========================================= */

    const inicializar = async () => {
        elementos.formularioPersona.addEventListener(
            'submit',
            guardarPerfil
        );

        elementos.editarPersona.addEventListener('click', () => {
            mostrarFormularioPersona();
        });

        elementos.formularioMedicamento.addEventListener(
            'submit',
            guardarMedicamento
        );

        persona = recuperarPersonaLocal();

        if (persona) {
            mostrarPerfilGuardado();
            await cargarMedicamentos();
        } else {
            mostrarFormularioPersona();
            mostrarSeccionMedicamentos(false);
        }
    };

    inicializar();
})();