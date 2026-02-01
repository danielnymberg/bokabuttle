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

  function esc(s) {
    if (!s) return '';
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

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

    // Group pass by date
    const byDate = {};
    for (const p of pass) {
      if (!byDate[p.date]) byDate[p.date] = [];
      byDate[p.date].push(p);
    }

    // Mobile cards
    html += '<div class="pass-cards-mobile">';
    for (const [date, datePasses] of Object.entries(byDate)) {
      html += `<div class="date-group"><h2 class="date-header">${formatDate(date)}</h2>`;
      for (const p of datePasses) {
        const aktivitet = p.aktivitet ? `<span class="aktivitet">${esc(p.aktivitet)}</span>` : '';
        html += `<div class="pass-card">
          <div class="pass-header">
            ${formatTime(p.start_time)}–${formatTime(p.end_time)} ${aktivitet}
          </div>
          <div class="pass-slots">`;

        const platser = p.slots.filter(s => s.typ === 'plats');
        const reserver = p.slots.filter(s => s.typ === 'reserv');

        if (platser.length > 0) {
          html += '<div class="slot-group"><div class="slot-group-label">Platser</div><div class="slot-grid">';
          for (const s of platser) {
            html += renderSlot(p, s, closed);
          }
          html += '</div></div>';
        }
        if (reserver.length > 0) {
          html += '<div class="slot-group"><div class="slot-group-label">Reserver</div><div class="slot-grid">';
          for (const s of reserver) {
            html += renderSlot(p, s, closed);
          }
          html += '</div></div>';
        }

        html += '</div></div>';
      }
      html += '</div>';
    }
    html += '</div>';

    // Desktop table
    html += '<div class="pass-table-desktop">';
    for (const [date, datePasses] of Object.entries(byDate)) {
      html += `<h2 class="date-header">${formatDate(date)}</h2>`;
      html += '<table class="pass-table"><thead><tr><th>Tid</th><th>Aktivitet</th><th>Platser</th><th>Reserver</th></tr></thead><tbody>';
      for (const p of datePasses) {
        const platser = p.slots.filter(s => s.typ === 'plats');
        const reserver = p.slots.filter(s => s.typ === 'reserv');
        html += `<tr>
          <td class="pass-time">${formatTime(p.start_time)}–${formatTime(p.end_time)}</td>
          <td class="pass-aktivitet">${esc(p.aktivitet || '')}</td>
          <td class="plats ${closed ? 'closed' : ''}">${platser.map(s => renderSlotInline(p, s, closed)).join('')}</td>
          <td class="reserv ${closed ? 'closed' : ''}">${reserver.map(s => renderSlotInline(p, s, closed)).join('')}</td>
        </tr>`;
      }
      html += '</tbody></table>';
    }
    html += '</div>';

    // Summary
    html += renderSummary(pass);

    app.innerHTML = html;
    attachInputListeners();
  }

  function renderSlot(pass, slot, closed) {
    const cls = closed ? 'closed' : slot.typ;
    const id = `slot-${pass.id}-${slot.typ}-${slot.slot_nr}`;
    if (slot.namn) {
      if (isAdmin) {
        return `<div class="pass-slot ${cls}" id="${id}">
          <input type="text" value="${esc(slot.namn)}" data-pass="${pass.id}" data-typ="${slot.typ}" data-slot="${slot.slot_nr}" data-admin="1" maxlength="40">
        </div>`;
      }
      return `<div class="pass-slot ${cls}" id="${id}"><span class="name-display">${esc(slot.namn)}</span></div>`;
    }
    if (closed) return `<div class="pass-slot ${cls}" id="${id}"><span class="name-display">—</span></div>`;
    return `<div class="pass-slot ${cls}" id="${id}">
      <input type="text" placeholder="Skriv ditt namn" data-pass="${pass.id}" data-typ="${slot.typ}" data-slot="${slot.slot_nr}" maxlength="40">
    </div>`;
  }

  function renderSlotInline(pass, slot, closed) {
    const id = `cell-${pass.id}-${slot.typ}-${slot.slot_nr}`;
    if (slot.namn) {
      if (isAdmin) {
        return `<span class="inline-slot" id="${id}"><input type="text" value="${esc(slot.namn)}" data-pass="${pass.id}" data-typ="${slot.typ}" data-slot="${slot.slot_nr}" data-admin="1" maxlength="40"></span>`;
      }
      return `<span class="inline-slot" id="${id}"><span class="name-display">${esc(slot.namn)}</span></span>`;
    }
    if (closed) return `<span class="inline-slot" id="${id}"><span class="name-display">—</span></span>`;
    return `<span class="inline-slot" id="${id}"><input type="text" placeholder="Namn" data-pass="${pass.id}" data-typ="${slot.typ}" data-slot="${slot.slot_nr}" maxlength="40"></span>`;
  }

  function renderSummary(pass) {
    const counts = {};
    for (const p of pass) {
      for (const s of (p.slots || [])) {
        if (s.namn) {
          const key = s.namn.trim().toLowerCase();
          if (!counts[key]) counts[key] = { name: s.namn.trim(), total: 0, reserv: 0 };
          counts[key].total++;
          if (s.typ === 'reserv') counts[key].reserv++;
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

  function attachInputListeners() {
    document.querySelectorAll('input[data-pass]').forEach(input => {
      const passId = input.dataset.pass;
      const typ = input.dataset.typ;
      const slotNr = parseInt(input.dataset.slot);
      const isAdminEdit = input.dataset.admin === '1';

      input.addEventListener('input', () => {
        const key = `${passId}-${typ}-${slotNr}`;
        clearTimeout(debounceTimers[key]);
        debounceTimers[key] = setTimeout(() => saveSlot(passId, typ, slotNr, input.value.trim(), input, isAdminEdit), 500);
      });
    });
  }

  async function saveSlot(passId, typ, slotNr, namn, inputEl, adminEdit) {
    if (!namn && !adminEdit) return;
    try {
      const endpoint = adminEdit ? `/api/admin/pass/${passId}/book` : `/api/pass/${passId}/book`;
      await api(endpoint, { method: 'PUT', body: { typ, slot_nr: slotNr, namn } });

      const slot = inputEl.closest('.pass-slot, .inline-slot, td');
      if (slot) {
        slot.classList.remove('just-saved');
        void slot.offsetWidth;
        slot.classList.add('just-saved');
      }

      if (!adminEdit && namn) {
        inputEl.replaceWith(Object.assign(document.createElement('span'), {
          className: 'name-display',
          textContent: namn
        }));
      }
    } catch (err) {
      if (err.status === 409) {
        const slot = inputEl.closest('.pass-slot, .inline-slot, td');
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
    loadBranning();
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

    document.getElementById('admin-link').addEventListener('click', e => {
      e.preventDefault();
      const panel = document.getElementById('admin-panel');
      panel.classList.toggle('hidden');
      if (!isAdmin) {
        document.getElementById('admin-login').classList.remove('hidden');
        document.getElementById('admin-tools').classList.add('hidden');
      }
    });

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
        console.error('Fel vid skapande:', err);
      }
    });

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
        console.error('Fel:', err);
      }
    });

    document.getElementById('logout-btn').addEventListener('click', async () => {
      await api('/api/admin/logout', { method: 'POST' });
      isAdmin = false;
      document.getElementById('admin-panel').classList.add('hidden');
      loadBranning();
    });
  });
})();
