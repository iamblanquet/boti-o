document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const employeeTableBody = document.getElementById('employeeTableBody');
  const addEmployeeBtn = document.getElementById('addEmployeeBtn');
  const employeeForm = document.getElementById('employeeForm');
  const searchInput = document.getElementById('search');
  const employeeCountBadge = document.getElementById('employeeCountBadge');

  // Master-Detail Panels
  const detailsPanel = document.getElementById('detailsPanel');
  const detailsPlaceholder = document.getElementById('detailsPlaceholder');
  const detailsContent = document.getElementById('detailsContent');
  const panelTitle = document.getElementById('panelTitle');
  const deleteEmployeeBtn = document.getElementById('deleteEmployeeBtn');

  // Detail Quick Profile Info
  const detailsAvatar = document.getElementById('detailsAvatar');
  const detailsFullName = document.getElementById('detailsFullName');
  const detailsSubText = document.getElementById('detailsSubText');

  // Detail Input Fields
  const employeeIdInput = document.getElementById('employeeId');
  const employeeNameInput = document.getElementById('employeeName');
  const employeeUsernameInput = document.getElementById('employeeUsername');
  const employeePasswordInput = document.getElementById('employeePassword');
  const passwordHelp = document.getElementById('passwordHelp');
  const employeeRoleSelect = document.getElementById('employeeRole');
  const employeeActiveInput = document.getElementById('employeeActive');
  const permissionsContainer = document.getElementById('permissionsContainer');
  const permissionCheckboxes = document.querySelectorAll('input[name="permission"]');

  // Global State
  let allEmployees = [];
  let filteredEmployees = [];
  let selectedEmployeeId = null;

  // Pagination Settings
  let currentPage = 1;
  const PAGE_SIZE = 5;

  // Module names mapping for user-friendly badges
  const moduleNames = {
    'dashboard': 'Bandeja',
    'clients': 'Clientes',
    'calendar': 'Calendario',
    'marketing': 'Campañas',
    'services-admin': 'Servicios',
    'flow-admin': 'Flujo Bot',
    'tracking': 'UTM',
    'patient-tracking': 'Seguimiento',
    'user-admin': 'Usuarios'
  };

  // On Load: Fetch all employees
  fetchEmployees();

  // Show panel in creation mode
  if (addEmployeeBtn) {
    addEmployeeBtn.addEventListener('click', () => {
      openDetailsInCreateMode();
    });
  }

  // Role Selection change to toggle permission checkboxes
  if (employeeRoleSelect) {
    employeeRoleSelect.addEventListener('change', () => {
      togglePermissionsGridBasedOnRole();
    });
  }

  // Client-side Search Input Filter
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      filterEmployees(searchInput.value.trim());
    });
  }

  // Handle Form Submission
  if (employeeForm) {
    employeeForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const id = employeeIdInput.value;
      const name = employeeNameInput.value.trim();
      const username = employeeUsernameInput.value.trim();
      const password = employeePasswordInput.value;
      const role = employeeRoleSelect.value;
      const active = employeeActiveInput.checked;

      // Primary admin security check: prevent deactivation or demotion
      if (username.toLowerCase() === 'admin') {
        if (!active) {
          if (window.showToast) window.showToast('No se puede desactivar la cuenta del administrador principal.', true);
          return;
        }
        if (role === 'employee') {
          if (window.showToast) window.showToast('No se puede degradar el rol del administrador principal.', true);
          return;
        }
      }

      // Gather permissions
      let permissions = [];
      if (role === 'admin') {
        permissions = Object.keys(moduleNames);
      } else {
        permissions = Array.from(permissionCheckboxes)
          .filter(cb => cb.checked)
          .map(cb => cb.value);
      }

      const payload = { name, username, role, permissions, active };
      if (password && password.trim() !== '') {
        payload.password = password;
      }

      // Validation for new employees
      if (!id && (!password || password.trim() === '')) {
        if (window.showToast) window.showToast('La contraseña es requerida para nuevos empleados.', true);
        return;
      }

      const isEdit = !!id;
      const url = isEdit ? `/api/employees/${id}` : '/api/employees';
      const method = isEdit ? 'PUT' : 'POST';

      try {
        const response = await fetch(url, {
          method: method,
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (response.ok) {
          if (window.showToast) {
            window.showToast(isEdit ? 'Empleado actualizado con éxito.' : 'Empleado creado con éxito.');
          }
          
          await fetchEmployees();
          if (isEdit) {
            const updatedEmp = allEmployees.find(emp => emp.id === id);
            if (updatedEmp) {
              selectEmployee(updatedEmp);
            } else {
              closeDetailsPanel();
            }
          } else {
            closeDetailsPanel();
          }
        } else {
          if (window.showToast) window.showToast(data.error || 'Error al guardar los datos.', true);
        }
      } catch (err) {
        console.error('Save employee error:', err);
        if (window.showToast) window.showToast('Error de conexión con el servidor.', true);
      }
    });
  }

  // Handle employee deletion from details panel trash bin
  if (deleteEmployeeBtn) {
    deleteEmployeeBtn.addEventListener('click', async () => {
      const id = employeeIdInput.value;
      if (!id) return;
      const employee = allEmployees.find(emp => emp.id === id);
      if (!employee) return;
      
      // Front-end block for primary admin deletion
      if (employee.username === 'admin') {
        if (window.showToast) window.showToast('No se puede eliminar la cuenta del administrador principal.', true);
        return;
      }

      const msg = `¿Estás seguro de que deseas eliminar la cuenta del empleado "${employee.name}" (${employee.username})? Esta acción borrará todas sus sesiones activas y no se puede deshacer.`;
      
      let confirmResult = false;
      if (window.showCustomConfirm) {
        confirmResult = await window.showCustomConfirm(
          `¿Estás seguro de que deseas eliminar la cuenta del empleado "${employee.name}" (${employee.username})? Esta acción borrará todas sus sesiones activas y no se puede deshacer.`,
          'Eliminar Empleado',
          { type: 'danger', confirmText: 'Eliminar' }
        );
      } else {
        confirmResult = confirm(msg);
      }

      if (!confirmResult) return;

      try {
        const response = await fetch(`/api/employees/${employee.id}`, {
          method: 'DELETE'
        });

        const data = await response.json();

        if (response.ok) {
          if (window.showToast) window.showToast('Empleado eliminado con éxito.');
          closeDetailsPanel();
          fetchEmployees();
        } else {
          if (window.showToast) window.showToast(data.error || 'Error al eliminar el empleado.', true);
        }
      } catch (err) {
        console.error('Delete employee error:', err);
        if (window.showToast) window.showToast('Error de conexión con el servidor.', true);
      }
    });
  }

  // Fetch all employees and populate table
  async function fetchEmployees() {
    try {
      const response = await fetch('/api/employees');
      
      if (response.status === 401) {
        window.location.href = '/login';
        return;
      }

      if (response.status === 455 || response.status === 403) {
        if (window.showToast) window.showToast('Acceso denegado. No eres administrador.', true);
        employeeTableBody.innerHTML = `<tr><td colspan="4" class="px-6 py-12 text-center text-red-500 font-medium">Acceso denegado. Solo administradores pueden ver esta página.</td></tr>`;
        setTimeout(() => window.location.href = '/home', 2000);
        return;
      }

      allEmployees = await response.json();
      filterEmployees(searchInput ? searchInput.value.trim() : '');
    } catch (err) {
      console.error('Fetch employees error:', err);
      employeeTableBody.innerHTML = `<tr><td colspan="4" class="px-6 py-12 text-center text-red-500">Error al conectar con la base de datos.</td></tr>`;
    }
  }

  // Filter Employees
  function filterEmployees(query) {
    if (query) {
      const q = query.toLowerCase();
      filteredEmployees = allEmployees.filter(emp => 
        emp.name.toLowerCase().includes(q) || 
        emp.username.toLowerCase().includes(q)
      );
    } else {
      filteredEmployees = allEmployees;
    }

    currentPage = 1; // reset page on search
    updatePagination();
  }

  // Math & Controls for Pagination
  function updatePagination() {
    const total = filteredEmployees.length;
    const totalPages = Math.ceil(total / PAGE_SIZE) || 1;

    // Clamp range
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    const start = total ? ((currentPage - 1) * PAGE_SIZE) + 1 : 0;
    const end = Math.min(currentPage * PAGE_SIZE, total);

    // Update count label badge
    if (employeeCountBadge) {
      employeeCountBadge.textContent = total
        ? `${start}-${end} de ${total} Empleados`
        : '0 Empleados';
    }

    // Slice active page
    const sliced = filteredEmployees.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
    renderEmployeesTable(sliced);

    // Populate pagination controls
    const paginationControls = document.getElementById('paginationControls');
    if (paginationControls) {
      paginationControls.innerHTML = total ? `
        <p class="font-semibold text-slate-500">Página ${currentPage} de ${totalPages}</p>
        <div class="flex items-center gap-2">
          <button type="button" id="prevPageBtn" ${currentPage <= 1 ? 'disabled' : ''} class="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 font-bold text-slate-600 transition hover:border-[#5D623F] hover:bg-[#f1f2e8] disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer">
            <svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15 19l-7-7 7-7"/></svg>
            Anterior
          </button>
          <button type="button" id="nextPageBtn" ${currentPage >= totalPages ? 'disabled' : ''} class="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 font-bold text-slate-600 transition hover:border-[#5D623F] hover:bg-[#f1f2e8] disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer">
            Siguiente
            <svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7"/></svg>
          </button>
        </div>
      ` : '';

      // Bind listeners
      const prevPageBtn = document.getElementById('prevPageBtn');
      const nextPageBtn = document.getElementById('nextPageBtn');
      if (prevPageBtn) {
        prevPageBtn.addEventListener('click', () => {
          if (currentPage > 1) {
            currentPage--;
            updatePagination();
          }
        });
      }
      if (nextPageBtn) {
        nextPageBtn.addEventListener('click', () => {
          if (currentPage < totalPages) {
            currentPage++;
            updatePagination();
          }
        });
      }
    }
  }

  // Render employees list in the table
  function renderEmployeesTable(employees) {
    if (!employees || employees.length === 0) {
      employeeTableBody.innerHTML = `<tr><td colspan="4" class="px-6 py-12 text-center text-slate-400 italic">No hay empleados registrados.</td></tr>`;
      return;
    }

    employeeTableBody.innerHTML = '';

    employees.forEach(emp => {
      const tr = document.createElement('tr');
      tr.className = 'hover:bg-slate-50/50 cursor-pointer transition-colors duration-150';
      tr.dataset.id = emp.id;

      // Apply selection highlights
      if (emp.id === selectedEmployeeId) {
        tr.classList.add('selected-row');
      }

      // 1. Name & Avatar
      const nameTd = document.createElement('td');
      nameTd.className = 'px-5 py-3 font-semibold text-slate-800 flex items-center gap-3';
      const initials = emp.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
      nameTd.innerHTML = `
        <div class="w-8 h-8 rounded-full bg-emerald-100 text-emerald-800 font-bold text-xs flex items-center justify-center shrink-0">${initials}</div>
        <div>
          <div class="text-xs font-bold text-slate-800">${emp.name}</div>
          <div class="text-[10px] font-normal text-slate-400 mt-0.5">ID: ${emp.id.substring(0, 8)}...</div>
        </div>
      `;

      // 2. Username
      const usernameTd = document.createElement('td');
      usernameTd.className = 'px-5 py-3 text-slate-600 font-medium font-mono text-xs';
      usernameTd.textContent = emp.username;

      // 3. Role
      const roleTd = document.createElement('td');
      roleTd.className = 'px-5 py-3';
      const roleBadge = document.createElement('span');
      roleBadge.className = emp.role === 'admin' 
        ? 'px-2 py-0.5 text-[10px] font-bold rounded bg-purple-50 text-purple-700 border border-purple-100' 
        : 'px-2 py-0.5 text-[10px] font-semibold rounded bg-blue-50 text-blue-700 border border-blue-100';
      roleBadge.textContent = emp.role === 'admin' ? 'Admin' : 'Empleado';
      roleTd.appendChild(roleBadge);

      // 4. Active Status
      const statusTd = document.createElement('td');
      statusTd.className = 'px-5 py-3';
      const statusSpan = document.createElement('span');
      statusSpan.className = `px-2 py-0.5 rounded-full text-[10px] font-bold ${emp.active ? 'status-active' : 'status-inactive'}`;
      statusSpan.textContent = emp.active ? 'Activo' : 'Inactivo';
      statusTd.appendChild(statusSpan);

      // Add Row Click Listener to load details panel
      tr.addEventListener('click', () => {
        selectEmployee(emp);
      });

      tr.appendChild(nameTd);
      tr.appendChild(usernameTd);
      tr.appendChild(roleTd);
      tr.appendChild(statusTd);

      employeeTableBody.appendChild(tr);
    });
  }

  // Select an employee and open the details panel
  function selectEmployee(employee) {
    selectedEmployeeId = employee.id;
    
    // Highlight correct row in table
    Array.from(employeeTableBody.querySelectorAll('tr')).forEach(tr => {
      if (tr.dataset.id === employee.id) {
        tr.classList.add('selected-row');
      } else {
        tr.classList.remove('selected-row');
      }
    });

    // Reset and populate form fields
    employeeForm.reset();
    employeeIdInput.value = employee.id;
    employeeNameInput.value = employee.name;
    employeeUsernameInput.value = employee.username;
    employeeRoleSelect.value = employee.role;
    employeeActiveInput.checked = employee.active;

    // Load Quick Profile details
    const initials = employee.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
    if (detailsAvatar) detailsAvatar.textContent = initials;
    if (detailsFullName) detailsFullName.textContent = employee.name;
    if (detailsSubText) detailsSubText.textContent = `@${employee.username}`;

    // Load Permissions checkboxes
    permissionCheckboxes.forEach(cb => {
      cb.checked = employee.permissions ? employee.permissions.includes(cb.value) : false;
    });

    // Password fields behavior
    employeePasswordInput.required = false;
    employeePasswordInput.value = '';
    if (passwordHelp) {
      passwordHelp.textContent = 'Dejar en blanco para mantener la contraseña actual.';
      passwordHelp.className = 'text-[10px] text-slate-400 mt-1';
    }

    // Title & Trash bin button
    if (panelTitle) panelTitle.textContent = 'Detalles de Acceso';
    
    // Hide delete button for the primary 'admin' user
    if (deleteEmployeeBtn) {
      if (employee.username === 'admin') {
        deleteEmployeeBtn.classList.add('hidden');
      } else {
        deleteEmployeeBtn.classList.remove('hidden');
      }
    }

    // Disable active toggle and role select for primary 'admin' user to prevent lockout
    if (employeeActiveInput) {
      if (employee.username === 'admin') {
        employeeActiveInput.disabled = true;
        employeeActiveInput.parentElement.style.opacity = '0.5';
        employeeActiveInput.parentElement.style.pointerEvents = 'none';
      } else {
        employeeActiveInput.disabled = false;
        employeeActiveInput.parentElement.style.opacity = '1';
        employeeActiveInput.parentElement.style.pointerEvents = 'auto';
      }
    }

    if (employeeRoleSelect) {
      if (employee.username === 'admin') {
        employeeRoleSelect.disabled = true;
        employeeRoleSelect.style.opacity = '0.5';
        employeeRoleSelect.style.pointerEvents = 'none';
      } else {
        employeeRoleSelect.disabled = false;
        employeeRoleSelect.style.opacity = '1';
        employeeRoleSelect.style.pointerEvents = 'auto';
      }
    }

    // Toggle permissions grid disabled state
    togglePermissionsGridBasedOnRole();

    // Reveal panel content
    if (detailsPlaceholder) detailsPlaceholder.classList.add('hidden');
    if (detailsContent) detailsContent.classList.remove('hidden');
  }

  // Open details panel in empty registration mode
  function openDetailsInCreateMode() {
    selectedEmployeeId = null;

    // Clear highlights in table rows
    Array.from(employeeTableBody.querySelectorAll('tr')).forEach(tr => {
      tr.classList.remove('selected-row');
    });

    // Reset form
    employeeForm.reset();
    employeeIdInput.value = '';
    employeeNameInput.value = '';
    employeeUsernameInput.value = '';
    employeeRoleSelect.value = 'employee';
    employeeActiveInput.checked = true;

    // Load empty initials/avatar values
    if (detailsAvatar) detailsAvatar.textContent = '+';
    if (detailsFullName) detailsFullName.textContent = 'Nuevo Empleado';
    if (detailsSubText) detailsSubText.textContent = '@usuario';

    // Clear permissions checklist
    permissionCheckboxes.forEach(cb => {
      cb.checked = false;
    });

    // Password requirements
    employeePasswordInput.required = true;
    employeePasswordInput.value = '';
    if (passwordHelp) {
      passwordHelp.textContent = 'La contraseña es obligatoria para nuevos empleados.';
      passwordHelp.className = 'text-[10px] text-red-500 mt-1';
    }

    // Panel UI tweaks
    if (panelTitle) panelTitle.textContent = 'Registrar Empleado';
    if (deleteEmployeeBtn) deleteEmployeeBtn.classList.add('hidden');

    // Ensure active toggle is enabled for creation
    if (employeeActiveInput) {
      employeeActiveInput.disabled = false;
      employeeActiveInput.parentElement.style.opacity = '1';
      employeeActiveInput.parentElement.style.pointerEvents = 'auto';
    }
    if (employeeRoleSelect) {
      employeeRoleSelect.disabled = false;
      employeeRoleSelect.style.opacity = '1';
      employeeRoleSelect.style.pointerEvents = 'auto';
    }

    togglePermissionsGridBasedOnRole();

    // Reveal panel content
    if (detailsPlaceholder) detailsPlaceholder.classList.add('hidden');
    if (detailsContent) detailsContent.classList.remove('hidden');
    
    setTimeout(() => employeeNameInput.focus(), 250);
  }

  // Close Details Panel
  function closeDetailsPanel() {
    selectedEmployeeId = null;
    
    // Clear highlights in table rows
    Array.from(employeeTableBody.querySelectorAll('tr')).forEach(tr => {
      tr.classList.remove('selected-row');
    });

    if (detailsContent) detailsContent.classList.add('hidden');
    if (detailsPlaceholder) detailsPlaceholder.classList.remove('hidden');
  }

  // Disable permissions grid if role is Admin (Admins have access to all modules automatically)
  function togglePermissionsGridBasedOnRole() {
    const isAdmin = employeeRoleSelect.value === 'admin';
    if (permissionsContainer) {
      if (isAdmin) {
        permissionsContainer.style.opacity = '0.4';
        permissionsContainer.style.pointerEvents = 'none';
        permissionCheckboxes.forEach(cb => cb.checked = true);
      } else {
        permissionsContainer.style.opacity = '1';
        permissionsContainer.style.pointerEvents = 'auto';
        // If we switch back, uncheck checkboxes that are not part of user's saved list
        const employee = allEmployees.find(emp => emp.id === employeeIdInput.value);
        permissionCheckboxes.forEach(cb => {
          cb.checked = employee && employee.permissions ? employee.permissions.includes(cb.value) : false;
        });
      }
    }
  }
});
