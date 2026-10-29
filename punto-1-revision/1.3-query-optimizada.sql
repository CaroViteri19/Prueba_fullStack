-- ============================================================================
-- 1.3 Consulta optimizada de ingresos por cliente para el día 2026-10-01
-- ============================================================================

-- Índices recomendados para que la consulta sea rápida en tablas grandes:
-- CREATE INDEX idx_orders_created_at_customer ON orders (created_at, customer_id);
-- CREATE INDEX idx_order_items_order_id ON order_items (order_id);

SELECT
    c.id AS customer_id,
    c.name AS customer_name,
    -- Usamos DISTINCT para que el JOIN con order_items no infle el conteo de órdenes
    COUNT(DISTINCT o.id) AS total_orders,
    SUM(oi.quantity * oi.unit_price) AS total_revenue
FROM customers c
JOIN orders o ON o.customer_id = c.id
JOIN order_items oi ON oi.order_id = o.id
-- Rango directo sin DATE(o.created_at) para poder usar el índice sobre created_at
WHERE o.created_at >= '2026-10-01 00:00:00'
  AND o.created_at <  '2026-10-02 00:00:00'
-- Agrupamos por ID y nombre para no mezclar clientes distintos que se llamen igual
GROUP BY c.id, c.name
ORDER BY total_revenue DESC;
