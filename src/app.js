(function() {
  'use strict';

  let isAdmin = false;
  let currentBranning = null;
  let debounceTimers = {};

  const WEEKDAYS = ['Sön', 'Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör'];
  const MONTHS = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

  function formatDate(dateStr) {
    const d = new Date(dateStr + 'T12:00:00');
    return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
  }

  function formatTime(t) { return t.slice(0, 5); }

  const FIELDS = [
    { key: 'plats_1', label: 'Plats 1', type: 'plats' },
    { key: 'plats_2', label: 'Plats 2', type: 'plats' },
    { key: 'reserv_1', label: 'Reserv 1', type: 'reserv' },
    { key: 'reserv_2', label: 'Reserv 2', type: 'reserv' },
  ];

  // --- API ---
  async function api(path, opts = {}) {
    const res = await fetch(path, {
      ...opts,
      headers: { 'Content-Type': 'application/json', ...opts.headers },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    const data = await res.json();
    if (!res.ok) throw { status: res.status, ...data };
    return data;
  }

  // --- RENDER ---
  function renderApp(branning, pass) {
    const app = document.getElementById('app');
    if (!branning) {
      app.innerHTML = '<div id="no-branning">Ingen aktiv bränning just nu.</div>';
      return;
    }

    currentBranning = branning;
    const closed = !branning.is_open;

    let html = `<h1>${esc(branning.name)}</h1>`;

    // Mobile cards
    html += '<div class="pass-cards-mobile">';
    for (const p of pass) {
      html += `<div class="pass-card">
        <div class="pass-header">${formatDate(p.date)} ${formatTime(p.start_time)}–${formatTime(p.end_time)}</div>
        <div class="pass-grid">`;
      for (const f of FIELDS) {
        const cls = closed ? 'closed' : f.type;
        html += `<div class="pass-slot ${cls}" id="slot-${p.id}-${f.key}">
          <label>${f.label}</label>
          ${renderCell(p, f, closed)}
        </div>`;
      }
      html += '</div></div>';
    }
    html += '</div>';

    // Desktop table
    html += `<div class="pass-table-desktop"><table class="pass-table">
      <thead><tr><th>Pass</th><th>Plats 1</th><th>Plats 2</th><th>Reserv 1</th><th>Reserv 2</th></tr></thead><tbody>`;
    for (const p of pass) {
      html += `<tr><td class="pass-time">${formatDate(p.date)} ${formatTime(p.start_time)}–${formatTime(p.end_time)}</td>`;
      for (const f of FIELDS) {
        const cls = closed ? 'closed' : f.type;
        html += `<td class="${cls}" id="cell-${p.id}-${f.key}">${renderCell(p, f, closed)}</td>`;
      }
      html += '</tr>';
    }
    html += '</tbody></table></div>';

    // Summary
    html += renderSummary(pass);

    app.innerHTML = html;
    attachInputListeners(pass, closed);
  }

  function renderCell(pass, field, closed) {
    const value = pass[field.key];
    if (value) {
      if (isAdmin) {
        return `<input type="text" value="${esc(value)}" data-pass="${pass.id}" data-field="${field.key}" data-admin="1" maxlength="40" ${closed ? '' : ''}>`;
      }
      return `<span class="name-display">${esc(value)}</span>`;
    }
    if (closed) return `<span class="name-display">—</span>`;
    return `<input type="text" placeholder="Skriv ditt namn" data-pass="${pass.id}" data-field="${field.key}" maxlength="40">`;
  }

  function renderSummary(pass) {
    const counts = {};
    for (const p of pass) {
      for (const f of FIELDS) {
        const name = p[f.key];
        if (name) {
          const key = name.trim().toLowerCase();
          if (!counts[key]) counts[key] = { name: name.trim(), total: 0, reserv: 0 };
          counts[key].total++;
          if (f.type === 'reserv') counts[key].reserv++;
        }
      }
    }
    const entries = Object.values(counts).sort((a, b) => b.total - a.total);
    if (!entries.length) return '';
    const parts = entries.map(e => {
      let s = `${e.name}: ${e.total - e.reserv} pass`;
      if (e.reserv) s += ` + ${e.reserv} reserv`;
      return s;
    });
    return `<div class="summary">${parts.join(' | ')}</div>`;
  }

  function esc(s) {
    if (!s) return '';
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function attachInputListeners(pass, closed) {
    document.querySelectorAll('input[data-pass]').forEach(input => {
      const passId = input.dataset.pass;
      const field = input.dataset.field;
      const isAdminEdit = input.dataset.admin === '1';

      input.addEventListener('input', () => {
        const key = `${passId}-${field}`;
        clearTimeout(debounceTimers[key]);
        debounceTimers[key] = setTimeout(() => saveCell(passId, field, input.value.trim(), input, isAdminEdit), 500);
      });
    });
  }

  async function saveCell(passId, field, name, inputEl, adminEdit) {
    if (!name) return;
    try {
      const endpoint = adminEdit ? `/api/admin/pass/${passId}` : `/api/pass/${passId}`;
      const updated = await api(endpoint, { method: 'PUT', body: { field, name } });

      // Flash green
      const slot = inputEl.closest('.pass-slot, td');
      if (slot) {
        slot.classList.remove('just-saved');
        void slot.offsetWidth;
        slot.classList.add('just-saved');
      }

      // If non-admin and saved, replace input with text
      if (!adminEdit) {
        inputEl.replaceWith(Object.assign(document.createElement('span'), {
          className: 'name-display',
          textContent: updated[field]
        }));
      }
    } catch (err) {
      if (err.status === 409) {
        // Conflict - someone else took this slot
        const slot = inputEl.closest('.pass-slot, td');
        if (slot) {
          slot.classList.add('conflict');
          setTimeout(() => slot.classList.remove('conflict'), 1500);
        }
        inputEl.value = '';
        inputEl.placeholder = `Tagen av ${err.taken_by}`;
        setTimeout(() => loadBranning(), 1000);
      } else {
        console.error('Sparfel:', err);
      }
    }
  }

  // --- LOAD ---
  async function loadBranning() {
    try {
      const data = await api('/api/branning');
      renderApp(data.branning, data.pass);
    } catch (e) {
      document.getElementById('app').innerHTML = '<div id="no-branning">Kunde inte ladda data.</div>';
    }
  }

  // --- ADMIN ---
  async function checkAdmin() {
    try {
      await api('/api/admin/me');
      isAdmin = true;
      showAdminTools();
    } catch { isAdmin = false; }
  }

  function showAdminTools() {
    document.getElementById('admin-panel').classList.remove('hidden');
    document.getElementById('admin-login').classList.add('hidden');
    document.getElementById('admin-tools').classList.remove('hidden');
    loadAdminBranningar();
    loadBranning(); // Re-render with admin inputs
  }

  async function loadAdminBranningar() {
    try {
      const list = await api('/api/admin/branningar');
      const el = document.getElementById('admin-branningar-list');
      if (!list.length) { el.innerHTML = '<p>Inga bränningar ännu.</p>'; return; }
      el.innerHTML = list.map(b => `
        <div class="branning-item">
          <span class="name">${esc(b.name)}</span>
          <span class="status">${b.is_open ? '🟢 Öppen' : '🔴 Stängd'}</span>
          <button class="${b.is_open ? 'danger' : 'success'}" onclick="toggleBranning(${b.id}, ${b.is_open})">${b.is_open ? 'Stäng' : 'Öppna'}</button>
        </div>
      `).join('');
    } catch (e) { console.error(e); }
  }

  window.toggleBranning = async function(id, currentlyOpen) {
    await api(`/api/admin/branning/${id}`, { method: 'PUT', body: { is_open: !currentlyOpen } });
    loadAdminBranningar();
    loadBranning();
  };

  // --- INIT ---
  document.addEventListener('DOMContentLoaded', async () => {
    await loadBranning();
    await checkAdmin();

    // Admin link
    document.getElementById('admin-link').addEventListener('click', e => {
      e.preventDefault();
      const panel = document.getElementById('admin-panel');
      panel.classList.toggle('hidden');
      if (!isAdmin) {
        document.getElementById('admin-login').classList.remove('hidden');
        document.getElementById('admin-tools').classList.add('hidden');
      }
    });

    // Login form
    document.getElementById('login-form').addEventListener('submit', async e => {
      e.preventDefault();
      const errEl = document.getElementById('login-error');
      errEl.classList.add('hidden');
      try {
        await api('/api/admin/login', {
          method: 'POST',
          body: {
            email: document.getElementById('login-email').value,
            password: document.getElementById('login-password').value,
          }
        });
        isAdmin = true;
        showAdminTools();
      } catch (err) {
        errEl.textContent = err.error || 'Inloggningen misslyckades';
        errEl.classList.remove('hidden');
      }
    });

    // Create branning
    document.getElementById('create-branning-form').addEventListener('submit', async e => {
      e.preventDefault();
      try {
        const result = await api('/api/admin/branning', {
          method: 'POST',
          body: {
            name: document.getElementById('branning-name').value,
            start_date: document.getElementById('branning-start').value,
            end_date: document.getElementById('branning-end').value,
          }
        });
        const interval = parseInt(document.getElementById('branning-interval').value) || 6;
        await api(`/api/admin/branning/${result.id}/generate-pass`, {
          method: 'POST',
          body: { interval }
        });
        document.getElementById('create-branning-form').reset();
        loadAdminBranningar();
        loadBranning();
      } catch (err) {
        alert('Fel: ' + (err.error || 'Okänt fel'));
      }
    });

    // Create admin
    document.getElementById('create-admin-form').addEventListener('submit', async e => {
      e.preventDefault();
      try {
        await api('/api/admin/admins', {
          method: 'POST',
          body: {
            name: document.getElementById('admin-name').value,
            email: document.getElementById('admin-email').value,
            password: document.getElementById('admin-pw').value,
          }
        });
        document.getElementById('create-admin-form').reset();
      } catch (err) {
        alert('Fel: ' + (err.error || 'Okänt fel'));
      }
    });

    // Logout
    document.getElementById('logout-btn').addEventListener('click', async () => {
      await api('/api/admin/logout', { method: 'POST' });
      isAdmin = false;
      document.getElementById('admin-panel').classList.add('hidden');
      loadBranning();
    });
  });
})();
