class AlertModal extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <div id="customAlertModal" class="fixed inset-0 z-[20000] hidden flex items-center justify-center p-4 opacity-0 transition-opacity duration-300 select-none" style="background-color: rgba(255, 255, 255, 0.45); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden transform scale-95 transition-transform duration-300 flex flex-col border border-slate-100" id="customAlertModalContent">
          
          <!-- Modal Body Content -->
          <div class="p-6 text-center">
            <!-- Centered Info Icon -->
            <div style="width: 48px; height: 48px; border-radius: 9999px; background-color: #f0f9ff; color: #0284c7; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px auto;">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
            </div>
            <!-- Title -->
            <h3 class="text-lg font-bold text-slate-800 mb-2">Aviso</h3>
            <!-- Message -->
            <p class="text-sm text-slate-600 px-2" id="customAlertMessage"></p>
          </div>

          <!-- Footer (Light gray background with more padding) -->
          <div style="padding: 20px 28px; background-color: #f8fafc; border-top: 1px solid #e2e8f0; display: flex; justify-content: center; box-sizing: border-box; width: 100%;">
            <button id="closeCustomAlertBtn" type="button" style="padding: 10px 18px; background-color: #059669; border: none; color: #ffffff; font-weight: 600; border-radius: 12px; cursor: pointer; font-size: 13px; transition: background-color 0.2s; box-shadow: 0 4px 12px rgba(5,150,105,0.15); width: 100%; outline: none; font-family: inherit;" onmouseover="this.style.backgroundColor='#047857'" onmouseout="this.style.backgroundColor='#059669'">Aceptar</button>
          </div>

        </div>
      </div>
    `;

    window.showCustomAlert = function(message) {
      const modal = document.getElementById('customAlertModal');
      const content = document.getElementById('customAlertModalContent');
      const msgEl = document.getElementById('customAlertMessage');
      const closeBtn = document.getElementById('closeCustomAlertBtn');
      if (!modal) { alert(message); return; }
      msgEl.textContent = message;
      modal.classList.remove('hidden');
      requestAnimationFrame(() => {
        modal.classList.remove('opacity-0');
        content.classList.remove('scale-95');
        content.classList.add('scale-100');
      });
      const closeModal = () => {
        modal.classList.add('opacity-0');
        content.classList.remove('scale-100');
        content.classList.add('scale-95');
        setTimeout(() => modal.classList.add('hidden'), 300);
        closeBtn.removeEventListener('click', closeModal);
      };
      closeBtn.addEventListener('click', closeModal);
    };
  }
}
customElements.define('alert-modal', AlertModal);
