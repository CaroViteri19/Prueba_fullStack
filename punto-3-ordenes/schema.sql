-- ============================================================================
-- Esquema mínimo para creación de órdenes con reserva de stock e idempotencia
-- ============================================================================

-- 1. Inventario de productos
-- Los CHECK (>= 0) aseguran en la base de datos que jamás se venda stock negativo
CREATE TABLE inventory (
    sku VARCHAR(64) PRIMARY KEY,
    price NUMERIC(12, 2) NOT NULL CHECK (price >= 0),
    available_stock INT NOT NULL CHECK (available_stock >= 0),
    reserved_stock INT NOT NULL DEFAULT 0 CHECK (reserved_stock >= 0)
);

-- 2. Cabecera de órdenes
CREATE TABLE orders (
    id UUID PRIMARY KEY,
    customer_id VARCHAR(64) NOT NULL,
    status VARCHAR(32) NOT NULL, -- Ej: 'PENDING_PAYMENT', 'PAID', 'CANCELLED', 'EXPIRED'
    total_amount NUMERIC(12, 2) NOT NULL CHECK (total_amount >= 0),
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 3. Detalle de ítems por orden
CREATE TABLE order_items (
    id SERIAL PRIMARY KEY,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    sku VARCHAR(64) NOT NULL REFERENCES inventory(sku),
    quantity INT NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0)
);

-- 4. Control de idempotencia para evitar órdenes duplicadas por reintentos de red
CREATE TABLE idempotency_keys (
    key VARCHAR(128) PRIMARY KEY,
    customer_id VARCHAR(64) NOT NULL,
    status VARCHAR(32) NOT NULL, -- 'IN_PROGRESS' | 'COMPLETED'
    response_code INT,
    response_body JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
