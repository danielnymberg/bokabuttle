import { hashPassword, verifyPassword, createJWT, verifyJWT, getAuthCookie, parseCookies } from './auth.js';

// Sanitize input - strip HTML tags
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

// Auth middleware
async function getAdmin(request, env) {
  const cookies = parseCookies(request.headers.get('Cookie'));
  if (!cookies.token) return null;
  return verifyJWT(cookies.token, env.JWT_SECRET);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // API routes
    if (path.startsWith('/api/')) {
      // --- PUBLIC ---

      // GET current open branning with all pass
      if (method === 'GET' && path === '/api/branning') {
        const branning = await env.DB.prepare(
          'SELECT * FROM branningar WHERE is_open = 1 ORDER BY created_at DESC LIMIT 1'
        ).first();
        if (!branning) return json({ branning: null, pass: [] });
        const pass = await env.DB.prepare(
          'SELECT * FROM brannings_pass WHERE branning_id = ? ORDER BY date, start_time'
        ).bind(branning.id).all();
        return json({ branning, pass: pass.results });
      }

      // PUT update a cell (first-write-wins for non-admin)
      if (method === 'PUT' && path.match(/^\/api\/pass\/\d+$/)) {
        const id = parseInt(path.split('/').pop());
        const body = await request.json();
        const field = body.field;
        const name = sanitize(body.name);

        if (!['plats_1', 'plats_2', 'reserv_1', 'reserv_2'].includes(field)) {
          return json({ error: 'Ogiltigt fält' }, 400);
        }
        if (!name) return json({ error: 'Namn krävs' }, 400);

        // Check branning is open
        const pass = await env.DB.prepare(
          `SELECT bp.*, b.is_open FROM brannings_pass bp
           JOIN branningar b ON b.id = bp.branning_id
           WHERE bp.id = ?`
        ).bind(id).first();
        if (!pass) return json({ error: 'Passet finns inte' }, 404);
        if (!pass.is_open) return json({ error: 'Bränningen är stängd' }, 403);

        // First-write-wins: only write if cell is empty
        if (pass[field]) {
          return json({ error: 'Platsen är redan tagen', taken_by: pass[field] }, 409);
        }

        await env.DB.prepare(
          `UPDATE brannings_pass SET ${field} = ? WHERE id = ? AND ${field} IS NULL`
        ).bind(name, id).run();

        // Re-fetch to confirm
        const updated = await env.DB.prepare('SELECT * FROM brannings_pass WHERE id = ?').bind(id).first();
        return json(updated);
      }

      // --- ADMIN ---

      // Login
      if (method === 'POST' && path === '/api/admin/login') {
        const body = await request.json();
        const admin = await env.DB.prepare('SELECT * FROM admins WHERE email = ?').bind(body.email).first();
        if (!admin || !(await verifyPassword(body.password, admin.password_hash))) {
          return json({ error: 'Fel e-post eller lösenord' }, 401);
        }
        const token = await createJWT({ id: admin.id, name: admin.name }, env.JWT_SECRET);
        return json({ name: admin.name }, 200, { 'Set-Cookie': getAuthCookie(token) });
      }

      // Check auth status
      if (method === 'GET' && path === '/api/admin/me') {
        const admin = await getAdmin(request, env);
        if (!admin) return json({ error: 'Ej inloggad' }, 401);
        return json({ id: admin.id, name: admin.name });
      }

      // Logout
      if (method === 'POST' && path === '/api/admin/logout') {
        return json({ ok: true }, 200, {
          'Set-Cookie': 'token=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0'
        });
      }

      // All other admin routes require auth
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

        // Generate pass for branning
        if (method === 'POST' && path.match(/^\/api\/admin\/branning\/\d+\/generate-pass$/)) {
          const branningId = parseInt(path.split('/')[4]);
          const body = await request.json();
          const interval = body.interval || 6; // hours

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
                  'INSERT INTO brannings_pass (branning_id, date, start_time, end_time) VALUES (?, ?, ?, ?)'
                ).bind(branningId, dateStr, startH, endH)
              );
            }
          }

          if (stmts.length > 0) await env.DB.batch(stmts);
          return json({ created: stmts.length });
        }

        // Update branning (open/close)
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

        // Admin update pass (can overwrite/clear)
        if (method === 'PUT' && path.match(/^\/api\/admin\/pass\/\d+$/)) {
          const id = parseInt(path.split('/').pop());
          const body = await request.json();
          const field = body.field;
          const name = body.name === '' ? null : sanitize(body.name);

          if (!['plats_1', 'plats_2', 'reserv_1', 'reserv_2'].includes(field)) {
            return json({ error: 'Ogiltigt fält' }, 400);
          }

          await env.DB.prepare(
            `UPDATE brannings_pass SET ${field} = ? WHERE id = ?`
          ).bind(name, id).run();

          const updated = await env.DB.prepare('SELECT * FROM brannings_pass WHERE id = ?').bind(id).first();
          return json(updated);
        }

        // Delete branning
        if (method === 'DELETE' && path.match(/^\/api\/admin\/branning\/\d+$/)) {
          const id = parseInt(path.split('/').pop());
          await env.DB.prepare('DELETE FROM branningar WHERE id = ?').bind(id).run();
          return json({ ok: true });
        }

        // List all branningar (for admin panel)
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

    // --- STATIC FILES ---
    // Serve from site bucket (Cloudflare handles this via [site] config)
    return env.ASSETS.fetch(request);
  }
};
