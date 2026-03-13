# Checklist de Implantacion Local (LAN)

Escenario: optica quiere operar sin dominio publico, dentro de red interna.

## 1) Infraestructura minima

Servidor local:

- CPU: 4 nucleos recomendados
- RAM: 8 GB recomendado
- SSD: 256 GB o mas
- SO: Windows 10/11 Pro o Ubuntu 22.04+
- Docker Desktop o Docker Engine

Red:

- IP fija para el servidor LAN
- Router estable y energia protegida (UPS ideal)

## 2) Instalacion

1. Clonar repo.
2. Configurar `.env` de API y Web para IP local.
3. Levantar `db + redis + api + web`.
4. Ejecutar migraciones.
5. Crear usuarios iniciales.

## 3) Acceso de usuarios

En los equipos cliente:

- Abrir navegador en `http://IP_SERVIDOR:8080` (o puerto definido).

## 4) Validacion funcional minima

1. Login admin.
2. Crear paciente.
3. Crear historia clinica.
4. Agendar cita.
5. Registrar venta.
6. Ver auditoria.

## 5) Operacion diaria

1. Verificar servicios arriba al inicio de jornada.
2. Backup diario automatico.
3. Revision de salud (`ops:health`) al menos 1 vez al dia.

## 6) Continuidad

1. Copia de backups fuera del servidor (disco externo o NAS).
2. Prueba de restauracion mensual.
3. Procedimiento de reinicio documentado para el cliente.
