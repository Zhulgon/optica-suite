# Instalador LAN para empresas pequenas (sin dominio)

Este modo permite operar Optica Suite en red local, sin publicar en internet.

## Escenario recomendado

- Un equipo servidor dentro de la optica (Windows 10/11 Pro).
- Los demas equipos acceden por navegador usando IP local del servidor.

## Requisitos

1. Docker Desktop instalado y abierto.
2. Git instalado.
3. Este repositorio descargado en el servidor.

## Instalacion en Windows (modo sencillo)

1. Abre la carpeta:
   - `installer/windows`
2. Ejecuta doble clic:
   - `INSTALAR_LAN.cmd`

El instalador:

1. Crea `.env.lan` desde `.env.lan.example` (si no existe).
2. Intenta detectar IP local y ajustar URLs.
3. Construye y levanta `db`, `redis`, `api_migrate`, `api`, `web`.
4. Ejecuta migraciones y seed inicial de usuarios.

## Accesos

- Web: `http://IP_DEL_SERVIDOR:8080`
- API: `http://IP_DEL_SERVIDOR:3000`
- Swagger: `http://IP_DEL_SERVIDOR:3000/api`

## Usuarios iniciales (por defecto)

- Admin: `admin@optica.local` / `Admin12345`
- Optometra: `opto@optica.local` / `Opto12345`
- Asesor: `asesor@optica.local` / `Asesor12345`

Recomendacion: cambia contrasenas en el primer ingreso.

## Operacion diaria

- Iniciar: `installer/windows/INICIAR_LAN.cmd`
- Estado: `installer/windows/ESTADO_LAN.cmd`
- Detener: `installer/windows/DETENER_LAN.cmd`

## Personalizacion

Edita `.env.lan` para:

1. Cambiar IP/puertos de acceso.
2. Cambiar datos de usuarios iniciales.
3. Cambiar nombre comercial del comprobante.
4. Ajustar secretos y politicas de seguridad.

## Backup recomendado

1. Ejecuta backup diario:
   - `pnpm backup:db -- --keep 14`
2. Copia carpeta `data/backups` a disco externo o NAS.
