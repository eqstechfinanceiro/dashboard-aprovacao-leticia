// ===== DASHBOARD MODULE =====

// ===== AUTOMATION LIST =====
class AutomationList {
    constructor() {
        this.container = document.getElementById('automation-list');
        if (this.container) {
            this.render();
        }
    }

    render() {
        const html = window.AppData.automations
            .filter(a => a.status === 'active')
            .map(automation => `
                <div class="automation-item" data-id="${automation.id}">
                    <div class="automation-item-left">
                        <div class="automation-status-indicator ${automation.running ? 'running' : 'stopped'}"></div>
                        <div class="automation-info">
                            <div class="automation-name">${automation.name}</div>
                            <div class="automation-sector">${automation.sector}</div>
                        </div>
                    </div>
                    <div class="automation-item-right">
                        <span class="automation-runtime">${automation.runtime}</span>
                        <label class="toggle-switch">
                            <input type="checkbox" ${automation.running ? 'checked' : ''} data-automation-id="${automation.id}">
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
            `).join('');

        this.container.innerHTML = html;
        this.bindEvents();
    }

    bindEvents() {
        this.container.querySelectorAll('.toggle-switch input').forEach(toggle => {
            toggle.addEventListener('change', async (e) => {
                const id = parseInt(e.target.dataset.automationId);
                const automation = window.AppData.automations.find(a => a.id === id);
                if (automation) {
                    const newRunningState = e.target.checked;
                    
                    // Update local state immediately for responsiveness
                    automation.running = newRunningState;
                    const item = e.target.closest('.automation-item');
                    const indicator = item.querySelector('.automation-status-indicator');
                    indicator.className = `automation-status-indicator ${newRunningState ? 'running' : 'stopped'}`;

                    // Update API
                    await ApiClient.updateAutomation(id, { running: newRunningState });
                }
            });
        });
    }
}

// ===== CHARTS =====
class ChartManager {
    constructor() {
        this.notasChart = null;
        this.sectorChart = null;
        this.evolutionChart = null;
        
        // Only initialize charts if on dashboard page
        if (this.isDashboardPage()) {
            this.initNotasChart('hora');
            this.initSectorChart();
            this.initEvolutionChart();
            this.setupPeriodSelector();
            this.initSparkline();
        }
    }

    isDashboardPage() {
        const path = window.location.pathname;
        return path.includes('dashboard.html') || path.endsWith('/') || path.endsWith('index.html');
    }

    getChartDefaults() {
        return {
            color: '#94a3b8',
            borderColor: 'rgba(99, 102, 241, 0.15)',
            font: { family: "'Inter', sans-serif" }
        };
    }

