class ToastNotification extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <div id="toast" class="toast fixed bottom-6 right-6 bg-slate-800 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 transform translate-y-20 opacity-0 transition-all duration-300 z-50 pointer-events-none" role="status">
        <svg id="toastIcon" class="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
        </svg>
        <span id="toastMsg" class="text-sm font-medium">Notificación</span>
      </div>
    `;

    window.showToast = function(message, isErrorOrType = false) {
      const toast = document.getElementById('toast');
      const toastMsg = document.getElementById('toastMsg');
      const toastIcon = document.getElementById('toastIcon');
      if (!toast || !toastMsg) return;

      const isError = isErrorOrType === true || isErrorOrType === 'error';
      toastMsg.textContent = message;

      if (isError) {
        toast.className = 'toast fixed bottom-6 right-6 bg-red-600 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 transform transition-all duration-300 z-50 pointer-events-none show';
        if (toastIcon) {
          toastIcon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>';
          toastIcon.setAttribute('class', 'w-5 h-5 text-white');
        }
      } else {
        toast.className = 'toast fixed bottom-6 right-6 bg-slate-800 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 transform transition-all duration-300 z-50 pointer-events-none show';
        if (toastIcon) {
          toastIcon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>';
          toastIcon.setAttribute('class', 'w-5 h-5 text-emerald-400');
        }
      }

      toast.classList.remove('translate-y-20', 'opacity-0');
      toast.classList.add('show');

      window.clearTimeout(window.showToast.timer);
      window.showToast.timer = window.setTimeout(() => {
        toast.classList.add('translate-y-20', 'opacity-0');
        toast.classList.remove('show');
      }, 3000);
    };
  }
}
customElements.define('toast-notification', ToastNotification);
