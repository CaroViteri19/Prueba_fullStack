const express = require('express');
const { Pool } = require('pg');

const router = express.Router();
const pool = new Pool(); // Usa las variables de entorno por defecto

// GET /api/orders - Obtiene las órdenes del usuario autenticado con sus ítems
router.get('/api/orders', async (req, res) => {
  try {
    // 1. Tomamos el usuario autenticado del middleware previo (nunca del query string sin validar)
    const userId = req.user.id;

    // 2. Paginación básica con valores por defecto y límites razonables
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

    // 3. Primera consulta: traemos las órdenes del usuario usando parámetros ($1, $2, $3) para evitar SQL Injection
    const ordersResult = await pool.query(
      `SELECT id, user_id, status, total_amount, created_at
       FROM orders
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    const orders = ordersResult.rows;

    // Si el usuario no tiene órdenes, devolvemos un arreglo vacío de inmediato
    if (orders.length === 0) {
      return res.json([]);
    }

    // 4. Evitamos el problema N+1: extraemos todos los IDs y traemos los ítems en UNA sola consulta
    const orderIds = orders.map((order) => order.id);

    const itemsResult = await pool.query(
      `SELECT id, order_id, product_id, quantity, unit_price
       FROM order_items
       WHERE order_id = ANY($1)`,
      [orderIds]
    );

    // 5. Agrupamos los ítems por order_id en memoria (simple y rápido)
    const itemsByOrderId = {};
    for (const item of itemsResult.rows) {
      if (!itemsByOrderId[item.order_id]) {
        itemsByOrderId[item.order_id] = [];
      }
      itemsByOrderId[item.order_id].push(item);
    }

    // Asignamos a cada orden su lista de ítems
    const ordersWithItems = orders.map((order) => ({
      ...order,
      items: itemsByOrderId[order.id] || [],
    }));

    return res.json(ordersWithItems);
  } catch (error) {
    console.error('Error al obtener las órdenes:', error);
    return res.status(500).json({ error: 'Error interno al consultar las órdenes' });
  }
});

module.exports = router;
