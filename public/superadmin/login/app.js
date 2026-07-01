document.addEventListener('DOMContentLoaded', () => {
  const card = document.querySelector('.login-card');
  const form = document.getElementById('loginForm');
  const usernameInput = document.getElementById('username');
  const passwordInput = document.getElementById('password');
  const errorAlert = document.getElementById('errorAlert');
  const errorMessage = document.getElementById('errorMessage');
  const submitBtn = document.getElementById('submitBtn');
  const btnText = document.getElementById('btnText');

  // Trigger entering animation
  setTimeout(() => {
    if (card) card.classList.add('active');
  }, 100);

  if (usernameInput) {
    setTimeout(() => usernameInput.focus(), 600);
  }

  // Handle Form Submission
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const username = usernameInput.value.trim();
    const password = passwordInput.value;

    if (!username || !password) {
      showError('Por favor ingresa tu usuario y contraseña.');
      return;
    }

    // Reset UI state
    errorAlert.classList.add('hidden');
    submitBtn.disabled = true;
    btnText.textContent = 'Verificando credenciales...';

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, password })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        // Enforce Super Admin check on system login route
        if (data.user && data.user.role === 'superadmin') {
          window.location.href = '/superadmin/dashboard';
        } else {
          // Reject login and force logout to clear cookies
          showError('Acceso denegado. No posees privilegios de Super Administrador.');
          await fetch('/api/auth/logout', { method: 'POST' });
        }
      } else {
        showError(data.error || 'Usuario o contraseña incorrectos.');
      }
    } catch (err) {
      console.error('Superadmin login request failed:', err);
      showError('Error de conexión con el servidor.');
    } finally {
      submitBtn.disabled = false;
      btnText.textContent = 'Ingresar al Sistema';
    }
  });

  function showError(msg) {
    errorMessage.textContent = msg;
    errorAlert.classList.remove('hidden');
    
    // Shake card effect on error
    if (card) {
      card.style.animation = 'none';
      card.offsetHeight; // trigger reflow
      card.style.animation = 'shake 0.4s ease';
    }
  }
});

// Inject keyframe animations dynamically
const style = document.createElement('style');
style.textContent = `
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  20%, 60% { transform: translateX(-5px); }
  40%, 80% { transform: translateX(5px); }
}
`;
document.head.appendChild(style);
