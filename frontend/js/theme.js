// Theme switcher for blog
const themeToggle = document.getElementById('theme-toggle');
const mobileThemeToggle = document.getElementById('mobile-theme-toggle');

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

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  setTheme(current === 'dark' ? 'light' : 'dark');
}

if (themeToggle) {
  themeToggle.onclick = toggleTheme;
}

if (mobileThemeToggle) {
  mobileThemeToggle.onclick = toggleTheme;
}

function updateThemeLabel() {
  const label = document.getElementById('theme-label');
  const mobileSwitch = document.getElementById('mobile-theme-toggle');
  const mode = document.documentElement.getAttribute('data-theme') || 'light';

  if (label) {
    label.textContent = mode === 'dark' ? 'Dark' : 'Light';
  }

  if (mobileSwitch) {
    mobileSwitch.setAttribute('aria-label', mode === 'dark' ? 'Theme: Dark' : 'Theme: Light');
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

function initializeMobileSidebar() {
  const sidebar = document.getElementById('mobile-sidebar');
  const backdrop = document.getElementById('mobile-sidebar-backdrop');
  const openButton = document.getElementById('mobile-menu-toggle');
  const closeButton = document.getElementById('mobile-sidebar-close');
  if (!sidebar || !backdrop || !openButton || !closeButton) return;
  if (openButton.dataset.sidebarBound === 'true') return;
  openButton.dataset.sidebarBound = 'true';

  const mobileQuery = window.matchMedia('(max-width: 768px)');

  const closeSidebar = () => {
    sidebar.classList.remove('is-open');
    backdrop.classList.remove('is-open');
    backdrop.hidden = true;
    openButton.setAttribute('aria-expanded', 'false');
    sidebar.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  };

  const openSidebar = () => {
    if (!mobileQuery.matches) return;
    sidebar.classList.add('is-open');
    backdrop.hidden = false;
    backdrop.classList.add('is-open');
    openButton.setAttribute('aria-expanded', 'true');
    sidebar.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  };

  openButton.addEventListener('click', () => {
    if (sidebar.classList.contains('is-open')) {
      closeSidebar();
    } else {
      openSidebar();
    }
  });

  closeButton.addEventListener('click', closeSidebar);
  backdrop.addEventListener('click', closeSidebar);
  sidebar.querySelectorAll('a').forEach(link => link.addEventListener('click', closeSidebar));
  mobileQuery.addEventListener('change', closeSidebar);

  closeSidebar();
}

updateAuthLinks();
updateStaffLinks();
updateGuestLinks();
initializeMobileSidebar();
