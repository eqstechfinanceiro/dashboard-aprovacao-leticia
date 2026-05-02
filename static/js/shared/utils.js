// ===== COUNTER ANIMATION =====
class CounterAnimator {
    constructor() {
        this.counters = document.querySelectorAll('.counter');
        this.animated = new Set();
        this.observe();
    }

    observe() {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting && !this.animated.has(entry.target)) {
                    this.animated.add(entry.target);
                    this.animate(entry.target);
                }
            });
        }, { threshold: 0.5 });

        this.counters.forEach(counter => observer.observe(counter));
    }

    animate(element) {
        const target = parseInt(element.dataset.target);
        const duration = 1500;
        const startTime = performance.now();

        const update = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
            const current = Math.round(eased * target);
            element.textContent = current.toLocaleString('pt-BR');

            if (progress < 1) {
                requestAnimationFrame(update);
            }
        };

        requestAnimationFrame(update);
    }
}

// ===== KPI UPDATES =====
function updateKPIs(kpis) {
    if (kpis['time-saved']) {
        const counter = document.querySelector('.kpi-time-saved .counter');
        if (counter) {
            counter.dataset.target = kpis['time-saved'].value;
            counter.textContent = '0';
        }
    }
    if (kpis['automations-active']) {
        const counter = document.querySelector('.kpi-automations .counter');
        if (counter) {
            counter.dataset.target = kpis['automations-active'].value;
            counter.textContent = '0';
        }
    }
    if (kpis['notes-today']) {
        const counter = document.querySelector('.kpi-notes .counter');
        if (counter) {
            counter.dataset.target = kpis['notes-today'].value;
            counter.textContent = '0';
        }
    }
    if (kpis['efficiency']) {
        const counter = document.querySelector('.kpi-efficiency .counter');
        if (counter) {
            counter.dataset.target = kpis['efficiency'].value;
            counter.textContent = '0';
        }
    }
}

// Initialize counter animator when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => new CounterAnimator());
} else {
    new CounterAnimator();
}
