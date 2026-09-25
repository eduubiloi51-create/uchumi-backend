let SETUP_KEY = '';
  let branches = [];

  const $ = id => document.getElementById(id);

  function showMsg(el, text, type) {
    el.textContent = text;
    el.className = 'msg ' + type;
  }

  $('unlockBtn').addEventListener('click', async () => {
    const key = $('masterKey').value.trim();
    if (!key) return;
    $('unlockBtn').disabled = true;
    $('unlockBtn').textContent = 'Checking…';
    try {
      const res = await fetch('/api/setup/staff?setup_key=' + encodeURIComponent(key));
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Something went wrong.');

      SETUP_KEY = key;
      branches = data.branches;
      $('cBranch').innerHTML = branches.map(b => `<option value="${b.id}">${b.name}</option>`).join('');
      renderStaff(data.staff);

      $('keyCard').classList.add('hidden');
      $('tools').classList.remove('hidden');
    } catch (err) {
      showMsg($('keyMsg'), err.message, 'error');
      $('unlockBtn').disabled = false;
      $('unlockBtn').textContent = 'Unlock';
    }
  });

  $('cRole').addEventListener('change', () => {
    $('branchRow').style.display = $('cRole').value === 'manager' ? 'block' : 'none';
  });
  $('branchRow').style.display = 'block';

  $('createBtn').addEventListener('click', async () => {
    $('createMsg').className = 'msg';
    const role = $('cRole').value;
    const payload = {
      name: $('cName').value.trim(),
      email: $('cEmail').value.trim(),
      password: $('cPassword').value,
      role,
      branch_id: role === 'manager' ? Number($('cBranch').value) : null,
      setup_key: SETUP_KEY,
    };
    $('createBtn').disabled = true;
    try {
      const res = await fetch('/api/setup/create-staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Something went wrong.');

      showMsg($('createMsg'), `Account created for ${payload.email}.`, 'success');
      $('cName').value = ''; $('cEmail').value = ''; $('cPassword').value = '';
      loadStaff();
    } catch (err) {
      showMsg($('createMsg'), err.message, 'error');
    } finally {
      $('createBtn').disabled = false;
    }
  });

  $('renameBtn').addEventListener('click', async () => {
  $('renameMsg').className = 'msg';
  const payload = {
    email: $('nEmail').value.trim(),
    new_name: $('nName').value.trim(),
    setup_key: SETUP_KEY,
  };
  $('renameBtn').disabled = true;
  try {
    const res = await fetch('/api/setup/update-name', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Something went wrong.');

    showMsg($('renameMsg'), `Name updated for ${payload.email}.`, 'success');
    $('nEmail').value = ''; $('nName').value = '';
    loadStaff();
  } catch (err) {
    showMsg($('renameMsg'), err.message, 'error');
  } finally {
    $('renameBtn').disabled = false;
  }
});

$('resetBtn').addEventListener('click', async () => {
    $('resetMsg').className = 'msg';
    const payload = {
      email: $('rEmail').value.trim(),
      new_password: $('rPassword').value,
      setup_key: SETUP_KEY,
    };
    $('resetBtn').disabled = true;
    try {
      const res = await fetch('/api/setup/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Something went wrong.');

      showMsg($('resetMsg'), `Password reset for ${payload.email}.`, 'success');
      $('rEmail').value = ''; $('rPassword').value = '';
    } catch (err) {
      showMsg($('resetMsg'), err.message, 'error');
    } finally {
      $('resetBtn').disabled = false;
    }
  });

  function renderStaff(staff) {
    if (!staff.length) {
      $('staffBody').innerHTML = '<tr><td colspan="5" style="color:#6b6b6b;">No accounts yet.</td></tr>';
      return;
    }
    $('staffBody').innerHTML = staff.map(u => `
      <tr>
        <td>${escapeHtml(u.name)}</td>
        <td>${escapeHtml(u.email)}</td>
        <td><span class="badge">${u.role}</span></td>
        <td>${u.branch_name || '—'}</td>
        <td><button class="ghost" data-id="${u.id}" data-email="${escapeHtml(u.email)}">Delete</button></td>
      </tr>
    `).join('');

    document.querySelectorAll('[data-id]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm(`Delete the account for ${btn.dataset.email}?`)) return;
        try {
          const res = await fetch(`/api/setup/staff/${btn.dataset.id}?setup_key=${encodeURIComponent(SETUP_KEY)}`, { method: 'DELETE' });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Something went wrong.');
          loadStaff();
        } catch (err) {
          showMsg($('listMsg'), err.message, 'error');
        }
      });
    });
  }

  async function loadStaff() {
    try {
      const res = await fetch('/api/setup/staff?setup_key=' + encodeURIComponent(SETUP_KEY));
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Something went wrong.');
      renderStaff(data.staff);
    } catch (err) {
      showMsg($('listMsg'), err.message, 'error');
    }
  }
  $('refreshBtn').addEventListener('click', loadStaff);

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
