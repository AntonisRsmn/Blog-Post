// Theme switcher for blog
const themeToggle = document.getElementById('theme-toggle');

function logout() {
  document.cookie = 'token=; Max-Age=0; path=/';
  window.location.href = '/admin/login.html';
}

window.logout = logout;

function setTheme(mode) {
  if (mode === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    document.documentElement.setAttribute('data-theme', 'light');
  }
  localStorage.setItem('theme', mode);
  updateThemeLabel();
}

themeToggle.onclick = function() {
  const current = document.documentElement.getAttribute('data-theme');
  setTheme(current === 'dark' ? 'light' : 'dark');
};

function updateThemeLabel() {
  const label = document.getElementById('theme-label');
  if (label) {
    const mode = document.documentElement.getAttribute('data-theme') || 'light';
    label.textContent = mode === 'dark' ? 'Dark' : 'Light';
  }
}

// On load
const saved = localStorage.getItem('theme');
setTheme(saved || 'light');

let cachedProfile;

async function getProfile() {
  if (cachedProfile !== undefined) return cachedProfile;
  const res = await fetch('/api/auth/profile');
  if (!res.ok) {
    cachedProfile = null;
    return null;
  }
  cachedProfile = await res.json();
  return cachedProfile;
}

async function updateAuthLinks() {
  const authLinks = document.querySelectorAll('[data-auth-link]');
  if (!authLinks.length) return;

  const profile = await getProfile();
  authLinks.forEach(link => {
    if (profile) {
      link.textContent = 'Profile';
      link.href = '/admin/profile.html';
    } else {
      link.textContent = 'Login';
      link.href = '/admin/login.html';
    }
  });
}

async function updateStaffLinks() {
  const staffLinks = document.querySelectorAll('[data-staff-only]');
  if (!staffLinks.length) return;

  const profile = await getProfile();
  staffLinks.forEach(link => {
    if (profile && profile.role === 'staff') {
      link.style.display = '';
    } else {
      link.style.display = 'none';
    }
  });
}

async function updateGuestLinks() {
  const guestLinks = document.querySelectorAll('[data-guest-only]');
  if (!guestLinks.length) return;

  const profile = await getProfile();
  guestLinks.forEach(link => {
    if (profile) {
      link.style.display = 'none';
    } else {
      link.style.display = '';
    }
  });
}

updateAuthLinks();
updateStaffLinks();
updateGuestLinks();
