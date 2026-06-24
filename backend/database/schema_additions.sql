-- ─────────────────────────────────────────────
--  myFisio — Adições ao schema existente
--  Execute no Shell do Render ou via /setup
-- ─────────────────────────────────────────────

-- Tabela de favoritos
CREATE TABLE IF NOT EXISTS favorites (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  professional_id UUID NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (patient_id, professional_id)
);

-- Tabela de notificações
CREATE TABLE IF NOT EXISTS notifications (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      VARCHAR(120) NOT NULL,
  body       TEXT NOT NULL,
  type       VARCHAR(30) DEFAULT 'info',
  read       BOOLEAN DEFAULT FALSE,
  data       JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_favorites_patient ON favorites(patient_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read, created_at DESC);

-- Trigger: cria notificação automática quando agendamento muda de status
CREATE OR REPLACE FUNCTION notify_appointment_change()
RETURNS TRIGGER AS $$
DECLARE
  patient_name  TEXT;
  pro_name      TEXT;
  msg_title     TEXT;
  msg_body      TEXT;
  target_user   UUID;
BEGIN
  SELECT u.name INTO patient_name FROM users u WHERE u.id = NEW.patient_id;
  SELECT u.name INTO pro_name
    FROM professionals p JOIN users u ON u.id = p.user_id
    WHERE p.id = NEW.professional_id;

  IF NEW.status = 'confirmed' AND OLD.status = 'pending' THEN
    msg_title  := '✅ Sessão confirmada!';
    msg_body   := pro_name || ' confirmou sua sessão.';
    target_user := NEW.patient_id;
  ELSIF NEW.status = 'cancelled' AND OLD.status != 'cancelled' THEN
    -- Notifica o OUTRO lado
    IF TG_OP = 'UPDATE' THEN
      -- descobre quem cancelou pela regra: se fisio cancelou, avisa paciente e vice-versa
      msg_title  := '❌ Sessão cancelada';
      msg_body   := 'Uma sessão foi cancelada. Verifique suas consultas.';
      target_user := NEW.patient_id;
    END IF;
  ELSIF NEW.status = 'completed' THEN
    msg_title  := '⭐ Como foi sua sessão?';
    msg_body   := 'Avalie o atendimento de ' || pro_name || ' e ajude outros pacientes.';
    target_user := NEW.patient_id;
  END IF;

  IF target_user IS NOT NULL AND msg_title IS NOT NULL THEN
    INSERT INTO notifications (user_id, title, body, type, data)
    VALUES (
      target_user, msg_title, msg_body, 'appointment',
      jsonb_build_object('appointment_id', NEW.id, 'status', NEW.status)
    );
  END IF;

  -- Notifica fisio quando recebe novo pedido
  IF NEW.status = 'pending' AND TG_OP = 'INSERT' THEN
    SELECT p.user_id INTO target_user FROM professionals p WHERE p.id = NEW.professional_id;
    INSERT INTO notifications (user_id, title, body, type, data)
    VALUES (
      target_user,
      '📬 Novo pedido de sessão!',
      patient_name || ' quer agendar uma sessão com você.',
      'new_appointment',
      jsonb_build_object('appointment_id', NEW.id)
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_notify_appointment ON appointments;
CREATE TRIGGER trg_notify_appointment
  AFTER INSERT OR UPDATE OF status ON appointments
  FOR EACH ROW EXECUTE FUNCTION notify_appointment_change();
