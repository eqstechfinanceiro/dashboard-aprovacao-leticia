// ===== AUTHENTICATION MODULE =====

// Check if user is logged in
function isLoggedIn() {
    return localStorage.getItem('auth_token') !== null;
}

// Get current user
function getCurrentUser() {
    const user = localStorage.getItem('auth_user');
    return user ? JSON.parse(user) : null;
}

// Logout function
function logout() {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    window.location.href = '../pages/login.html';
}

// Redirect if not logged in
function requireAuth() {
    if (!isLoggedIn()) {
        window.location.href = '../pages/login.html';
    }
}

// Initialize auth check on protected pages
function initAuthProtection() {
    // Check if current page is login page - don't redirect
    const currentPath = window.location.pathname;
    if (currentPath.includes('login.html')) {
        // If already logged in, redirect to dashboard
        if (isLoggedIn()) {
            window.location.href = '../index.html';
        }
        return;
    }
    
    // For all other pages, require authentication
    requireAuth();
}

// Make functions globally available
window.isLoggedIn = isLoggedIn;
window.getCurrentUser = getCurrentUser;
window.logout = logout;
window.requireAuth = requireAuth;
window.initAuthProtection = initAuthProtection;

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAuthProtection);
} else {
    initAuthProtection();
}
