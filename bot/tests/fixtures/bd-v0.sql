-- Filas representativas de una base en el esquema v0 (antes de la migración 1),
-- para bot/tests/migraciones.test.ts. Todo es SINTÉTICO: el repositorio es
-- público. Ids de Telegram 1001… (autores), 2001… (sólo apoyan), 3001 (sólo
-- se suscribe), 42 (administrador).
--
-- Cada caso está aquí por algo que la migración tiene que llevar entero:
--   · Q-AAAA0001: autor 1001, con coordenadas, foto y una foto retenida.
--   · Q-AAAA0002: el mismo autor, verificada con diez apoyos.
--   · Q-BBBB0001: autor 1002, que además apoya una queja ajena.
--   · Q-CCCC0001: retirada con /olvidar: ya anónima (telegram_user_id = 0).
--   · Q-DDDD0001: `photo_file_id` vacío, que no es una foto.

INSERT INTO quejas (id, telegram_user_id, telegram_username, category, title, detail,
                    lat, lng, neighborhood, photo_file_id, concejalia_area, concejal_slug,
                    state, created_at, updated_at, deleted_at)
VALUES
  ('Q-AAAA0001', 1001, 'vecina_a', 'via_publica', 'Bache en la avenida',
   'Un bache profundo en la avenida principal, delante del número doce.',
   39.5401, -0.5702, 'el-molinet', 'FILE-A', 'Obras', 'concejal-x',
   'capturada', '2026-05-01 10:00:00', '2026-05-01 10:00:00', NULL),
  ('Q-AAAA0002', 1001, 'vecina_a', 'limpieza', 'Contenedores desbordados',
   'Los contenedores de la esquina llevan una semana sin vaciarse.',
   NULL, NULL, NULL, NULL, 'Medio ambiente', 'concejal-y',
   'apoyada_verificada', '2026-05-02 10:00:00', '2026-05-09 10:00:00', NULL),
  ('Q-BBBB0001', 1002, NULL, 'alumbrado', 'Farola apagada',
   'La farola de la plaza lleva apagada desde el lunes y la calle queda a oscuras.',
   NULL, NULL, 'santa-rosa', NULL, 'Obras', 'concejal-x',
   'registrada', '2026-05-03 10:00:00', '2026-05-10 10:00:00', NULL),
  ('Q-CCCC0001', 0, NULL, 'ruido', 'Ruido nocturno',
   'Ruido de madrugada todos los fines de semana en la calle del mercado.',
   NULL, NULL, 'santa-rosa', NULL, 'Seguridad', 'concejal-z',
   'capturada', '2026-05-04 10:00:00', '2026-06-01 10:00:00', '2026-06-01 10:00:00'),
  ('Q-DDDD0001', 1003, NULL, 'otros', 'Otra cosa',
   'Una queja sin foto cuyo campo de foto quedó como cadena vacía.',
   NULL, NULL, NULL, '', NULL, NULL,
   'capturada', '2026-05-05 10:00:00', '2026-05-05 10:00:00', NULL);

-- Diez apoyos ajenos a Q-AAAA0002 (el umbral) y uno del autor 1002 a Q-AAAA0001.
INSERT INTO apoyos (queja_id, telegram_user_id, created_at) VALUES
  ('Q-AAAA0002', 2001, '2026-05-03 10:00:00'),
  ('Q-AAAA0002', 2002, '2026-05-03 10:01:00'),
  ('Q-AAAA0002', 2003, '2026-05-03 10:02:00'),
  ('Q-AAAA0002', 2004, '2026-05-03 10:03:00'),
  ('Q-AAAA0002', 2005, '2026-05-03 10:04:00'),
  ('Q-AAAA0002', 2006, '2026-05-03 10:05:00'),
  ('Q-AAAA0002', 2007, '2026-05-03 10:06:00'),
  ('Q-AAAA0002', 2008, '2026-05-03 10:07:00'),
  ('Q-AAAA0002', 2009, '2026-05-03 10:08:00'),
  ('Q-AAAA0002', 2010, '2026-05-03 10:09:00'),
  ('Q-AAAA0001', 1002, '2026-05-04 10:00:00');

INSERT INTO events (queja_id, kind, payload, created_at) VALUES
  ('Q-AAAA0001', 'capturada', NULL, '2026-05-01 10:00:00'),
  ('Q-AAAA0002', 'capturada', NULL, '2026-05-02 10:00:00'),
  ('Q-AAAA0002', 'apoyada_verificada', '{"count":10}', '2026-05-03 10:09:00'),
  ('Q-BBBB0001', 'capturada', NULL, '2026-05-03 10:00:00'),
  ('Q-BBBB0001', 'registrada', '{"entry_number":"2026-RE-1","csv":"ABC"}', '2026-05-10 10:00:00'),
  ('Q-CCCC0001', 'capturada', NULL, '2026-05-04 10:00:00'),
  ('Q-CCCC0001', 'anonymised', '{"reason":"user_requested_deletion"}', '2026-06-01 10:00:00'),
  ('Q-DDDD0001', 'capturada', NULL, '2026-05-05 10:00:00');

-- Sólo se suscribe: no tiene quejas ni apoyos.
INSERT INTO subscriptions (telegram_user_id, filter_kind, filter_value) VALUES
  (3001, 'barrio', 'el-molinet');

-- Del administrador: se queda como está.
INSERT INTO curation_decisions (ref, telegram_user_id, decision, note) VALUES
  ('hallazgo-1', 42, 'approve', NULL);

INSERT INTO repo_eventos_vistos (id) VALUES ('pr:1:abierta');

INSERT INTO fotos_retenidas (queja_id, desde, motivo, intentos) VALUES
  ('Q-AAAA0001', '2026-09-27T10:00:00.000Z', 'gemini vision HTTP 503', 2);
