class ConfirmModal extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <div id="customConfirmModal" class="fixed inset-0 z-[20000] hidden flex items-center justify-center p-4 opacity-0 transition-opacity duration-200 select-none" style="background-color: rgba(15, 23, 42, 0.5); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);">
        <div class="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden transform scale-95 transition-transform duration-200 flex flex-col border border-slate-100" id="customConfirmModalContent">
          
          <!-- Modal Body Content -->
          <div class="p-6 text-center">
            <!-- Centered Warning Icon -->
            <div id="customConfirmIconContainer" style="width: 52px; height: 52px; border-radius: 9999px; background-color: #fee2e2; color: #ef4444; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px auto; border: 1px solid #fecaca;">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
              </svg>
            </div>
            <!-- Title -->
            <h3 id="confirmTitle" class="text-xl font-bold text-slate-800 mb-2">¿Estás seguro?</h3>
            <!-- Message -->
            <p class="text-sm text-slate-600 px-1 leading-relaxed" id="customConfirmMessage"></p>
          </div>

          <!-- Footer -->
          <div style="padding: 16px 24px; background-color: #f8fafc; border-top: 1px solid #e2e8f0; display: flex; justify-content: flex-end; gap: 12px; align-items: center; box-sizing: border-box; width: 100%;">
            <button id="cancelCustomConfirmBtn" type="button" style="padding: 10px 18px; background-color: #ffffff; border: 1px solid #cbd5e1; color: #334155; font-weight: 600; border-radius: 12px; cursor: pointer; font-size: 13px; transition: all 0.2s; box-shadow: 0 1px 2px rgba(0,0,0,0.05); min-width: 90px; outline: none; font-family: inherit;">Cancelar</button>
            <button id="acceptCustomConfirmBtn" type="button" style="padding: 10px 20px; background-color: #ef4444; border: none; color: #ffffff; font-weight: 600; border-radius: 12px; cursor: pointer; font-size: 13px; transition: all 0.2s; box-shadow: 0 4px 12px rgba(239,68,68,0.25); min-width: 95px; outline: none; font-family: inherit;"></button>
          </div>

        </div>
      </div>
    `;

    window.showCustomConfirm = function(message, title = '¿Estás seguro?', options = {}) {
      return new Promise((resolve) => {
        const modal = document.getElementById('customConfirmModal');
        const content = document.getElementById('customConfirmModalContent');
        const msgEl = document.getElementById('customConfirmMessage');
        const titleEl = document.getElementById('confirmTitle');
        const acceptBtn = document.getElementById('acceptCustomConfirmBtn');
        const cancelBtn = document.getElementById('cancelCustomConfirmBtn');
        const iconContainer = document.getElementById('customConfirmIconContainer');
        
        if (!modal) { resolve(confirm(message)); return; }
        
        // Setup text
        msgEl.textContent = message;
        titleEl.textContent = title;
        
        // Setup confirm button label & style
        acceptBtn.textContent = options.confirmText || 'Aceptar';
        cancelBtn.textContent = options.cancelText || 'Cancelar';

        const isDanger = options.danger !== false;
        if (isDanger) {
          acceptBtn.style.backgroundColor = '#ef4444';
          acceptBtn.style.boxShadow = '0 4px 12px rgba(239, 68, 68, 0.25)';
          if (iconContainer) {
            iconContainer.style.backgroundColor = '#fee2e2';
            iconContainer.style.color = '#ef4444';
            iconContainer.style.borderColor = '#fecaca';
          }
        } else {
          acceptBtn.style.backgroundColor = '#16a34a';
          acceptBtn.style.boxShadow = '0 4px 12px rgba(22, 163, 74, 0.25)';
          if (iconContainer) {
            iconContainer.style.backgroundColor = '#dcfce7';
            iconContainer.style.color = '#16a34a';
            iconContainer.style.borderColor = '#bbf7d0';
          }
        }

        modal.classList.remove('hidden');
        requestAnimationFrame(() => {
          modal.classList.remove('opacity-0');
          content.classList.remove('scale-95');
          content.classList.add('scale-100');
        });

        let closed = false;
        const cleanup = () => {
          if (closed) return;
          closed = true;
          modal.classList.add('opacity-0');
          content.classList.remove('scale-100');
          content.classList.add('scale-95');
          setTimeout(() => modal.classList.add('hidden'), 200);
          acceptBtn.removeEventListener('click', onAccept);
          cancelBtn.removeEventListener('click', onCancel);
          modal.removeEventListener('click', onBackdrop);
          document.removeEventListener('keydown', onKeydown);
        };

        const onAccept = () => { cleanup(); resolve(true); };
        const onCancel = () => { cleanup(); resolve(false); };
        const onBackdrop = (e) => { if (e.target === modal) { cleanup(); resolve(false); } };
        const onKeydown = (e) => {
          if (e.key === 'Escape') { cleanup(); resolve(false); }
          if (e.key === 'Enter') { cleanup(); resolve(true); }
        };

        acceptBtn.addEventListener('click', onAccept);
        cancelBtn.addEventListener('click', onCancel);
        modal.addEventListener('click', onBackdrop);
        document.addEventListener('keydown', onKeydown);
      });
    };
  }
}
customElements.define('confirm-modal', ConfirmModal);
