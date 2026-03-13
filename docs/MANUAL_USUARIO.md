# Manual de Usuario - Optica Suite

## 1. Objetivo del sistema

Optica Suite es una aplicacion para operar una optica en el dia a dia:

- Gestion de pacientes.
- Registro de ventas de monturas y lentes de laboratorio.
- Control de ordenes de laboratorio.
- Registro de historias clinicas.
- Cierre de caja por usuario.
- Control administrativo (usuarios, auditoria, reportes).

## 2. Tecnologias usadas

- Backend: NestJS + Prisma + PostgreSQL.
- Frontend: React + Vite + TypeScript.
- Base de datos local: Docker Compose.
- Monorepo: pnpm workspaces.

## 3. Roles del sistema

Los roles disponibles son:

- `ADMIN`
- `OPTOMETRA`
- `ASESOR`

## 4. Matriz de permisos (resumen ejecutivo)

| Modulo | ADMIN | OPTOMETRA | ASESOR |
|---|---|---|---|
| Pacientes (crear, ver, editar) | Si | Si | Si |
| Pacientes (eliminar) | Si | No | No |
| Historias clinicas (crear, editar, eliminar) | Si | Si | No |
| Historias clinicas (consultar) | Si | Si | Si |
| Ventas (crear) | Si | Si | Si |
| Ventas (listar/ver) | Todas | Solo propias | Solo propias |
| Ventas (anular) | Cualquiera | Solo propias | Solo propias |
| Ordenes de laboratorio (crear, listar, cambiar estado) | Si | Si | Si |
| Cierres de caja (crear, listar, resumen diario) | Si | Solo propias | Solo propias |
| Cierre de caja para otro usuario | Si | No | No |
| Usuarios (crear, activar/desactivar, reset password) | Si | No | No |
| Auditoria | Si | No | No |
| Reportes comerciales | Si | No | No |
| Movimientos manuales de inventario (API) | Si | No | No |

## 5. Inicio diario (primer arranque del dia)

Desde la raiz del repo:

```bash
pnpm start:all
```

Esto:

1. Sube base de datos con Docker.
2. Aplica migraciones.
3. Carga/actualiza usuario demo.
4. Levanta API y Web.

URLs:

- Web: `http://localhost:5173`
- API: `http://localhost:3000`
- Swagger: `http://localhost:3000/api`

## 6. Acceso al sistema

En entorno demo:

- Correo: `demo@optica.local`
- Contrasena: `Demo12345`

Si un usuario tiene `mustChangePassword = true`, el sistema obliga a cambiar la clave antes de entrar al panel.

## 7. Modulos funcionales

### 7.1 Pacientes

Permite:

- Crear paciente nuevo.
- Buscar/listar pacientes.
- Editar datos.
- Eliminar paciente (solo ADMIN).

Campos principales:

- Nombre, apellido, documento, telefono, correo, ocupacion.

Buenas practicas:

- Evitar duplicados por documento.
- Mantener telefono y correo actualizados.

### 7.2 Historias clinicas

Permite:

- Registrar historia clinica completa por paciente.
- Consultar historias por paciente y rango de fechas.
- Editar/eliminar historia (ADMIN y OPTOMETRA).
- Imprimir hoja clinica.

Incluye secciones clinicas:

- Motivo, antecedentes, lensometria, AV, queratometria, estado motor, refraccion, DP, formula final, segmento posterior, diagnostico y conducta.

### 7.3 Ventas

Permite:

- Crear venta con monturas y/o lentes.
- Aplicar descuento porcentual o en valor.
- Aplicar impuesto.
- Asociar paciente (opcional).
- Anular venta con motivo.
- Imprimir comprobante.

Reglas importantes:

- No permite venta sin items.
- Valida stock de montura.
- Al vender montura, descuenta stock automaticamente.
- Al anular venta, repone stock automaticamente.
- Solo ADMIN puede anular ventas de otros usuarios.

### 7.4 Ordenes de laboratorio

Permite:

- Crear orden de laboratorio asociada a paciente (y opcionalmente a venta).
- Consultar por estado, paciente y busqueda libre.
- Avanzar estado con trazabilidad.

Flujo de estados:

`PENDING -> SENT_TO_LAB -> RECEIVED -> DELIVERED`

Tambien se puede `CANCELLED` segun reglas de transicion.

### 7.5 Cierre de caja

Permite:

- Cerrar caja por rango de fechas.
- Ver esperado vs declarado y diferencia.
- Ver resumen diario (ventas activas/anuladas, utilidad estimada y datos de cierre).

Reglas importantes:

- No permite cierres duplicados para mismo usuario y rango.
- No permite cierres solapados para mismo usuario.
- ADMIN puede cerrar caja de otros usuarios.
- OPTOMETRA y ASESOR solo operan su propia caja.

