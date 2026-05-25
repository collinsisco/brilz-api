-- ============================================================
-- BRILZ 2.0 — Migration 07: Notifications
-- ============================================================

CREATE TABLE IF NOT EXISTS notifications (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  type        TEXT NOT NULL CHECK (type IN ('order','payment','deal','delivery','system','booking')),
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  icon        TEXT DEFAULT '🔔',
  action_url  TEXT,
  is_read     BOOLEAN DEFAULT FALSE,
  is_sent     BOOLEAN DEFAULT FALSE,    -- push notification sent?
  metadata    JSONB,                    -- e.g. { order_id, amount }
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user   ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read   ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_type   ON notifications(type);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notifications_own" ON notifications FOR ALL USING (auth.uid() = user_id);

-- Push notification subscriptions
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  endpoint    TEXT NOT NULL UNIQUE,
  p256dh      TEXT NOT NULL,
  auth_key    TEXT NOT NULL,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "push_subs_own" ON push_subscriptions FOR ALL USING (auth.uid() = user_id);

-- Function to create order notification automatically
CREATE OR REPLACE FUNCTION notify_on_order_status()
RETURNS TRIGGER AS $$
DECLARE
  msg TEXT;
  icon TEXT;
  ntype TEXT;
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    CASE NEW.status
      WHEN 'paid' THEN
        msg := 'Payment received! Your order #' || LEFT(NEW.id::TEXT, 8) || ' is confirmed.';
        icon := '✅'; ntype := 'payment';
      WHEN 'shipped' THEN
        msg := 'Your order #' || LEFT(NEW.id::TEXT, 8) || ' is on its way!';
        icon := '🚚'; ntype := 'delivery';
      WHEN 'delivered' THEN
        msg := 'Order #' || LEFT(NEW.id::TEXT, 8) || ' delivered! Enjoy your purchase.';
        icon := '📦'; ntype := 'order';
      WHEN 'cancelled' THEN
        msg := 'Order #' || LEFT(NEW.id::TEXT, 8) || ' has been cancelled.';
        icon := '❌'; ntype := 'order';
      ELSE RETURN NEW;
    END CASE;

    IF NEW.user_id IS NOT NULL THEN
      INSERT INTO notifications (user_id, type, title, body, icon, action_url, metadata)
      VALUES (
        NEW.user_id, ntype,
        CASE ntype WHEN 'payment' THEN 'Payment Confirmed' WHEN 'delivery' THEN 'Order Shipped' ELSE 'Order Update' END,
        msg, icon,
        '/orders.html',
        jsonb_build_object('order_id', NEW.id, 'status', NEW.status, 'amount', NEW.total_amount)
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  CREATE TRIGGER trg_order_notification AFTER UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION notify_on_order_status();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

SELECT 'Migration 07 complete: notifications table created' AS status;
