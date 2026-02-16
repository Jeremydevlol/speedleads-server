-- =============================================
-- SCHEMA DE BILLING PARA SUPABASE
-- =============================================
-- Ejecutar en Supabase SQL Editor para configurar el sistema de billing

-- 1. Crear esquema billing
CREATE SCHEMA IF NOT EXISTS billing;

-- 2. Tabla de eventos (idempotencia)
CREATE TABLE IF NOT EXISTS billing.billing_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Tabla de clientes
CREATE TABLE IF NOT EXISTS billing.billing_customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  email TEXT,
  stripe_customer_id TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Tabla de planes
CREATE TABLE IF NOT EXISTS billing.billing_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  stripe_price_id TEXT UNIQUE,
  stripe_payment_link_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Tabla de suscripciones
CREATE TABLE IF NOT EXISTS billing.billing_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  customer_id UUID REFERENCES billing.billing_customers(id) ON DELETE CASCADE,
  plan_id UUID REFERENCES billing.billing_plans(id) ON DELETE SET NULL,
  stripe_subscription_id TEXT UNIQUE,
  status TEXT NOT NULL,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN DEFAULT false,
  canceled_at TIMESTAMPTZ,
  trial_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(customer_id)
);

-- 6. Tabla de facturas
CREATE TABLE IF NOT EXISTS billing.billing_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  customer_id UUID REFERENCES billing.billing_customers(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES billing.billing_subscriptions(id) ON DELETE SET NULL,
  stripe_invoice_id TEXT UNIQUE NOT NULL,
  hosted_invoice_url TEXT,
  invoice_pdf TEXT,
  status TEXT,
  currency TEXT,
  amount_due_cents INTEGER,
  amount_paid_cents INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Índices para performance
CREATE INDEX IF NOT EXISTS idx_billing_events_stripe_event_id ON billing.billing_events(stripe_event_id);
CREATE INDEX IF NOT EXISTS idx_billing_customers_user_id ON billing.billing_customers(user_id);
CREATE INDEX IF NOT EXISTS idx_billing_customers_stripe_customer_id ON billing.billing_customers(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_billing_subscriptions_user_id ON billing.billing_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_billing_subscriptions_customer_id ON billing.billing_subscriptions(customer_id);
CREATE INDEX IF NOT EXISTS idx_billing_subscriptions_stripe_subscription_id ON billing.billing_subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_billing_invoices_stripe_invoice_id ON billing.billing_invoices(stripe_invoice_id);

-- 8. Vista para consultar suscripción del usuario
CREATE OR REPLACE VIEW billing.my_subscription AS
SELECT 
  s.user_id,
  s.status,
  s.current_period_start,
  s.current_period_end,
  s.cancel_at_period_end,
  s.canceled_at,
  s.trial_end,
  s.created_at as subscription_created_at,
  p.name as plan_name,
  p.stripe_price_id,
  p.stripe_payment_link_id,
  c.email,
  c.stripe_customer_id
FROM billing.billing_subscriptions s
LEFT JOIN billing.billing_customers c ON s.customer_id = c.id
LEFT JOIN billing.billing_plans p ON s.plan_id = p.id;

-- 9. Triggers para updated_at
CREATE OR REPLACE FUNCTION billing.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_billing_customers_updated_at
    BEFORE UPDATE ON billing.billing_customers
    FOR EACH ROW
    EXECUTE FUNCTION billing.update_updated_at_column();

CREATE TRIGGER update_billing_plans_updated_at
    BEFORE UPDATE ON billing.billing_plans
    FOR EACH ROW
    EXECUTE FUNCTION billing.update_updated_at_column();

CREATE TRIGGER update_billing_subscriptions_updated_at
    BEFORE UPDATE ON billing.billing_subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION billing.update_updated_at_column();

-- 10. RLS (Row Level Security) - Configuración básica
ALTER TABLE billing.billing_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.billing_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.billing_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.billing_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.billing_events ENABLE ROW LEVEL SECURITY;

-- Políticas básicas (ajustar según necesidades)
CREATE POLICY "Service role can manage all billing data" ON billing.billing_customers
    FOR ALL USING (auth.role() = 'service_role');
    
CREATE POLICY "Service role can manage all billing data" ON billing.billing_subscriptions
    FOR ALL USING (auth.role() = 'service_role');
    
CREATE POLICY "Service role can manage all billing data" ON billing.billing_invoices
    FOR ALL USING (auth.role() = 'service_role');
    
CREATE POLICY "Service role can manage all billing data" ON billing.billing_plans
    FOR ALL USING (auth.role() = 'service_role');
    
CREATE POLICY "Service role can manage all billing data" ON billing.billing_events
    FOR ALL USING (auth.role() = 'service_role');

-- 11. Comentarios para documentación
COMMENT ON SCHEMA billing IS 'Esquema para gestión de facturación con Stripe';
COMMENT ON TABLE billing.billing_events IS 'Eventos de Stripe para idempotencia';
COMMENT ON TABLE billing.billing_customers IS 'Clientes vinculados a Stripe';
COMMENT ON TABLE billing.billing_plans IS 'Planes de suscripción con precios de Stripe';
COMMENT ON TABLE billing.billing_subscriptions IS 'Suscripciones activas de usuarios';
COMMENT ON TABLE billing.billing_invoices IS 'Facturas generadas por Stripe';
COMMENT ON VIEW billing.my_subscription IS 'Vista para consultar suscripción de usuario';

-- =============================================
-- DATOS DE EJEMPLO (opcional para testing)
-- =============================================

-- Insertar planes de ejemplo (ajustar según tus precios en Stripe)
INSERT INTO billing.billing_plans (name, stripe_price_id) VALUES 
('Basic Plan', 'price_1234567890abcdef'),  -- Reemplazar con tus price_id reales
('Premium Plan', 'price_0987654321fedcba')  -- Reemplazar con tus price_id reales
ON CONFLICT (stripe_price_id) DO NOTHING;

-- =============================================
-- VERIFICACIÓN DE INSTALACIÓN
-- =============================================

-- Consultar estructura creada
SELECT 
    schemaname, 
    tablename, 
    tableowner 
FROM pg_tables 
WHERE schemaname = 'billing'
ORDER BY tablename;

-- Consultar vista creada
SELECT 
    schemaname,
    viewname,
    viewowner
FROM pg_views 
WHERE schemaname = 'billing';

-- =============================================
-- ¡SCHEMA LISTO PARA PRODUCCIÓN!
-- =============================================




