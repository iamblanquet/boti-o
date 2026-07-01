document.addEventListener('DOMContentLoaded', () => {
  const companyTableBody = document.getElementById('companyTableBody');
  const addCompanyBtn = document.getElementById('addCompanyBtn');
  const companyModal = document.getElementById('companyModal');
  const companyForm = document.getElementById('companyForm');
  const closeModalBtn = document.getElementById('closeModalBtn');
  const cancelModalBtn = document.getElementById('cancelModalBtn');
  const logoutBtn = document.getElementById('logoutBtn');

  // Edit Admin Modal elements
  const adminEditModal = document.getElementById('adminEditModal');
  const adminEditForm = document.getElementById('adminEditForm');
  const closeAdminModalBtn = document.getElementById('closeAdminModalBtn');
  const cancelAdminModalBtn = document.getElementById('cancelAdminModalBtn');

  // Add Company Input Fields
  const companyNameInput = document.getElementById('companyName');
  const companySlugInput = document.getElementById('companySlug');
  const adminNameInput = document.getElementById('adminName');
  const adminUsernameInput = document.getElementById('adminUsername');
  const adminPasswordInput = document.getElementById('adminPassword');

  // Edit Admin Input Fields
  const adminEditCompanyIdInput = document.getElementById('adminEditCompanyId');
  const adminEditNameInput = document.getElementById('adminEditName');
  const adminEditUsernameInput = document.getElementById('adminEditUsername');
  const adminEditPasswordInput = document.getElementById('adminEditPassword');

  // Fetch Companies directory on load
  fetchCompanies();

  // Company Modal event listeners
  addCompanyBtn.addEventListener('click', openModal);
  closeModalBtn.addEventListener('click', closeModal);
  cancelModalBtn.addEventListener('click', closeModal);

  // Edit Admin Modal event listeners
  closeAdminModalBtn.addEventListener('click', closeAdminModal);
  cancelAdminModalBtn.addEventListener('click', closeAdminModal);

  // Close modals when clicking on backdrop
  companyModal.addEventListener('click', (e) => {
    if (e.target === companyModal) closeModal();
  });
  adminEditModal.addEventListener('click', (e) => {
    if (e.target === adminEditModal) closeAdminModal();
  });

  // Handle Form Submission (Create Tenant + Admin)
  companyForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = companyNameInput.value.trim();
    const slug = companySlugInput.value.trim().toLowerCase();
    const adminName = adminNameInput.value.trim();
    const adminUsername = adminUsernameInput.value.trim();
    const adminPassword = adminPasswordInput.value;

    if (!/^[a-z0-9-]+$/.test(slug)) {
      if (window.showToast) window.showToast('El slug solo puede contener letras minúsculas, números y guiones.', true);
      return;
    }

    const payload = { name, slug, adminName, adminUsername, adminPassword };

    try {
      const response = await fetch('/api/superadmin/companies', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (response.ok && data.success) {
        closeModal();
        if (window.showToast) window.showToast(`Empresa "${name}" registrada con éxito.`);
        fetchCompanies();
      } else {
        if (window.showToast) window.showToast(data.error || 'Error al guardar los datos.', true);
      }
    } catch (err) {
      console.error('Create company request failed:', err);
      if (window.showToast) window.showToast('Error de red. No se pudo registrar la empresa.', true);
    }
  });

  // Handle Edit Admin Submission (Update credentials)
  adminEditForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const companyId = adminEditCompanyIdInput.value;
    const name = adminEditNameInput.value.trim();
    const username = adminEditUsernameInput.value.trim();
    const password = adminEditPasswordInput.value;

    if (!companyId || !name || !username) {
      if (window.showToast) window.showToast('Nombre y usuario son campos obligatorios.', true);
      return;
    }

    const payload = { name, username };
    if (password && password.trim() !== '') {
      payload.password = password;
    }

    try {
      const response = await fetch(`/api/superadmin/companies/${companyId}/admin`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (response.ok && data.success) {
        closeAdminModal();
        if (window.showToast) window.showToast('Credenciales del Administrador actualizadas con éxito.');
        fetchCompanies();
      } else {
        if (window.showToast) window.showToast(data.error || 'Error al actualizar credenciales.', true);
      }
    } catch (err) {
      console.error('Update company admin credentials request failed:', err);
      if (window.showToast) window.showToast('Error de red al actualizar credenciales.', true);
    }
  });

  // Handle Logout click
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      const confirmLogout = confirm('¿Deseas cerrar sesión en la consola del Super Administrador?');
      if (!confirmLogout) return;

      try {
        await fetch('/api/auth/logout', { method: 'POST' });
      } catch (err) {
        console.error('Logout request failed:', err);
      }
      window.location.href = '/superadmin/login';
    });
  }

  // Fetch all companies from database
  async function fetchCompanies() {
    try {
      const response = await fetch('/api/superadmin/companies');

      if (response.status === 401 || response.status === 403) {
        window.location.href = '/superadmin/login';
        return;
      }

      const companies = await response.json();
      renderCompaniesTable(companies);
    } catch (err) {
      console.error('Fetch companies failed:', err);
      companyTableBody.innerHTML = `<tr><td colspan="5" class="px-6 py-12 text-center text-red-500 font-medium bg-slate-900/30">Error al cargar datos de conexión.</td></tr>`;
    }
  }

  // Render Companies data inside Table
  function renderCompaniesTable(companies) {
    if (!companies || companies.length === 0) {
      companyTableBody.innerHTML = `<tr><td colspan="5" class="px-6 py-12 text-center text-slate-500 italic font-medium bg-slate-900/10">No hay empresas registradas.</td></tr>`;
      return;
    }

    companyTableBody.innerHTML = '';

    companies.forEach(company => {
      const tr = document.createElement('tr');
      tr.className = 'hover:bg-indigo-500/5 transition-colors duration-150 border-b border-white/5';

      // 1. Company Name & Initials
      const nameTd = document.createElement('td');
      nameTd.className = 'px-6 py-4.5 font-semibold flex items-center gap-3';
      const initials = company.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
      nameTd.innerHTML = `
        <div class="w-8 h-8 rounded-xl bg-indigo-500/15 text-indigo-300 font-bold text-xs flex items-center justify-center shrink-0 border border-indigo-500/20">${initials}</div>
        <div>
          <div class="text-sm font-bold text-white">${company.name}</div>
          <div class="text-[10px] font-normal text-slate-500 mt-0.5">ID: ${company.id.substring(0, 8)}...</div>
        </div>
      `;

      // 2. Slug
      const slugTd = document.createElement('td');
      slugTd.className = 'px-6 py-4.5 text-indigo-400 font-mono text-xs font-semibold';
      slugTd.textContent = company.slug;

      // 3. Employee counts
      const usersTd = document.createElement('td');
      usersTd.className = 'px-6 py-4.5 text-slate-300 font-medium';
      usersTd.textContent = `${company.employee_count} usuarios`;

      // 4. Status Toggle Button
      const statusTd = document.createElement('td');
      statusTd.className = 'px-6 py-4.5';
      const statusBtn = document.createElement('button');
      statusBtn.className = `px-3 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase transition cursor-pointer ${company.active ? 'badge-active' : 'badge-inactive'}`;
      statusBtn.textContent = company.active ? 'Activo' : 'Suspendido';
      statusBtn.title = company.active ? 'Haga clic para suspender servicio' : 'Haga clic para reactivar servicio';
      statusBtn.addEventListener('click', () => toggleCompanyStatus(company));
      statusTd.appendChild(statusBtn);

      // 5. Actions (Edit company & Edit admin credentials)
      const actionsTd = document.createElement('td');
      actionsTd.className = 'px-6 py-4.5 text-right whitespace-nowrap';
      
      const editAdminBtn = document.createElement('button');
      editAdminBtn.className = 'p-2 text-slate-400 hover:text-indigo-400 hover:bg-white/5 rounded-xl transition mr-2 cursor-pointer border border-transparent hover:border-white/5 shadow-sm';
      editAdminBtn.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>`;
      editAdminBtn.title = 'Gestionar credenciales del administrador principal';
      editAdminBtn.addEventListener('click', () => openAdminEditModal(company));

      const editNameBtn = document.createElement('button');
      editNameBtn.className = 'p-2 text-slate-400 hover:text-indigo-400 hover:bg-white/5 rounded-xl transition cursor-pointer border border-transparent hover:border-white/5 shadow-sm';
      editNameBtn.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>`;
      editNameBtn.title = 'Editar nombre de empresa';
      editNameBtn.addEventListener('click', () => handleEditCompanyName(company));

      actionsTd.appendChild(editAdminBtn);
      actionsTd.appendChild(editNameBtn);

      tr.appendChild(nameTd);
      tr.appendChild(slugTd);
      tr.appendChild(usersTd);
      tr.appendChild(statusTd);
      tr.appendChild(actionsTd);

      companyTableBody.appendChild(tr);
    });
  }

  // Open Add Company modal
  function openModal() {
    companyForm.reset();
    companyModal.classList.remove('pointer-events-none');
    companyModal.classList.add('opacity-100');
    companyModal.querySelector('.modal-content-glass').classList.remove('scale-95');
    companyModal.querySelector('.modal-content-glass').classList.add('scale-100');
    setTimeout(() => companyNameInput.focus(), 250);
  }

  // Close Add Company modal
  function closeModal() {
    companyModal.classList.add('pointer-events-none');
    companyModal.classList.remove('opacity-100');
    companyModal.querySelector('.modal-content-glass').classList.add('scale-95');
    companyModal.querySelector('.modal-content-glass').classList.remove('scale-100');
    companyForm.reset();
  }

  // Open Edit Admin credentials modal
  async function openAdminEditModal(company) {
    adminEditForm.reset();
    adminEditCompanyIdInput.value = company.id;

    if (window.showToast) window.showToast('Cargando administrador principal...');

    try {
      const response = await fetch(`/api/superadmin/companies/${company.id}/admin`);
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Error del servidor (Estado: ${response.status})`);
      }
      
      const admin = await response.json();
      adminEditNameInput.value = admin.name;
      adminEditUsernameInput.value = admin.username;

      // Reveal modal
      adminEditModal.classList.remove('pointer-events-none');
      adminEditModal.classList.add('opacity-100');
      adminEditModal.querySelector('.modal-content-glass').classList.remove('scale-95');
      adminEditModal.querySelector('.modal-content-glass').classList.add('scale-100');
      setTimeout(() => adminEditNameInput.focus(), 250);
    } catch (err) {
      console.error(err);
      if (window.showToast) window.showToast(err.message || 'Error al cargar datos del administrador.', true);
    }
  }

  // Close Edit Admin credentials modal
  function closeAdminModal() {
    adminEditModal.classList.add('pointer-events-none');
    adminEditModal.classList.remove('opacity-100');
    adminEditModal.querySelector('.modal-content-glass').classList.add('scale-95');
    adminEditModal.querySelector('.modal-content-glass').classList.remove('scale-100');
    adminEditForm.reset();
  }

  // Toggle company active status
  async function toggleCompanyStatus(company) {
    const nextStatus = !company.active;
    const actionText = nextStatus ? 'reactivar' : 'suspender';
    
    const confirmMessage = `¿Estás seguro de que deseas ${actionText} la empresa "${company.name}"? ${!nextStatus ? 'Todos sus empleados perderán el acceso al panel al instante.' : 'Se restablecerá el acceso a todos sus empleados.'}`;

    let confirmResult = false;
    if (window.showCustomConfirm) {
      confirmResult = await window.showCustomConfirm(confirmMessage);
    } else {
      confirmResult = confirm(confirmMessage);
    }

    if (!confirmResult) return;

    try {
      const response = await fetch(`/api/superadmin/companies/${company.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ active: nextStatus })
      });

      if (response.ok) {
        if (window.showToast) window.showToast(`Servicio de la empresa ${company.name} ${nextStatus ? 'reactivado' : 'suspendido'} con éxito.`);
        fetchCompanies();
      } else {
        if (window.showToast) window.showToast('Error al modificar el estado de servicio.', true);
      }
    } catch (err) {
      console.error('Toggle company status failed:', err);
      if (window.showToast) window.showToast('Error de conexión.', true);
    }
  }

  // Edit company name
  async function handleEditCompanyName(company) {
    const newName = prompt(`Ingresa el nuevo nombre para la empresa "${company.name}":`, company.name);
    if (!newName || newName.trim() === '' || newName.trim() === company.name) return;

    try {
      const response = await fetch(`/api/superadmin/companies/${company.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name: newName.trim() })
      });

      if (response.ok) {
        if (window.showToast) window.showToast('Nombre actualizado con éxito.');
        fetchCompanies();
      } else {
        if (window.showToast) window.showToast('Error al actualizar el nombre.', true);
      }
    } catch (err) {
      console.error('Update company name failed:', err);
      if (window.showToast) window.showToast('Error de conexión.', true);
    }
  }
});
