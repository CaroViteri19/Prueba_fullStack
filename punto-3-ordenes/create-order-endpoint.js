const express = require('express');
const { Pool } = require('pg');
const crypto = require('crypto');

const router = express.Router();
const pool = new Pool();

// Helper simple para lanzar errores de negocio con código HTTP
function createHttpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

// POST /api/v1/orders - Crea una orden reservando stock de forma segura
router.post('/api/v1/orders', async (req, res) => {
  const idempotencyKey = req.headers['idempotency-key'];
  const { customerId, items } = req.body;

  // 1. Validaciones básicas de entrada
  if (!idempotencyKey) {
    return res.status(400).json({ error: 'El header Idempotency-Key es obligatorio' });
  }

  if (!customerId || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Datos de orden inválidos: se requiere customerId e items' });
  }

  for (const item of items) {
    if (!item.sku || !Number.isInteger(item.quantity) || item.quantity <= 0) {
      return res.status(400).json({ error: 'Cada ítem debe tener un sku válido y quantity > 0' });
    }
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 2. Verificamos la llave de idempotencia bloqueando la fila si ya existe
    const idemResult = await client.query(
      `SELECT status, response_code, response_body
       FROM idempotency_keys
       WHERE key = $1
       FOR UPDATE`,
      [idempotencyKey]
    );

    if (idemResult.rows.length > 0) {
      const existingKey = idemResult.rows[0];

      // Si ya se completó antes, devolvemos exactamente la misma respuesta guardada
      if (existingKey.status === 'COMPLETED') {
        await client.query('ROLLBACK');
        return res.status(existingKey.response_code).json(existingKey.response_body);
      }

      // Si otra petición con la misma llave sigue en curso, devolvemos 409 Conflict
      if (existingKey.status === 'IN_PROGRESS') {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'La orden ya se está procesando actualmente' });
      }
    } else {
      // Registramos la llave en estado IN_PROGRESS
      await client.query(
        `INSERT INTO idempotency_keys (key, customer_id, status)
         VALUES ($1, $2, 'IN_PROGRESS')`,
        [idempotencyKey, customerId]
      );
    }

    // 3. Ordenamos los ítems alfabéticamente por SKU antes de bloquear filas.
    // Esto garantiza que todas las transacciones bloqueen en el mismo orden y evita deadlocks.
    const sortedItems = [...items].sort((a, b) => a.sku.localeCompare(b.sku));

    let totalAmount = 0;
    const itemsToInsert = [];

    // 4. Bloqueamos cada producto con FOR UPDATE, validamos stock y reservamos
    for (const item of sortedItems) {
      const productResult = await client.query(
        `SELECT sku, price, available_stock
         FROM inventory
         WHERE sku = $1
         FOR UPDATE`,
        [item.sku]
      );

      if (productResult.rows.length === 0) {
        throw createHttpError(404, `El producto con SKU ${item.sku} no existe`);
      }

      const product = productResult.rows[0];

      if (product.available_stock < item.quantity) {
        throw createHttpError(409, `Stock insuficiente para el SKU ${item.sku}`);
      }

      // Descontamos de available_stock y sumamos a reserved_stock
      await client.query(
        `UPDATE inventory
         SET available_stock = available_stock - $1,
             reserved_stock = reserved_stock + $1
         WHERE sku = $2`,
        [item.quantity, item.sku]
      );

      const unitPrice = Number(product.price);
      totalAmount += unitPrice * item.quantity;

      itemsToInsert.push({
        sku: item.sku,
        quantity: item.quantity,
        unitPrice,
      });
    }

    // 5. Insertamos la orden en estado PENDING_PAYMENT con expiración de 10 minutos
    const orderId = crypto.randomUUID();
    const orderResult = await client.query(
      `INSERT INTO orders (id, customer_id, status, total_amount, expires_at)
       VALUES ($1, $2, 'PENDING_PAYMENT', $3, NOW() + INTERVAL '10 minutes')
       RETURNING id, customer_id, status, total_amount, expires_at, created_at`,
      [orderId, customerId, totalAmount]
    );

    // 6. Insertamos el detalle de los ítems de la orden
    for (const item of itemsToInsert) {
      await client.query(
        `INSERT INTO order_items (order_id, sku, quantity, unit_price)
         VALUES ($1, $2, $3, $4)`,
        [orderId, item.sku, item.quantity, item.unitPrice]
      );
    }

    const responseBody = {
      orderId: orderResult.rows[0].id,
      status: orderResult.rows[0].status,
      totalAmount: Number(orderResult.rows[0].total_amount),
      expiresAt: orderResult.rows[0].expires_at,
      items: itemsToInsert,
    };

    // 7. Actualizamos la llave de idempotencia a COMPLETED guardando el JSON de respuesta
    await client.query(
      `UPDATE idempotency_keys
       SET status = 'COMPLETED',
           response_code = 201,
           response_body = $1
       WHERE key = $2`,
      [JSON.stringify(responseBody), idempotencyKey]
    );

    await client.query('COMMIT');

    // NOTA IMPORTANTE DE ARQUITECTURA:
    // Cualquier llamada HTTP a una pasarela de pagos externa (Stripe, MercadoPago, etc.)
    // se debe realizar AQUÍ, FUERA de la transacción de base de datos (después del COMMIT)
    // o mediante un proceso asíncrono. Hacer llamadas de red dentro del BEGIN/COMMIT
    // mantendría bloqueadas las filas del inventario durante segundos y colapsaría la base de datos.

    return res.status(201).json(responseBody);
  } catch (error) {
    await client.query('ROLLBACK');

    if (error.status) {
      return res.status(error.status).json({ error: error.message });
    }

    console.error('Error al crear la orden:', error);
    return res.status(500).json({ error: 'Error interno al procesar la orden' });
  } finally {
    client.release();
  }
});

module.exports = router;
