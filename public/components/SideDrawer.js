class SideDrawer extends HTMLElement {
  async connectedCallback() {
    const active = this.getAttribute('active') || 'home';
    
    // Fetch session profile
    let user = null;
    try {
      const res = await fetch('/api/auth/me');
      if (res.status === 401) {
        window.location.href = '/login';
        return;
      }
      user = await res.json();
    } catch (err) {
      console.error('Error fetching user permission in SideDrawer:', err);
      // Fallback redirect if API is unreachable
      window.location.href = '/login';
      return;
    }

    const items = [
      {
        key: 'home',
        href: '/home',
        label: 'Inicio',
        title: 'Inicio',
        icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/>'
      },
      {
        key: 'dashboard',
        href: '/dashboard',
        label: 'Bandeja',
        title: 'Bandeja de atencion',
        icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>'
      },
      {
        key: 'clients',
        href: '/clients',
        label: 'Clientes',
        title: 'Clientes',
        icon: '<circle cx="10" cy="8" r="4" stroke-width="2"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 21v-1a6 6 0 0112 0v1M18 10.5a3 3 0 110 6M20 21v-1a4 4 0 00-3-3.87"/>'
      },
      {
        key: 'calendar',
        href: '/calendar',
        label: 'Calendario',
        title: 'Calendario',
        icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>'
      },
      {
        key: 'marketing',
        href: '/marketing',
        label: 'Mis campanas',
        title: 'Campanas de Marketing',
        icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z"/>'
      },
      {
        key: 'services-admin',
        href: '/services-admin',
        label: 'Servicios',
        title: 'Editor de Servicios',
        icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/>'
      },
      {
        key: 'flow-admin',
        href: '/flow-admin',
        label: 'Flujo Bot',
        title: 'Gestor de Flujos',
        icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"/>'
      },
      {
        key: 'tracking',
        href: '/tracking',
        label: 'Enlaces (UTM)',
        title: 'Enlaces de Seguimiento',
        icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/>'
      },
      {
        key: 'patient-tracking',
        href: '/patient-tracking',
        label: 'Seguimiento',
        title: 'Seguimiento de pacientes',
        icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 11.5a3 3 0 116 0c0 1.5-1.5 2.7-3 4.5-1.5-1.8-3-3-3-4.5z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 4h14a2 2 0 012 2v13a1 1 0 01-1 1H4a1 1 0 01-1-1V6a2 2 0 012-2z"/>'
      },
      {
        key: 'user-admin',
        href: '/user-admin',
        label: 'Usuarios',
        title: 'Gestión de Usuarios',
        icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a3 3 0 11-6 0 3 3 0 016 0z"/>'
      },
      {
        key: 'companies',
        href: '/superadmin/dashboard',
        label: 'Empresas',
        title: 'Directorio de Inquilinos',
        icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>'
      }
    ];

    // Filter items based on user permissions
    const allowedItems = items.filter(item => {
      if (user.role === 'superadmin') {
        return item.key === 'companies';
      }
      if (item.key === 'companies') return false; // Hide companies for standard users
      if (user.role === 'admin') return true;
      if (item.key === 'home') return true;
      return user.permissions && user.permissions.includes(item.key);
    });

    const links = allowedItems.map((item) => `
      <a href="${item.href}" class="drawer-link ${active === item.key ? 'drawer-active' : ''}" title="${item.title}">
        <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">${item.icon}</svg>
        <span class="drawer-label">${item.label}</span>
      </a>
    `).join('');

    this.innerHTML = `
      <div id="drawerOverlay"></div>
      <nav id="sideDrawer" aria-label="Menu principal">
        <div class="drawer-header">
          <button id="drawerMenuBtn" class="drawer-menu-btn" aria-label="Abrir menu" type="button">
            <span></span>
            <span></span>
            <span></span>
          </button>
          <span class="drawer-title">Menu</span>
          <button id="closeDrawerBtn" class="drawer-close-btn" aria-label="Cerrar menu">&times;</button>
        </div>
        <div class="drawer-list" style="flex: 1; display: flex; flex-direction: column; justify-content: space-between;">
          <div>
            ${links}
          </div>
          <div style="border-t: 1px solid rgba(255,255,255,0.1); margin-top: auto; padding-top: 10px;">
            <a href="#" id="drawerLogoutBtn" class="drawer-link" title="Cerrar sesión" style="color: #fca5a5;">
              <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
              </svg>
              <span class="drawer-label">Cerrar Sesión</span>
            </a>
          </div>
        </div>
      </nav>
    `;

    const drawer = this.querySelector('#sideDrawer');
    const overlay = this.querySelector('#drawerOverlay');
    const closeBtn = this.querySelector('#closeDrawerBtn');
    const drawerMenuBtn = this.querySelector('#drawerMenuBtn');
    const logoutBtn = this.querySelector('#drawerLogoutBtn');

    const openDrawer = () => {
      drawer.classList.add('drawer-open');
      overlay.classList.add('overlay-visible');
    };

    setTimeout(() => {
      const menuBtn = document.getElementById('mainMenuBtn');
      if (menuBtn) menuBtn.addEventListener('click', openDrawer);
    }, 0);

    const closeDrawer = () => {
      drawer.classList.remove('drawer-open');
      overlay.classList.remove('overlay-visible');
    };

    if (drawerMenuBtn) drawerMenuBtn.addEventListener('click', openDrawer);
    if (closeBtn) closeBtn.addEventListener('click', closeDrawer);
    if (overlay) overlay.addEventListener('click', closeDrawer);
    
    // Dynamically load ConfirmModal.js if not already loaded
    if (!customElements.get('confirm-modal')) {
      const script = document.createElement('script');
      script.src = '/components/ConfirmModal.js';
      document.head.appendChild(script);
      script.onload = () => {
        if (!document.querySelector('confirm-modal')) {
          const confirmModal = document.createElement('confirm-modal');
          document.body.appendChild(confirmModal);
        }
      };
    } else {
      if (!document.querySelector('confirm-modal')) {
        const confirmModal = document.createElement('confirm-modal');
        document.body.appendChild(confirmModal);
      }
    }

    // Dynamically load AlertModal.js if not already loaded
    if (!customElements.get('alert-modal')) {
      const script = document.createElement('script');
      script.src = '/components/AlertModal.js';
      document.head.appendChild(script);
      script.onload = () => {
        if (!document.querySelector('alert-modal')) {
          const alertModal = document.createElement('alert-modal');
          document.body.appendChild(alertModal);
        }
      };
    } else {
      if (!document.querySelector('alert-modal')) {
        const alertModal = document.createElement('alert-modal');
        document.body.appendChild(alertModal);
      }
    }

    // Bind logout button click
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        const showConfirm = window.showCustomConfirm || ((msg) => Promise.resolve(confirm(msg)));
        const confirmLogout = await showConfirm(
          '¿Deseas cerrar sesión en el sistema?',
          'Cerrar Sesión',
          { type: 'info', confirmText: 'Salir' }
        );
        if (!confirmLogout) return;
        
        try {
          await fetch('/api/auth/logout', { method: 'POST' });
        } catch (err) {
          console.error('Logout error:', err);
        }
        window.location.href = user.role === 'superadmin' ? '/superadmin/login' : '/login';
      });
    }

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeDrawer();
    });
  }
}

customElements.define('side-drawer', SideDrawer);
