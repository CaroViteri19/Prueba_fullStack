# Prueba Técnica Full Stack - Ejercicios de Código

Este repositorio contiene las soluciones en código correspondientes a los **Puntos 1 y 3** de la prueba técnica Full Stack.

El enfoque principal del código es la simplicidad, legibilidad y buenas prácticas esenciales (seguridad, rendimiento y manejo de concurrencia) sin caer en sobreingeniería.

## Estructura del Repositorio

```text
├── README.md
├── punto-1-revision/
│   ├── 1.1-orders-endpoint.js         # Corrección de SQL Injection, paginación y problema N+1
│   ├── 1.2-product-list.component.ts  # Búsqueda en Angular con RxJS (debounce y switchMap)
│   └── 1.3-query-optimizada.sql       # Optimización de consulta de ingresos e índices
└── punto-3-ordenes/
    ├── schema.sql                     # Esquema PostgreSQL para inventario, órdenes e idempotencia
    └── create-order-endpoint.js       # Creación de órdenes con transacciones, bloqueos y control de stock
```

## Resumen de Soluciones

### Punto 1: Revisión y Optimización de Código
- **1.1 Endpoint de Órdenes (Node.js / Express):** Uso de consultas parametrizadas (`$1, $2...`), paginación con `limit/offset` y resolución del problema N+1 en dos consultas simples agrupando los ítems en memoria.
- **1.2 Buscador de Productos (Angular):** Standalone component con `FormControl` y operadores RxJS (`debounceTime`, `distinctUntilChanged`, `switchMap`, `catchError`) para evitar condiciones de carrera y peticiones innecesarias.
- **1.3 Consulta SQL Optimizada:** Uso de rangos de fecha directos para aprovechar índices (SARGable), conteo exacto con `COUNT(DISTINCT o.id)` y agrupación correcta por ID de cliente.

### Punto 3: Procesamiento de Órdenes y Concurrencia
- **Esquema (`schema.sql`):** Tablas mínimas con restricciones `CHECK` en el stock para garantizar a nivel de base de datos que nunca existan saldos negativos.
- **Creación de Orden (`create-order-endpoint.js`):** Manejo de idempotencia (`Idempotency-Key`), prevención de deadlocks ordenando los SKUs alfabéticamente y bloqueo pesimista (`SELECT ... FOR UPDATE`) dentro de una transacción ACID.
