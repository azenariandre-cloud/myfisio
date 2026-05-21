/**
 * Cliente API para comunicação com o backend myFisio
 */

class MyFisioAPI {
  constructor() {
    this.baseURL = process.env.REACT_APP_API_URL || 'http://localhost:3000/api';
    this.token = localStorage.getItem('authToken');
  }

  async request(endpoint, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    try {
      const response = await fetch(`${this.baseURL}${endpoint}`, {
        ...options,
        headers,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || `HTTP ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('API Error:', error);
      throw error;
    }
  }

  // Auth
  auth = {
    register: (data) => this.request('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
    login: (email, password) => this.request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
    logout: () => {
      localStorage.removeItem('authToken');
      this.token = null;
    },
  };

  // Professionals
  professionals = {
    list: () => this.request('/professionals'),
    get: (id) => this.request(`/professionals/${id}`),
    search: (query) => this.request(`/professionals/search?q=${query}`),
    searchBySpecialty: (specialty) => this.request(`/professionals/search?specialty=${specialty}`),
    update: (id, data) => this.request(`/professionals/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    getNearby: (lat, lng, radius = 5) => this.request(`/professionals/nearby?lat=${lat}&lng=${lng}&radius=${radius}`),
  };

  // Appointments
  appointments = {
    create: (data) => this.request('/appointments', { method: 'POST', body: JSON.stringify(data) }),
    list: () => this.request('/appointments'),
    get: (id) => this.request(`/appointments/${id}`),
    update: (id, data) => this.request(`/appointments/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    cancel: (id) => this.request(`/appointments/${id}`, { method: 'DELETE' }),
    getByProfessional: () => this.request('/appointments/professional/list'),
  };

  // Earnings
  earnings = {
    getMonth: (month) => this.request(`/earnings/month/${month}`),
    getHistory: () => this.request('/earnings/history'),
    getSessions: () => this.request('/earnings/sessions'),
    getBySession: (sessionId) => this.request(`/earnings/session/${sessionId}`),
  };

  // Reviews
  reviews = {
    create: (appointmentId, rating, comment) =>
      this.request('/reviews', {
        method: 'POST',
        body: JSON.stringify({ appointmentId, rating, comment }),
      }),
    getForProfessional: (professionalId) => this.request(`/reviews/professional/${professionalId}`),
  };
}

const api = new MyFisioAPI();
