// ===== API CLIENT =====
// API_BASE usa '/api' para deploy no Vercel
// Para testes locais, use 'http://localhost:5000/api'
const API_BASE = 'http://localhost:5000/api';

const ApiClient = {
    async fetch(endpoint, options = {}) {
        try {
            const response = await fetch(`${API_BASE}${endpoint}`, {
                headers: { 'Content-Type': 'application/json', ...options.headers },
                ...options
            });
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            return await response.json();
        } catch (error) {
            console.error(`Error fetching ${endpoint}:`, error);
            return null;
        }
    },

    async getAutomations() {
        return await this.fetch('/automations');
    },

    async getSectors() {
        return await this.fetch('/sectors');
    },

    async getTimeline() {
        return await this.fetch('/timeline');
    },

    async getKPIs() {
        return await this.fetch('/kpis');
    },

    async getChartData() {
        return await this.fetch('/chart_data');
    },

    async getNotes() {
        return await this.fetch('/notes');
    },

    async updateAutomation(id, data) {
        return await this.fetch(`/automations/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    },

    // Sectors CRUD
    async createSector(data) {
        return await this.fetch('/sectors', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    },

    async updateSector(key, data) {
        return await this.fetch(`/sectors/${key}`, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    },

    async deleteSector(key) {
        return await this.fetch(`/sectors/${key}`, {
            method: 'DELETE'
        });
    },

    // Automations CRUD
    async createAutomation(data) {
        return await this.fetch('/automations', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    },

    async deleteAutomation(id) {
        return await this.fetch(`/automations/${id}`, {
            method: 'DELETE'
        });
    },

    // Timeline CRUD
    async createTimeline(data) {
        return await this.fetch('/timeline', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    },

    async updateTimeline(id, data) {
        return await this.fetch(`/timeline/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    },

    async deleteTimeline(id) {
        return await this.fetch(`/timeline/${id}`, {
            method: 'DELETE'
        });
    },

    // KPIs CRUD
    async createKPI(data) {
        return await this.fetch('/kpis', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    },

    async updateKPI(id, data) {
        return await this.fetch(`/kpis/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    },

    async deleteKPI(id) {
        return await this.fetch(`/kpis/${id}`, {
            method: 'DELETE'
        });
    },

    // Chart Data CRUD
    async createChartData(data) {
        return await this.fetch('/chart_data', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    },

    async updateChartData(id, data) {
        return await this.fetch(`/chart_data/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    },

    async deleteChartData(id) {
        return await this.fetch(`/chart_data/${id}`, {
            method: 'DELETE'
        });
    },

    // Notes CRUD
    async createNote(data) {
        return await this.fetch('/notes', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    },

    async updateNote(id, data) {
        return await this.fetch(`/notes/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    },

    async deleteNote(id) {
        return await this.fetch(`/notes/${id}`, {
            method: 'DELETE'
        });
    }
};

// ===== DATA STORE =====
const AppData = {
    automations: [],
    sectors: [],
    chartData: {},
    timeline: [],
    kpis: {}
};

// ===== LOAD DATA =====
async function loadAppData() {
    try {
        const [automations, sectors, timeline, kpis, chartData] = await Promise.all([
            ApiClient.getAutomations(),
            ApiClient.getSectors(),
            ApiClient.getTimeline(),
            ApiClient.getKPIs(),
            ApiClient.getChartData()
        ]);

        if (automations) AppData.automations = automations;
        if (sectors) AppData.sectors = sectors;
        if (timeline) AppData.timeline = timeline;
        if (kpis) AppData.kpis = kpis;
        if (chartData) AppData.chartData = chartData;

        return true;
    } catch (error) {
        console.error('Error loading app data:', error);
        return false;
    }
}

// ===== EXPORT TO GLOBAL SCOPE =====
// Expose ApiClient and AppData to global scope
window.ApiClient = ApiClient;
window.AppData = AppData;
window.loadAppData = loadAppData;
