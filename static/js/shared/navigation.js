// ===== NAVIGATION =====
class Navigation {
    constructor() {
        this.navLinks = document.querySelectorAll('.nav-link');
        this.pageTitle = document.getElementById('page-title-text');
        this.pageSubtitle = document.getElementById('page-subtitle-text');
        this.init();
    }

    init() {
        // Set active link based on current page
        this.setActiveLink();
        
        // Mobile menu toggle
        const menuToggle = document.getElementById('menu-toggle');
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('overlay');
        
        if (menuToggle) {
            menuToggle.addEventListener('click', () => {
                sidebar.classList.toggle('open');
                overlay.classList.toggle('active');
            });
        }
        
        if (overlay) {
            overlay.addEventListener('click', () => {
                sidebar.classList.remove('open');
                overlay.classList.remove('active');
            });
        }
    }

    setActiveLink() {
        const currentPage = this.getCurrentPage();
        this.navLinks.forEach(link => {
            link.classList.remove('active');
            if (link.dataset.page === currentPage) {
                link.classList.add('active');
            }
        });
    }

    getCurrentPage() {
        const path = window.location.pathname;
        if (path.includes('dashboard.html') || path.endsWith('/') || path.endsWith('index.html')) return 'dashboard';
        if (path.includes('automacoes.html')) return 'automacoes';
        if (path.includes('progresso.html')) return 'progresso';
        if (path.includes('admin.html')) return 'admin';
        return 'dashboard';
    }
}

// Initialize navigation when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => new Navigation());
} else {
    new Navigation();
}