    initNotasChart(period) {
        const ctx = document.getElementById('notasChart');
        if (!ctx) return;

        if (this.notasChart) this.notasChart.destroy();

        const data = window.AppData.chartData[period];
        if (!data) return;

        this.notasChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: data.labels,
                datasets: [{
                    label: 'Notas Processadas',
                    data: data.data,
                    borderColor: '#6366f1',
                    backgroundColor: (context) => {
                        const chart = context.chart;
                        const { ctx: c, chartArea } = chart;
                        if (!chartArea) return 'rgba(99, 102, 241, 0.6)';
                        const gradient = c.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);
                        gradient.addColorStop(0, 'rgba(99, 102, 241, 0.02)');
                        gradient.addColorStop(1, 'rgba(99, 102, 241, 0.6)');
                        return gradient;
                    },
                    fill: true,
                    tension: 0.4,
                    borderWidth: 2,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    pointBackgroundColor: '#6366f1',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(17, 24, 39, 0.95)',
                        titleColor: '#f1f5f9',
                        bodyColor: '#94a3b8',
                        borderColor: 'rgba(99, 102, 241, 0.3)',
                        borderWidth: 1,
                        cornerRadius: 8,
                        padding: 12,
                        titleFont: { family: "'Inter', sans-serif", weight: '600' },
                        bodyFont: { family: "'Inter', sans-serif" },
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { color: '#64748b', font: { family: "'Inter', sans-serif", size: 11 } },
                        border: { display: false }
                    },
                    y: {
                        grid: { color: 'rgba(99, 102, 241, 0.06)', drawBorder: false },
                        ticks: { color: '#64748b', font: { family: "'Inter', sans-serif", size: 11 } },
                        border: { display: false },
                        beginAtZero: true
                    }
                },
                animation: {
                    duration: 1000,
                    easing: 'easeOutQuart'
                }
            }
        });
    }

    initSectorChart() {
        const ctx = document.getElementById('sectorChart');
        if (!ctx) return;

        // Use sector data from API
        const sectorData = window.AppData.sectors.map(sector => ({
            name: sector.name,
            hours: Math.floor(Math.random() * 300) + 50, // Placeholder - should come from API
            color: sector.color
        }));

        this.sectorChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: sectorData.map(s => s.name),
                datasets: [{
                    data: sectorData.map(s => s.hours),
                    backgroundColor: sectorData.map(s => s.color),
                    borderColor: 'rgba(10, 14, 26, 0.8)',
                    borderWidth: 3,
                    hoverOffset: 8,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '70%',
                plugins: {
                    legend: {
                        position: 'right',
                        labels: {
                            color: '#94a3b8',
                            font: { family: "'Inter', sans-serif", size: 11 },
                            padding: 16,
                            usePointStyle: true,
                            pointStyleWidth: 10,
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(17, 24, 39, 0.95)',
                        titleColor: '#f1f5f9',
                        bodyColor: '#94a3b8',
                        borderColor: 'rgba(99, 102, 241, 0.3)',
                        borderWidth: 1,
                        cornerRadius: 8,
                        padding: 12,
                        titleFont: { family: "'Inter', sans-serif", weight: '600' },
                        bodyFont: { family: "'Inter', sans-serif" },
                        callbacks: {
                            label: (context) => `${context.parsed} horas economizadas`
                        }
                    }
                },
                animation: {
                    animateRotate: true,
                    duration: 1200,
                }
            }
        });
    }

    initEvolutionChart() {
        const ctx = document.getElementById('evolutionChart');
        if (!ctx) return;

        const weekData = window.AppData.chartData['semana']?.data || [680, 720, 750, 810];
        const weekLabels = window.AppData.chartData['semana']?.labels || ['Sem 1', 'Sem 2', 'Sem 3', 'Sem 4'];

        this.evolutionChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: weekLabels,
                datasets: [{
                    label: 'Notas Processadas',
                    data: weekData,
                    borderColor: '#6366f1',
                    backgroundColor: (context) => {
                        const chart = context.chart;
                        const { ctx: c, chartArea } = chart;
                        if (!chartArea) return 'rgba(99, 102, 241, 0.1)';
                        const gradient = c.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);
                        gradient.addColorStop(0, 'rgba(99, 102, 241, 0.02)');
                        gradient.addColorStop(1, 'rgba(99, 102, 241, 0.3)');
                        return gradient;
                    },
                    fill: true,
                    tension: 0.4,
                    borderWidth: 2,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    pointBackgroundColor: '#6366f1',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(17, 24, 39, 0.95)',
                        titleColor: '#f1f5f9',
                        bodyColor: '#94a3b8',
                        borderColor: 'rgba(99, 102, 241, 0.3)',
                        borderWidth: 1,
                        cornerRadius: 8,
                        padding: 12,
                        titleFont: { family: "'Inter', sans-serif", weight: '600' },
                        bodyFont: { family: "'Inter', sans-serif" },
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { color: '#64748b', font: { family: "'Inter', sans-serif", size: 11 } },
                        border: { display: false }
                    },
                    y: {
                        grid: { color: 'rgba(99, 102, 241, 0.06)', drawBorder: false },
                        ticks: { color: '#64748b', font: { family: "'Inter', sans-serif", size: 11 } },
                        border: { display: false },
                        beginAtZero: true
                    }
                },
                animation: {
                    duration: 1000,
                    easing: 'easeOutQuart'
                }
            }
        });
    }

    initSparkline() {
        const container = document.getElementById('mini-chart-weekly');
        if (!container) return;

        // Use chart data from API (semana period)
        const weekData = window.AppData.chartData['semana']?.data || [120, 135, 148, 142, 155, 160, 145, 158, 165, 170, 162, 175];
        const data = weekData;
        const width = 280;
        const height = 50;
        const max = Math.max(...data);
        const min = Math.min(...data);
        const range = max - min || 1;

        const points = data.map((val, i) => {
            const x = (i / (data.length - 1)) * width;
            const y = height - ((val - min) / range) * (height - 8) - 4;
            return `${x},${y}`;
        });

        const areaPoints = [...points, `${width},${height}`, `0,${height}`];

        container.innerHTML = `
            <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
                <defs>
                    <linearGradient id="sparkline-grad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stop-color="rgba(99, 102, 241, 0.3)" />
                        <stop offset="100%" stop-color="rgba(99, 102, 241, 0.02)" />
                    </linearGradient>
                </defs>
                <polygon points="${areaPoints.join(' ')}" fill="url(#sparkline-grad)" />
                <polyline points="${points.join(' ')}" fill="none" stroke="#6366f1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                <circle cx="${(data.length - 1) / (data.length - 1) * width}" cy="${height - ((data[data.length - 1] - min) / range) * (height - 8) - 4}" r="3" fill="#6366f1" />
            </svg>
        `;
    }

    setupPeriodSelector() {
        const selector = document.getElementById('period-selector');
        if (!selector) return;

        selector.querySelectorAll('.period-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                selector.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.initNotasChart(btn.dataset.period);
            });
        });
    }
}

// ===== INITIALIZE DASHBOARD =====
async function initDashboard() {
    await window.loadAppData();
    
    new ChartManager();
    new AutomationList();
    new window.CounterAnimator();
    
    if (window.AppData.kpis) {
        window.updateKPIs(window.AppData.kpis);
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDashboard);
} else {
    initDashboard();
}
