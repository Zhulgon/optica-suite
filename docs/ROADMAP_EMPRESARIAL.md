# Roadmap Empresarial (3 sprints)

Objetivo: llevar Optica Suite de "operacion estable" a "producto comercial empresarial" para opticas pequenas y medianas.

## Sprint 1 - Operacion Segura (en curso)

Duracion sugerida: 1 semana

Enfoque:
- Calidad continua obligatoria en cada push.
- Base demo reproducible (usuarios y stock minimo).
- Checklist operativo para arranque diario y continuidad.

Entregables:
- CI con:
  - build API + web
  - lint API + web
  - e2e API
  - smoke end-to-end (qa:full)
- Seed demo reforzado:
  - sede principal
  - usuarios demo (admin, optometra, asesor)
  - monturas base para pruebas
- Definicion de politicas recomendadas de branch protection.

Indicadores de salida:
- Todo PR queda bloqueado si falla calidad.
- Entorno nuevo queda usable en menos de 10 minutos.
- Sin "arranques vacios" (sin usuarios o sin inventario base).

## Sprint 2 - Flujo Comercial Completo

Duracion sugerida: 1.5 semanas

Enfoque:
- Mejorar conversion y control financiero diario.

Entregables:
- Modulo de cuentas por cobrar:
  - venta a credito
  - abonos parciales
  - saldo pendiente y vencido
- Reporte de recaudo:
  - pendiente total
  - vencido por rango
  - ranking por cliente
- Alertas operativas:
  - cuentas vencidas
  - pacientes con orden de laboratorio sin cierre comercial

Indicadores de salida:
- Trazabilidad completa de cartera por paciente.
- Cierre diario muestra venta cobrada vs venta pendiente.

## Sprint 3 - Escala Comercial

Duracion sugerida: 2 semanas

Enfoque:
- Volver el sistema mas vendible y defendible frente a competencia.

Entregables:
- Agenda de citas con recordatorios.
- Versionado inmutable de historia clinica (linea de tiempo de cambios).
- Reporte ejecutivo avanzado por sede y rol:
  - cumplimiento de meta
  - margen por vendedor
  - top productos y top riesgo

Indicadores de salida:
- Menos inasistencia de citas.
- Auditoria clinica completa sin perdida de historial.
- Direccion comercial con tablero semanal de decisiones.

## Riesgos y mitigaciones

- Riesgo: sobrecargar el equipo con muchas funciones nuevas.
  - Mitigacion: cerrar cada sprint con pruebas, demo y documentacion corta.
- Riesgo: regresiones por cambios en Prisma.
  - Mitigacion: migraciones pequenas + QA automatica en CI.
- Riesgo: despliegues inestables.
  - Mitigacion: usar staging obligatorio antes de produccion.

## Orden recomendado de implementacion

1. Sprint 1 completo (obligatorio antes de ampliar negocio).
2. Sprint 2 completo (flujo de dinero).
3. Sprint 3 completo (escala y diferenciacion).
