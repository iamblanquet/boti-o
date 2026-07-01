class ConfirmModal extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <div id="customConfirmModal" class="fixed inset-0 z-[20000] hidden flex items-center justify-center p-4 opacity-0 transition-opacity duration-300 select-none" style="background-color: rgba(255, 255, 255, 0.45); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden transform scale-95 transition-transform duration-300 flex flex-col border border-slate-100" id="customConfirmModalContent">
          
          <!-- Modal Body Content -->
          <div class="p-6 text-center">
            <!-- Centered Red Warning Icon -->
            <div style="width: 48px; height: 48px; border-radius: 9999px; background-color: #fee2e2; color: #dc2626; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px auto;">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
              </svg>
            </div>
            <!-- Title -->
            <h3 id="confirmTitle" class="text-lg font-bold text-slate-800 mb-2">¿Estás seguro?</h3>
            <!-- Message -->
            <p class="text-sm text-slate-600 px-2" id="customConfirmMessage"></p>
          </div>

          <!-- Footer (Light gray background with more padding) -->
          <div style="padding: 20px 28px; background-color: #f8fafc; border-top: 1px solid #e2e8f0; display: flex; justify-content: flex-end; gap: 12px; align-items: center; box-sizing: border-box; width: 100%;">
            <button id="cancelCustomConfirmBtn" type="button" style="padding: 10px 20px; background-color: #ffffff; border: 1px solid #cbd5e1; color: #334155; font-weight: 600; border-radius: 12px; cursor: pointer; font-size: 13px; transition: all 0.2s; box-shadow: 0 1px 2px rgba(0,0,0,0.05); min-width: 95px; outline: none; font-family: inherit;" onmouseover="this.style.backgroundColor='#f8fafc'" onmouseout="this.style.backgroundColor='#ffffff'">Cancelar</button>
            <button id="acceptCustomConfirmBtn" type="button" style="padding: 10px 20px; background-color: #ef4444; border: none; color: #ffffff; font-weight: 600; border-radius: 12px; cursor: pointer; font-size: 13px; transition: all 0.2s; box-shadow: 0 4px 12px rgba(239,68,68,0.15); min-width: 95px; outline: none; font-family: inherit;" onmouseover="this.style.backgroundColor='#dc2626'" onmouseout="this.style.backgroundColor='#ef4444'"></button>
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
        
        if (!modal) { resolve(confirm(message)); return; }
        
        // Setup text
        msgEl.textContent = message;
        titleEl.textContent = title;
        
        // Setup confirm button label
        acceptBtn.textContent = options.confirmText || 'Aceptar';

        modal.classList.remove('hidden');
        requestAnimationFrame(() => {
          modal.classList.remove('opacity-0');
          content.classList.remove('scale-95');
          content.classList.add('scale-100');
        });

        const cleanup = () => {
          modal.classList.add('opacity-0');
          content.classList.remove('scale-100');
          content.classList.add('scale-95');
          setTimeout(() => modal.classList.add('hidden'), 300);
          acceptBtn.removeEventListener('click', onAccept);
          cancelBtn.removeEventListener('click', onCancel);
        };

        const onAccept = () => { cleanup(); resolve(true); };
        const onCancel = () => { cleanup(); resolve(false); };

        acceptBtn.addEventListener('click', onAccept);
        cancelBtn.addEventListener('click', onCancel);
      });
    };
  }
}
customElements.define('confirm-modal', ConfirmModal);