### 7.6 Sesiones

Permite:

- Ver sesiones activas.
- Revocar sesiones especificas.
- Cerrar sesion actual.
- Cerrar sesion en todos los dispositivos.
- Configurar 2FA (ADMIN): generar setup, activar y desactivar con codigo.

### 7.7 Usuarios (solo ADMIN)

Permite:

- Crear usuarios por rol (`ADMIN`, `OPTOMETRA`, `ASESOR`).
- Activar/desactivar usuarios.
- Resetear contrasena de otro usuario.

Reglas importantes:

- Usuario creado por admin queda con `mustChangePassword = true`.
- Reset por admin deja `mustChangePassword = true`.
- No puedes desactivar tu propio usuario admin.
- No puedes resetear tu propia contrasena desde el flujo admin.

### 7.8 Auditoria (solo ADMIN)

Permite:

- Consultar eventos por modulo, accion, usuario, fecha y texto.
- Exportar auditoria a CSV.

Se registran eventos de:

- Login/logout/refresh.
- Usuarios.
- Pacientes.
- Ventas (incluye anulaciones).
- Historias clinicas.
- Ordenes laboratorio.
- Cierre de caja.

### 7.9 Reportes comerciales (solo ADMIN)

Permite:

- Resumen comercial por periodo.
- Comparativo con periodo anterior.
- Analitica de laboratorio, anulaciones, riesgo, pacientes, monturas, usuarios.
- Filtros por vendedor y metodo de pago.
- Centro de alertas operativas.
- Exportar CSV y PDF.

## 8. Seguridad del sistema

Optica Suite tiene controles de seguridad operativos:

1. 2FA TOTP para cuentas `ADMIN` (configuracion en pestaña `Sesiones`).
2. JWT con access token + refresh token.
3. Refresh token rotativo (cada refresh invalida el anterior).
4. Refresh tokens almacenados con hash (no en texto plano).
5. Politica de contrasena:
   - Minimo 8 caracteres.
   - Al menos una mayuscula.
   - Al menos una minuscula.
   - Al menos un numero.
6. Bloqueo de cuenta por intentos fallidos:
   - 5 intentos fallidos consecutivos.
   - Bloqueo por 15 minutos.
7. Rate limit por IP en login (Redis distribuido con fallback en memoria):
   - Ventana 15 minutos.
   - Hasta 20 fallos por IP.
   - Bloqueo temporal de 10 minutos.
8. CORS por lista de origenes permitidos + `helmet` activo en API.
9. Cierre automatico por inactividad en web:
   - Timeout de 20 minutos.
   - Aviso 1 minuto antes de cerrar.
10. Cierre global de sesiones al cambiar contraseña o al desactivar usuario.
11. Registro de auditoria para acciones sensibles.

## 9. Operacion recomendada

### 9.1 Flujo operativo tipico

1. Registrar paciente.
2. Registrar historia clinica (si aplica consulta).
3. Crear orden de laboratorio (si hay lente formulado).
4. Registrar venta.
5. Actualizar estados de laboratorio hasta entrega.
6. Cerrar caja al final del turno.
7. Revisar reportes y alertas (ADMIN).

### 9.2 Respaldo de base de datos

Comandos utiles:

```bash
pnpm backup:db
pnpm backup:db:keep
pnpm backup:list
```

Restore (ejemplo):

```bash
pnpm restore:db -- --file data/backups/<archivo>.sql --yes
```

## 10. Solucion de problemas comunes

### 10.1 Error `Unauthorized` en pantalla

Causas:

- Token vencido.
- Sesion revocada.
- Rol sin permiso para la accion.

Accion:

1. Cerrar sesion.
2. Iniciar sesion de nuevo.
3. Verificar rol del usuario.

### 10.2 Error `EADDRINUSE: 3000`

Significa que ya hay otra API usando ese puerto.

En PowerShell:

```powershell
Get-NetTCPConnection -LocalPort 3000 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

Luego vuelve a levantar API.

### 10.3 Web no carga en `5173`

Verificar:

1. Que la ventana de `pnpm --filter web dev` siga activa.
2. Que API responda en `http://localhost:3000/health`.
3. Que no haya bloqueos de firewall o antivirus sobre Node.

## 11. Notas importantes para produccion

1. Cambiar credenciales demo.
2. Definir SMTP real para recuperacion de contrasena.
3. Ajustar politicas de backup y retencion.
4. Asegurar HTTPS y secretos fuertes de JWT.
5. Definir responsable funcional por rol (quien crea usuarios, quien audita, quien cierra caja).

---

Manual preparado para la version actual del proyecto en este repositorio.
