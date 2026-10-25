
(() => {
    'use strict';

    const formularioPersona = document.getElementById('form-persona');
    const formulario = document.getElementById('form-medicamento');

    if (!formularioPersona || !formulario) return;

    const campoPersonaNombre = document.getElementById('persona-nombre');
    const campoPersonaApellido = document.getElementById('persona-apellido');
    const campoPersonaEmail = document.getElementById('persona-email');
    const mensajePersona = document.getElementById('mensaje-persona');
    const resumenPersona = document.getElementById('resumen-persona');
    const botonGuardarPersona = document.getElementById('guardar-persona');

    const campoNombre = document.getElementById('nombre');
    const campoDosis = document.getElementById('dosis');
    const campoFechaHoraInicio = document.getElementById('fecha-hora-inicio');
    const campoIntervaloHoras = document.getElementById('intervalo-horas');
    const campoFechaHoraFin = document.getElementById('fecha-hora-fin');
    const campoObservaciones = document.getElementById('observaciones');
    const resumenHorarios = document.getElementById('resumen-horarios');
    const listaMedicamentos = document.getElementById('lista-medicamentos');
    const estadoVacio = document.getElementById('estado-vacio');
    const cantidadMedicamentos = document.getElementById('cantidad-medicamentos');
    const mensajeFormulario = document.getElementById('mensaje-formulario');
    const botonGuardar = document.getElementById('guardar-medicamento');

    let persona = null;
    const medicamentos = [];

    const crearElemento = (etiqueta, clase, texto) => {
        const elemento = document.createElement(etiqueta);
        if (clase) elemento.className = clase;
        if (texto !== undefined) elemento.textContent = texto;
        return elemento;
    };

    const mostrarMensajePersona = (texto, tipo) => {
        mensajePersona.textContent = texto;
        mensajePersona.className = `mensaje mensaje--${tipo}`;
        mensajePersona.hidden = false;
    };

    const ocultarMensajePersona = () => {
        mensajePersona.textContent = '';
        mensajePersona.hidden = true;
        mensajePersona.className = 'mensaje';
    };

    const mostrarMensaje = (texto, tipo) => {
        mensajeFormulario.textContent = texto;
        mensajeFormulario.className = `mensaje mensaje--${tipo}`;
        mensajeFormulario.hidden = false;
    };

    const ocultarMensaje = () => {
        mensajeFormulario.textContent = '';
        mensajeFormulario.hidden = true;
        mensajeFormulario.className = 'mensaje';
    };

    const convertirFechaLocal = (valor) => {
        if (!valor) return null;
        const fecha = new Date(valor);
        if (Number.isNaN(fecha.getTime())) return null;
        return fecha;
    };

    const formatearFechaHora = (valor) => {
        const fecha = convertirFechaLocal(valor);
        if (!fecha) return 'No especificada';
        return new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short' }).format(fecha);
    };

    const formatearHora = (fecha) => new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false }).format(fecha);

    const obtenerProximasTomas = (medicamento, cantidad = 5) => {
        const inicio = convertirFechaLocal(medicamento.fechaHoraInicio);
        const fin = convertirFechaLocal(medicamento.fechaHoraFin);
        const intervaloMs = medicamento.intervaloHoras * 60 * 60 * 1000;

        if (!inicio || !Number.isFinite(intervaloMs) || intervaloMs <= 0) return [];

        const tomas = [];
        let fechaToma = new Date(inicio);

        while (tomas.length < cantidad) {
            if (fin && fechaToma > fin) break;
            tomas.push(new Date(fechaToma));
            fechaToma = new Date(fechaToma.getTime() + intervaloMs);
        }

        return tomas;
    };

    const renderizarResumenPersona = () => {
        resumenPersona.replaceChildren();

        if (!persona) {
            resumenPersona.textContent = 'Todavía no guardaste tus datos personales.';
            return;
        }

        resumenPersona.textContent = `Perfil registrado para ${persona.nombre} ${persona.apellido} (${persona.email}).`;
    };

    const actualizarResumenHorarios = () => {
        const inicio = campoFechaHoraInicio.value;
        const intervalo = Number(campoIntervaloHoras.value);
        const fin = campoFechaHoraFin.value;

        resumenHorarios.replaceChildren();

        if (!inicio || !intervalo) {
            resumenHorarios.textContent = 'Completá el inicio y la frecuencia para visualizar las próximas tomas.';
            return;
        }

        const medicamentoTemporal = { fechaHoraInicio: inicio, fechaHoraFin: fin || null, intervaloHoras: intervalo };
        const tomas = obtenerProximasTomas(medicamentoTemporal);

        if (tomas.length === 0) {
            resumenHorarios.textContent = 'No hay tomas dentro del período indicado.';
            return;
        }

        const titulo = crearElemento('p', '', 'Ejemplo de las próximas tomas programadas:');
        const lista = crearElemento('ul', 'lista-proximas-tomas');

        tomas.forEach((fecha) => {
            const texto = new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short' }).format(fecha);
            lista.appendChild(crearElemento('li', '', texto));
        });

        resumenHorarios.append(titulo, lista);
    };

    formularioPersona.addEventListener('submit', (evento) => {
        evento.preventDefault();
        ocultarMensajePersona();

        const nombre = campoPersonaNombre.value.trim();
        const apellido = campoPersonaApellido.value.trim();
        const email = campoPersonaEmail.value.trim();

        if (!nombre || !apellido || !email) {
            mostrarMensajePersona('Completá el nombre, apellido y email.', 'error');
            return;
        }

        if (!campoPersonaEmail.validity.valid) {
            mostrarMensajePersona('Ingresá un email válido.', 'error');
            campoPersonaEmail.focus();
            return;
        }

        botonGuardarPersona.disabled = true;

        try {
            persona = { nombre, apellido, email };
            sessionStorage.setItem('persona', JSON.stringify(persona));
            renderizarResumenPersona();
            mostrarMensajePersona('Perfil guardado temporalmente. Todavía no se guardó en la base de datos.', 'exito');
        } catch (error) {
            console.error('Error al guardar los datos personales:', error);
            mostrarMensajePersona('No se pudieron guardar los datos personales en esta sesión.', 'error');
        } finally {
            botonGuardarPersona.disabled = false;
        }
    });

    const crearTarjetaMedicamento = (medicamento) => {
        const tarjeta = crearElemento('article', 'tarjeta-medicamento');
        const encabezado = crearElemento('div', 'tarjeta-medicamento__encabezado');
        const nombre = crearElemento('h3', '', medicamento.nombre);
        const dosis = crearElemento('p', 'tarjeta-medicamento__dosis', medicamento.dosis);

        encabezado.append(nombre, dosis);

        const tituloInicio = crearElemento('h4', '', 'Inicio del tratamiento');
        const inicio = crearElemento('p', '', formatearFechaHora(medicamento.fechaHoraInicio));
        const tituloFrecuencia = crearElemento('h4', '', 'Frecuencia');
        const frecuencia = crearElemento('p', '', `Cada ${medicamento.intervaloHoras} horas`);
        const tituloFin = crearElemento('h4', '', 'Finalización');
        const fin = crearElemento('p', '', medicamento.fechaHoraFin ? formatearFechaHora(medicamento.fechaHoraFin) : 'Sin fecha de finalización especificada');
        const tituloProximas = crearElemento('h4', '', 'Próximas tomas calculadas');
        const listaProximas = crearElemento('ul', 'tarjeta-medicamento__horarios');
        const tomas = obtenerProximasTomas(medicamento);

        if (tomas.length === 0) {
            listaProximas.appendChild(crearElemento('li', '', 'No hay tomas en el período indicado.'));
        } else {
            tomas.forEach((fecha) => listaProximas.appendChild(crearElemento('li', '', formatearFechaHora(fecha))));
        }

        tarjeta.append(encabezado, tituloInicio, inicio, tituloFrecuencia, frecuencia, tituloFin, fin, tituloProximas, listaProximas);

        if (medicamento.observaciones) {
            tarjeta.append(crearElemento('h4', '', 'Instrucciones u observaciones'), crearElemento('p', 'tarjeta-medicamento__observaciones', medicamento.observaciones));
        }

        const botonEliminar = crearElemento('button', 'boton boton--secundario tarjeta-medicamento__eliminar', 'Eliminar de la lista');
        botonEliminar.type = 'button';

        botonEliminar.addEventListener('click', () => {
            const indice = medicamentos.findIndex((item) => item.id === medicamento.id);
            if (indice === -1) return;
            medicamentos.splice(indice, 1);
            renderizarMedicamentos();
            mostrarMensaje('Medicamento eliminado de la lista temporal.', 'exito');
        });

        tarjeta.appendChild(botonEliminar);
        return tarjeta;
    };

    const renderizarMedicamentos = () => {
        listaMedicamentos.querySelectorAll('.tarjeta-medicamento').forEach((tarjeta) => tarjeta.remove());
        estadoVacio.hidden = medicamentos.length > 0;
        medicamentos.forEach((medicamento) => listaMedicamentos.appendChild(crearTarjetaMedicamento(medicamento)));

        const cantidad = medicamentos.length;
        cantidadMedicamentos.textContent = `${cantidad} ${cantidad === 1 ? 'medicamento' : 'medicamentos'}`;
    };

    [campoFechaHoraInicio, campoIntervaloHoras, campoFechaHoraFin].forEach((campo) => {
        campo.addEventListener('input', actualizarResumenHorarios);
        campo.addEventListener('change', actualizarResumenHorarios);
    });

    formulario.addEventListener('submit', (evento) => {
        evento.preventDefault();
        ocultarMensaje();

        if (!persona) {
            mostrarMensaje('Primero completá y guardá los datos de la persona.', 'error');
            formularioPersona.scrollIntoView({ behavior: 'smooth', block: 'start' });
            campoPersonaNombre.focus();
            return;
        }

        const nombre = campoNombre.value.trim();
        const dosis = campoDosis.value.trim();
        const fechaHoraInicio = campoFechaHoraInicio.value;
        const intervaloHoras = Number(campoIntervaloHoras.value);
        const fechaHoraFin = campoFechaHoraFin.value || null;
        const observaciones = campoObservaciones.value.trim();

        if (!nombre || !dosis) {
            mostrarMensaje('Completá el nombre y la dosis del medicamento.', 'error');
            return;
        }

        if (!fechaHoraInicio || !intervaloHoras) {
            mostrarMensaje('Indicá la fecha y hora de inicio y la frecuencia de toma.', 'error');
            return;
        }

        const inicio = convertirFechaLocal(fechaHoraInicio);
        const fin = fechaHoraFin ? convertirFechaLocal(fechaHoraFin) : null;

        if (!inicio) {
            mostrarMensaje('Ingresá una fecha y hora de inicio válidas.', 'error');
            campoFechaHoraInicio.focus();
            return;
        }

        if (!Number.isInteger(intervaloHoras) || intervaloHoras <= 0) {
            mostrarMensaje('Seleccioná un intervalo válido entre las opciones disponibles.', 'error');
            campoIntervaloHoras.focus();
            return;
        }

        if (fechaHoraFin && !fin) {
            mostrarMensaje('Ingresá una fecha y hora de finalización válidas.', 'error');
            campoFechaHoraFin.focus();
            return;
        }

        if (fin && fin <= inicio) {
            mostrarMensaje('La finalización debe ser posterior al inicio del tratamiento.', 'error');
            campoFechaHoraFin.focus();
            return;
        }

        botonGuardar.disabled = true;

        try {
            const medicamento = { id: crypto.randomUUID(), nombre, dosis, fechaHoraInicio, intervaloHoras, fechaHoraFin, observaciones };
            medicamentos.push(medicamento);
            renderizarMedicamentos();
            formulario.reset();
            resumenHorarios.textContent = 'Completá el inicio y la frecuencia para visualizar las próximas tomas.';
            mostrarMensaje('Medicamento agregado a la lista temporal. Todavía no se guardó en la base de datos.', 'exito');
        } catch (error) {
            console.error('Error al agregar el medicamento:', error);
            mostrarMensaje('No se pudo agregar el medicamento.', 'error');
        } finally {
            botonGuardar.disabled = false;
        }
    });

    try {
        const personaGuardada = sessionStorage.getItem('persona');
        persona = personaGuardada ? JSON.parse(personaGuardada) : null;
    } catch {
        persona = null;
    }

    if (persona) {
        campoPersonaNombre.value = persona.nombre || '';
        campoPersonaApellido.value = persona.apellido || '';
        campoPersonaEmail.value = persona.email || '';
    }

    renderizarResumenPersona();
    renderizarMedicamentos();
    actualizarResumenHorarios();
})();
