# Changelog

Todos los cambios relevantes de este proyecto se documentan en este archivo.

## v1.0.0-beta - 2026-03-12

### Nuevo
- Gestión clínica integrada en web: creación, edición, eliminación e impresión de historias clínicas.
- Gestión de pacientes con edición/eliminación desde interfaz y validaciones por rol.
- Trazabilidad comercial: ventas con usuario creador y panel de auditoría de eventos.
- Panel de administración de usuarios (rol ADMIN): creación, activación/desactivación y reseteo de contraseña.
- Reportes comerciales de ventas (resumen, por usuario y top de monturas) con exportación CSV.
- Seguridad reforzada: refresh tokens, cierre de sesión global, bloqueo por intentos fallidos y auto-logout por inactividad.
- Scripts de operación: backup/restore de base de datos y seed de usuario demo.
- Pipeline base de CI/CD y entorno inicial de staging.

### Mejorado
- Experiencia web (UI/DX): estados de carga tipo skeleton, estados vacíos claros y mensajes de feedback contextual.
- Navegación rápida: persistencia de pestaña activa, atajos de teclado por módulo y acción "Recargar vista".
- Estabilidad de arranque del API: corrección de scripts `start`, `start:dev` y `start:prod`.

### Notas
- Esta versión es beta para validación funcional y operativa previa a producción.
