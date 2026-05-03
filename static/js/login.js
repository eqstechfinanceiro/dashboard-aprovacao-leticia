// ===== LOGIN MODULE =====

// ===== AUTHENTICATION =====
const Auth = {
    // Check if user is logged in
    isLoggedIn() {
        return localStorage.getItem('auth_token') !== null;
    },

    // Get current user
    getCurrentUser() {
        const user = localStorage.getItem('auth_user');
        return user ? JSON.parse(user) : null;
    },

    // Login function
    async login(email, password) {
        try {
            // For now, use a simple hardcoded authentication
            // In production, this should call an API endpoint
            if (email === 'admin@central.com' && password === 'admin123') {
                const user = {
                    id: 1,
                    email: email,
                    name: 'Administrador',
                    role: 'admin'
                };
                
                // Store auth data
                localStorage.setItem('auth_token', 'mock_token_' + Date.now());
                localStorage.setItem('auth_user', JSON.stringify(user));
                
                return { success: true, user };
            } else {
                return { success: false, error: 'Usuário ou senha inválidos' };
            }
        } catch (error) {
            console.error('Login error:', error);
            return { success: false, error: 'Erro ao fazer login' };
        }
    },

    // Logout function
    logout() {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('auth_user');
        window.location.href = '../pages/login.html';
    },

    // Redirect if not logged in
    requireAuth() {
        if (!this.isLoggedIn()) {
            window.location.href = '../pages/login.html';
        }
    }
};

// ===== FORM HANDLING =====
const loginForm = document.getElementById('login-form');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const loginBtn = document.getElementById('login-btn');
const btnText = loginBtn.querySelector('.btn-text');
const spinner = loginBtn.querySelector('.spinner');
const errorMessage = document.getElementById('error-message');
const errorText = document.getElementById('error-text');

// Show error message
function showError(message) {
    errorText.textContent = message;
    errorMessage.classList.add('show');
}

// Hide error message
function hideError() {
    errorMessage.classList.remove('show');
}

// Set loading state
function setLoading(loading) {
    loginBtn.disabled = loading;
    btnText.style.display = loading ? 'none' : 'inline';
    spinner.style.display = loading ? 'inline-block' : 'none';
}

// Handle form submission
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    
    // Validate inputs
    if (!email || !password) {
        showError('Preencha todos os campos');
        return;
    }
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        showError('E-mail inválido');
        return;
    }
    
    hideError();
    setLoading(true);
    
    // Attempt login
    const result = await Auth.login(email, password);
    
    setLoading(false);
    
    if (result.success) {
        // Redirect to dashboard
        window.location.href = '../index.html';
    } else {
        showError(result.error || 'Erro ao fazer login');
    }
});

// Check if user is already logged in
if (Auth.isLoggedIn()) {
    window.location.href = '../index.html';
}

// Clear error on input
emailInput.addEventListener('input', hideError);
passwordInput.addEventListener('input', hideError);

// Make Auth globally available
window.Auth = Auth;
