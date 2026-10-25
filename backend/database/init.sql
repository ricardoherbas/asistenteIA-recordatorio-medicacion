
CREATE TABLE usuarios (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    apellido VARCHAR(100) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE medicamentos (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    usuario_id BIGINT NOT NULL
        REFERENCES usuarios(id) ON DELETE CASCADE,
    nombre VARCHAR(150) NOT NULL,
    dosis VARCHAR(100) NOT NULL,
    instrucciones TEXT,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE horarios_medicacion (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    medicamento_id BIGINT NOT NULL
        REFERENCES medicamentos(id) ON DELETE CASCADE,
    fecha_hora_inicio TIMESTAMPTZ NOT NULL,
    intervalo_horas INTEGER NOT NULL,
    fecha_hora_fin TIMESTAMPTZ,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT chk_intervalo_horas
        CHECK (intervalo_horas > 0),

    CONSTRAINT chk_fecha_horario
        CHECK (
            fecha_hora_fin IS NULL
            OR fecha_hora_fin > fecha_hora_inicio
        )
);

CREATE TABLE registro_tomas (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    horario_id BIGINT NOT NULL
        REFERENCES horarios_medicacion(id) ON DELETE RESTRICT,
    fecha_programada DATE NOT NULL,
    hora_programada TIME NOT NULL,
    estado VARCHAR(25) NOT NULL DEFAULT 'pendiente',
    confirmada_en TIMESTAMPTZ,
    origen_confirmacion VARCHAR(20),
    creado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uq_registro_toma
        UNIQUE (horario_id, fecha_programada, hora_programada),

    CONSTRAINT chk_estado_toma
        CHECK (
            estado IN (
                'pendiente',
                'confirmada',
                'cancelada',
                'sin_confirmacion'
            )
        ),

    CONSTRAINT chk_origen_confirmacion
        CHECK (
            origen_confirmacion IS NULL
            OR origen_confirmacion IN ('web', 'voz')
        ),

    CONSTRAINT chk_confirmacion_toma
        CHECK (
            (
                estado = 'confirmada'
                AND confirmada_en IS NOT NULL
                AND origen_confirmacion IS NOT NULL
            )
            OR
            (
                estado <> 'confirmada'
                AND confirmada_en IS NULL
                AND origen_confirmacion IS NULL
            )
        )
);

CREATE TABLE alertas (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    usuario_id BIGINT NOT NULL
        REFERENCES usuarios(id) ON DELETE CASCADE,
    registro_toma_id BIGINT NOT NULL
        REFERENCES registro_tomas(id) ON DELETE CASCADE,
    tipo VARCHAR(30) NOT NULL,
    mensaje TEXT NOT NULL,
    programada_en TIMESTAMPTZ NOT NULL,
    enviada_en TIMESTAMPTZ,
    estado VARCHAR(20) NOT NULL DEFAULT 'pendiente',
    intentos_envio INTEGER NOT NULL DEFAULT 0,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT chk_tipo_alerta
        CHECK (
            tipo IN (
                'recordatorio_medicacion',
                'seguimiento_medicacion'
            )
        ),

    CONSTRAINT chk_estado_alerta
        CHECK (
            estado IN ('pendiente', 'enviada', 'cancelada', 'error')
        ),

    CONSTRAINT chk_intentos_envio
        CHECK (intentos_envio >= 0)
);
