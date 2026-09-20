# SESSION.md — sesión actual

| Campo | Valor |
|---|---|
| **Inicio** | 2026-09-20 |
| **Iteración** | ITER-001 (en curso) |
| **Fase** | 1 — Plan/Implementación: fundaciones + SPEC-001 |
| **Objetivo de la sesión** | Dejar SPEC-001 aprobada, verificar en vivo la API de autenticación y preparar la suite de 15 AC |
| **Checkpoint** | `context-checkpoints/ITER-001-20260920-1700.md` (manual, 17:00) |

## Log de actividad

1. Relevamiento del directorio (vacío) y de los proyectos hermanos (convenciones de MVC, docs y despliegue).
2. Verificación de las skills SAQI Nivel A (`A-context-manager`, `A-project-architecture`, `A-sdd`).
3. Nueve decisiones cerradas con el usuario, una pregunta a la vez, con opciones y recomendación.
4. Verificaciones empíricas: puerto 8100 libre, `node:sqlite` sin flag, vhost nginx `:8000`, Funnel,
cron del watchdog de Química, `sudo` con contraseña, disco `/home` al 86 %.
5. Escritura de `AGENT.md` (16 secciones), `ARCHITECTURE.md`, `CHECKPOINT.md`, `README.md`, `AGENTS.md` y docs vivos.
6. Implementación del verificador `npm run check:docs` y del generador `npm run context:live`;
   el generador se ejecutó tres veces porque la primera reveló tres defectos reales (health duplicado,
   encabezado de disco repetido y tabla del Funnel rota por un separador).
7. Pruebas negativas del verificador (contradicción de despliegue y token de infraestructura) → falla como debe.
8. `git init` + commit inicial + etiqueta `v0.0.1-fase0`.
9. Paso 0 (sellar SPEC-001 aprobada) + Fase A (andamiaje) + Fase B (auth verificada en vivo) +
   suite iniciada (`tests/helpers/`) + corrección real de `cookiePath`.

## Decisiones de la sesión

- Publicar `/gastos/` como `location` de nginx y **no** como ruta del Funnel (evita que el watchdog la borre).
- `docs/Context_live.md` **fuera de git** (regla dura de `~/Config-System`: no publicar infraestructura).
- Los umbrales de contexto son 70 % (resumen) y 80 % (checkpoint), según la skill SAQI.

## Hallazgos / bloqueadores

- El generador de `~/Config-System/Context_live.md` **pisa** las "Notas / Pendientes" con texto hardcodeado:
regenerarlo destruiría las notas manuales. En este proyecto se corrige con marcadores de bloque.
- `sudo` pide contraseña en la máquina: usar `pkexec` para cambios de sistema.

## Próximos pasos inmediatos

1. Escribir la suite de tests de SPEC-001 (`tests/run-all.js` + 8 archivos, 15 AC).
2. Implementar la Fase C: `index.html`, CSS mobile-first, `ApiClient`, `LoginController`/`LoginView`/`HomeView`.
3. Cerrar ITER-001: `npm test` + `check:docs` en verde, actualizar `CHECKPOINT.md`/`PROJECT_STATE.md`/`QA_RESULTS.md`, checkpoint formal, commit + etiqueta.
