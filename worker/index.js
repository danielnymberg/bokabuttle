import { hashPassword, verifyPassword, createJWT, verifyJWT, getAuthCookie, parseCookies } from './auth.js';

function sanitize(str) {
  if (!str) return null;
  return str.replace(/<[^>]*>/g, '').trim().slice(0, 40) || null;
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers }
  });
}

async function getAdmin(request, env) {
  const cookies = parseCookies(request.headers.get('Cookie'));
  if (!cookies.token) return null;
  return verifyJWT(cookies.token, env.JWT_SECRET);
}

// Build slots array for a pass (creates missing rows on read)
async function getSlotsForPass(env, passId, antalPlatser, antalReserver) {
  const existing = await env.DB.prepare(
    'SELECT * FROM pass_bokningar WHERE pass_id = ? ORDER BY typ, slot_nr'
  ).bind(passId).all();

  const slots = [];
  const existingMap = {};
  for (const row of existing.results) {
    existingMap[`${row.typ}-${row.slot_nr}`] = row;
  }

  for (let i = 1; i <= antalPlatser; i++) {
    const key = `plats-${i}`;
    slots.push(existingMap[key] || { pass_id: passId, slot_nr: i, typ: 'plats', namn: null });
  }
  for (let i = 1; i <= antalReserver; i++) {
    const key = `reserv-${i}`;
    slots.push(existingMap[key] || { pass_id: passId, slot_nr: i, typ: 'reserv', namn: null });
  }
  return slots;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    if (path.startsWith('/api/')) {

      // GET current open branning with all pass + bokningar
      if (method === 'GET' && path === '/api/branning') {
        const branning = await env.DB.prepare(
          'SELECT * FROM branningar WHERE is_open = 1 ORDER BY created_at DESC LIMIT 1'
        ).first();
        if (!branning) return json({ branning: null, pass: [] });

        const passResult = await env.DB.prepare(
          'SELECT * FROM brannings_pass WHERE branning_id = ? ORDER BY date, start_time'
        ).bind(branning.id).all();

        const allBokningar = await env.DB.prepare(
          `SELECT pb.* FROM pass_bokningar pb
           JOIN brannings_pass bp ON bp.id = pb.pass_id
           WHERE bp.branning_id = ?
           ORDER BY pb.pass_id, pb.typ, pb.slot_nr`
        ).bind(branning.id).all();

        const bokningarByPass = {};
        for (const b of allBokningar.results) {
          if (!bokningarByPass[b.pass_id]) bokningarByPass[b.pass_id] = [];
          bokningarByPass[b.pass_id].push(b);
        }

        const pass = passResult.results.map(p => {
          const existing = bokningarByPass[p.id] || [];
          const existingMap = {};
          for (const row of existing) existingMap[`${row.typ}-${row.slot_nr}`] = row;

          const slots = [];
          for (let i = 1; i <= (p.antal_platser || 2); i++) {
            slots.push(existingMap[`plats-${i}`] || { pass_id: p.id, slot_nr: i, typ: 'plats', namn: null });
          }
          for (let i = 1; i <= (p.antal_reserver || 2); i++) {
            slots.push(existingMap[`reserv-${i}`] || { pass_id: p.id, slot_nr: i, typ: 'reserv', namn: null });
          }
          return { ...p, slots };
        });

        return json({ branning, pass });
      }

      // PUT book a slot (first-write-wins)
      if (method === 'PUT' && path.match(/^\/api\/pass\/\d+\/book$/)) {
        const passId = parseInt(path.split('/')[3]);
        const body = await request.json();
        const { typ, slot_nr, namn: rawNamn } = body;
        const namn = sanitize(rawNamn);

        if (!['plats', 'reserv'].includes(typ)) return json({ error: 'Ogiltig typ' }, 400);
        if (!slot_nr || slot_nr < 1) return json({ error: 'Ogiltigt slot_nr' }, 400);
        if (!namn) return json({ error: 'Namn krävs' }, 400);

        const pass = await env.DB.prepare(
          `SELECT bp.*, b.is_open FROM brannings_pass bp
           JOIN branningar b ON b.id = bp.branning_id WHERE bp.id = ?`
        ).bind(passId).first();
        if (!pass) return json({ error: 'Passet finns inte' }, 404);
        if (!pass.is_open) return json({ error: 'Bränningen är stängd' }, 403);

        const maxSlot = typ === 'plats' ? (pass.antal_platser || 2) : (pass.antal_reserver || 2);
        if (slot_nr > maxSlot) return json({ error: 'Ogiltigt platsnummer' }, 400);

        // Check if slot exists
        const existing = await env.DB.prepare(
          'SELECT * FROM pass_bokningar WHERE pass_id = ? AND typ = ? AND slot_nr = ?'
        ).bind(passId, typ, slot_nr).first();

        if (existing && existing.namn) {
          return json({ error: 'Platsen är redan tagen', taken_by: existing.namn }, 409);
        }

        if (existing) {
          await env.DB.prepare(
            'UPDATE pass_bokningar SET namn = ? WHERE id = ? AND namn IS NULL'
          ).bind(namn, existing.id).run();
        } else {
          await env.DB.prepare(
            'INSERT INTO pass_bokningar (pass_id, slot_nr, typ, namn) VALUES (?, ?, ?, ?)'
          ).bind(passId, slot_nr, typ, namn).run();
        }

        const updated = await env.DB.prepare(
          'SELECT * FROM pass_bokningar WHERE pass_id = ? AND typ = ? AND slot_nr = ?'
        ).bind(passId, typ, slot_nr).first();
        return json(updated);
      }

      // --- ADMIN ---
      if (method === 'POST' && path === '/api/admin/login') {
        const body = await request.json();
        const admin = await env.DB.prepare('SELECT * FROM admins WHERE email = ?').bind(body.email).first();
        if (!admin || !(await verifyPassword(body.password, admin.password_hash))) {
          return json({ error: 'Fel e-post eller lösenord' }, 401);
        }
        const token = await createJWT({ id: admin.id, name: admin.name }, env.JWT_SECRET);
        return json({ name: admin.name }, 200, { 'Set-Cookie': getAuthCookie(token) });
      }

      if (method === 'GET' && path === '/api/admin/me') {
        const admin = await getAdmin(request, env);
        if (!admin) return json({ error: 'Ej inloggad' }, 401);
        return json({ id: admin.id, name: admin.name });
      }

      if (method === 'POST' && path === '/api/admin/logout') {
        return json({ ok: true }, 200, {
          'Set-Cookie': 'token=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0'
        });
      }

      if (path.startsWith('/api/admin/')) {
        const admin = await getAdmin(request, env);
        if (!admin) return json({ error: 'Ej behörig' }, 401);

        // Create branning
        if (method === 'POST' && path === '/api/admin/branning') {
          const body = await request.json();
          const result = await env.DB.prepare(
            'INSERT INTO branningar (name, start_date, end_date) VALUES (?, ?, ?)'
          ).bind(body.name, body.start_date, body.end_date).run();
          return json({ id: result.meta.last_row_id });
        }

        // Add pass to branning (flexible)
        if (method === 'POST' && path.match(/^\/api\/admin\/branning\/\d+\/pass$/)) {
          const branningId = parseInt(path.split('/')[4]);
          const body = await request.json();
          // body: { date, start_time, end_time, aktivitet, antal_platser, antal_reserver }
          const result = await env.DB.prepare(
            `INSERT INTO brannings_pass (branning_id, date, start_time, end_time, aktivitet, antal_platser, antal_reserver)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
          ).bind(branningId, body.date, body.start_time, body.end_time,
            body.aktivitet || null, body.antal_platser || 2, body.antal_reserver || 2).run();
          return json({ id: result.meta.last_row_id });
        }

        // Generate pass (simple interval-based, kept for convenience)
        if (method === 'POST' && path.match(/^\/api\/admin\/branning\/\d+\/generate-pass$/)) {
          const branningId = parseInt(path.split('/')[4]);
          const body = await request.json();
          const interval = body.interval || 6;

          const branning = await env.DB.prepare('SELECT * FROM branningar WHERE id = ?').bind(branningId).first();
          if (!branning) return json({ error: 'Bränningen finns inte' }, 404);

          const startDate = new Date(branning.start_date + 'T00:00:00');
          const endDate = new Date(branning.end_date + 'T23:59:59');
          const stmts = [];

          for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
            const dateStr = d.toISOString().split('T')[0];
            for (let h = 0; h < 24; h += interval) {
              const startH = String(h).padStart(2, '0') + ':00';
              const endH = String((h + interval) % 24).padStart(2, '0') + ':00';
              stmts.push(
                env.DB.prepare(
                  `INSERT INTO brannings_pass (branning_id, date, start_time, end_time, aktivitet, antal_platser, antal_reserver)
                   VALUES (?, ?, ?, ?, 'Bränning', 2, 2)`
                ).bind(branningId, dateStr, startH, endH)
              );
            }
          }
          if (stmts.length > 0) await env.DB.batch(stmts);
          return json({ created: stmts.length });
        }

        // Update branning
        if (method === 'PUT' && path.match(/^\/api\/admin\/branning\/\d+$/)) {
          const id = parseInt(path.split('/').pop());
          const body = await request.json();
          if (body.is_open !== undefined) {
            await env.DB.prepare('UPDATE branningar SET is_open = ? WHERE id = ?').bind(body.is_open ? 1 : 0, id).run();
          }
          if (body.name) {
            await env.DB.prepare('UPDATE branningar SET name = ? WHERE id = ?').bind(body.name, id).run();
          }
          return json({ ok: true });
        }

        // Admin update slot (can overwrite/clear)
        if (method === 'PUT' && path.match(/^\/api\/admin\/pass\/\d+\/book$/)) {
          const passId = parseInt(path.split('/')[4]);
          const body = await request.json();
          const { typ, slot_nr, namn: rawNamn } = body;
          const namn = rawNamn === '' ? null : sanitize(rawNamn);

          if (!['plats', 'reserv'].includes(typ)) return json({ error: 'Ogiltig typ' }, 400);

          const existing = await env.DB.prepare(
            'SELECT * FROM pass_bokningar WHERE pass_id = ? AND typ = ? AND slot_nr = ?'
          ).bind(passId, typ, slot_nr).first();

          if (existing) {
            await env.DB.prepare('UPDATE pass_bokningar SET namn = ? WHERE id = ?').bind(namn, existing.id).run();
          } else if (namn) {
            await env.DB.prepare(
              'INSERT INTO pass_bokningar (pass_id, slot_nr, typ, namn) VALUES (?, ?, ?, ?)'
            ).bind(passId, slot_nr, typ, namn).run();
          }

          return json({ ok: true });
        }

        // Delete branning
        if (method === 'DELETE' && path.match(/^\/api\/admin\/branning\/\d+$/)) {
          const id = parseInt(path.split('/').pop());
          await env.DB.prepare('DELETE FROM branningar WHERE id = ?').bind(id).run();
          return json({ ok: true });
        }

        // List branningar
        if (method === 'GET' && path === '/api/admin/branningar') {
          const result = await env.DB.prepare('SELECT * FROM branningar ORDER BY created_at DESC').all();
          return json(result.results);
        }

        // Create admin
        if (method === 'POST' && path === '/api/admin/admins') {
          const body = await request.json();
          const hash = await hashPassword(body.password);
          await env.DB.prepare(
            'INSERT INTO admins (name, email, password_hash) VALUES (?, ?, ?)'
          ).bind(body.name, body.email, hash).run();
          return json({ ok: true });
        }

        // List admins
        if (method === 'GET' && path === '/api/admin/admins') {
          const result = await env.DB.prepare('SELECT id, name, email, created_at FROM admins').all();
          return json(result.results);
        }
      }

      return json({ error: 'Not found' }, 404);
    }

    return env.ASSETS.fetch(request);
  }
};
