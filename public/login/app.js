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
  }, 150);

  // Focus on username input on load
  if (usernameInput) {
    setTimeout(() => usernameInput.focus(), 800);
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

    // Reset error state
    errorAlert.classList.add('hidden');
    submitBtn.disabled = true;
    btnText.textContent = 'Iniciando sesión...';

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
        // Redirect to homepage
        window.location.href = '/home';
      } else {
        showError(data.error || 'Credenciales inválidas. Por favor intenta de nuevo.');
      }
    } catch (err) {
      console.error('Login request failed:', err);
      showError('Error de red. No se pudo conectar al servidor de autenticación.');
    } finally {
      submitBtn.disabled = false;
      btnText.textContent = 'Iniciar Sesión';
    }
  });

  function showError(msg) {
    errorMessage.textContent = msg;
    errorAlert.classList.remove('hidden');
    
    // Shake animation on card if error occurs
    if (card) {
      card.style.animation = 'none';
      // Trigger reflow
      card.offsetHeight; 
      card.style.animation = 'shake 0.4s ease';
    }
  }
});

// Inject keyframe animations dynamically
const style = document.createElement('style');
style.textContent = `
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  20%, 60% { transform: translateX(-6px); }
  40%, 80% { transform: translateX(6px); }
}
`;
document.head.appendChild(style);
