// ─────────────────────────────────────────────
//  myFisio — Camada de API
//  Inclua este arquivo em todas as páginas HTML:
//  <script src="../shared/api.js"></script>
// ─────────────────────────────────────────────

const API_URL = 'https://myfisio-api.onrender.com'; // ← substitua pela URL real do Render

const Api = (() => {
  // ── Token ──────────────────────────────────
  function getToken()       { return localStorage.getItem('myfisio_token'); }
  function setToken(t)      { localStorage.setItem('myfisio_token', t); }
  function clearToken()     { localStorage.removeItem('myfisio_token'); localStorage.removeItem('myfisio_user'); }
  function getUser()        { return JSON.parse(localStorage.getItem('myfisio_user') || 'null'); }
  function setUser(u)       { localStorage.setItem('myfisio_user', JSON.stringify(u)); }
  function isLoggedIn()     { return !!getToken(); }
  function isPro()          { return getUser()?.role === 'professional'; }

  // ── Fetch base ─────────────────────────────
  async function request(method, path, body = null, auth = true) {
    const headers = { 'Content-Type': 'application/json' };
    if (auth) {
      const token = getToken();
      if (!token) { redirectToLogin(); return null; }
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const res = await fetch(`${API_URL}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });

      if (res.status === 401) { clearToken(); redirectToLogin(); return null; }

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Erro ${res.status}`);
      return data;
    } catch (err) {
      console.error(`[API ${method} ${path}]`, err.message);
      throw err;
    }
  }

  function redirectToLogin() {
    if (!window.location.pathname.includes('/auth/')) {
      window.location.href = '/frontend/auth/index.html';
    }
  }

  // ── AUTH ───────────────────────────────────
  async function register(payload) {
    const data = await request('POST', '/api/auth/register', payload, false);
    if (data?.token) { setToken(data.token); setUser(data.user); }
    return data;
  }

  async function login(email, password) {
    const data = await request('POST', '/api/auth/login', { email, password }, false);
    if (data?.token) { setToken(data.token); setUser(data.user); }
    return data;
  }

  async function logout() {
    clearToken();
    window.location.href = '/frontend/auth/index.html';
  }

  async function me() {
    const data = await request('GET', '/api/auth/me');
    if (data) setUser(data);
    return data;
  }

  async function changePassword(current_password, new_password) {
    return request('PUT', '/api/auth/password', { current_password, new_password });
  }

  // ── PROFESSIONALS ──────────────────────────
  async function getProfessionals(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return request('GET', `/api/professionals?${qs}`);
  }

  async function getProfessional(id) {
    return request('GET', `/api/professionals/${id}`);
  }

  async function updateProfessionalProfile(payload) {
    return request('PUT', '/api/professionals/profile', payload);
  }

  async function setOnlineStatus(is_online, latitude = null, longitude = null) {
    return request('PATCH', '/api/professionals/online', { is_online, latitude, longitude });
  }

  // ── GEOLOCALIZAÇÃO ─────────────────────────
  function getPosition() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocalização não suportada neste navegador.'));
      } else {
        navigator.geolocation.getCurrentPosition(
          pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
          err => reject(err),
          { timeout: 8000, maximumAge: 60000 }
        );
      }
    });
  }

  async function getNearbyProfessionals(specialty = null, service_type = null) {
    try {
      const { lat, lng } = await getPosition();
      return getProfessionals({ lat, lng, radius: 10, specialty, service_type });
    } catch {
      // Fallback sem localização
      return getProfessionals({ specialty, service_type });
    }
  }

  // ── APPOINTMENTS ───────────────────────────
  async function createAppointment(payload) {
    return request('POST', '/api/appointments', payload);
  }

  async function getAppointments(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return request('GET', `/api/appointments?${qs}`);
  }

  async function updateAppointmentStatus(id, status) {
    return request('PATCH', `/api/appointments/${id}/status`, { status });
  }

  async function submitReview(appointmentId, rating, comment = '') {
    return request('POST', `/api/appointments/${appointmentId}/review`, { rating, comment });
  }

  // ── EARNINGS ───────────────────────────────
  async function getEarnings(month = null, year = null) {
    const params = {};
    if (month) params.month = month;
    if (year)  params.year  = year;
    return request('GET', `/api/earnings?${new URLSearchParams(params)}`);
  }

  async function getEarningSessions(params = {}) {
    return request('GET', `/api/earnings/sessions?${new URLSearchParams(params)}`);
  }

  // ── PATIENTS ───────────────────────────────
  async function getPatientProfile() {
    return request('GET', '/api/patients/profile');
  }

  async function updatePatientProfile(payload) {
    return request('PUT', '/api/patients/profile', payload);
  }

  async function getPatientStats() {
    return request('GET', '/api/patients/stats');
  }

  // ── HELPERS de UI ──────────────────────────
  function formatCurrency(value) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
  }

  function formatDate(iso) {
    return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function formatTime(iso) {
    return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  // ── GUARD: redireciona se não logado ───────
  function requireAuth(role = null) {
    if (!isLoggedIn()) { redirectToLogin(); return false; }
    if (role && getUser()?.role !== role) {
      alert('Acesso não permitido para este tipo de conta.');
      redirectToLogin();
      return false;
    }
    return true;
  }

  return {
    // auth
    register, login, logout, me, changePassword,
    // professionals
    getProfessionals, getProfessional, updateProfessionalProfile, setOnlineStatus,
    // geolocation
    getPosition, getNearbyProfessionals,
    // appointments
    createAppointment, getAppointments, updateAppointmentStatus, submitReview,
    // earnings
    getEarnings, getEarningSessions,
    // patients
    getPatientProfile, updatePatientProfile, getPatientStats,
    // utils
    getToken, getUser, isLoggedIn, isPro, requireAuth,
    formatCurrency, formatDate, formatTime,
  };
})();

window.Api = Api;
