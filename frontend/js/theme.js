// Theme switcher for blog
const themeToggle = document.getElementById('theme-toggle');

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
