// Theme switcher for blog
const themeToggle = document.getElementById('theme-toggle');
const mobileThemeToggle = document.getElementById('mobile-theme-toggle');
const COOKIE_PREFERENCES_KEY = 'cookie-preferences-v1';
const DEFAULT_COOKIE_PREFERENCES = {
  essential: true,
  analytics: false,
  ads: false
};

function logout() {
  document.cookie = 'token=; Max-Age=0; path=/';
  window.location.href = '/admin/login.html';
}

window.logout = logout;
let todayEventsRotationTimer = null;
const TODAY_EVENTS_ROTATION_MS = 5000;

function normalizeCookiePreferences(value) {
  const input = value && typeof value === 'object' ? value : {};
  return {
    consentSet: Boolean(input.consentSet || input.updatedAt),
    essential: true,
    analytics: Boolean(input.analytics),
    ads: Boolean(input.ads)
  };
}

function readStoredCookiePreferences() {
  try {
    const raw = localStorage.getItem(COOKIE_PREFERENCES_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return normalizeCookiePreferences(parsed);
  } catch {
    return null;
  }
}

function saveCookiePreferences(preferences) {
  const normalized = normalizeCookiePreferences(preferences);
  try {
    localStorage.setItem(COOKIE_PREFERENCES_KEY, JSON.stringify({
      ...normalized,
      consentSet: true,
      updatedAt: new Date().toISOString()
    }));
  } catch {
  }

  window.dispatchEvent(new CustomEvent('cookiePreferencesChanged', {
    detail: normalized
  }));

  return normalized;
}

window.getCookiePreferences = function getCookiePreferencesPublic() {
  return readStoredCookiePreferences() || { ...DEFAULT_COOKIE_PREFERENCES };
};

function ensureCookieSettingsButton() {
  let link = document.getElementById('cookie-settings-link');
  if (link) return link;

  const footerNav = document.querySelector('.footer-nav');
  if (!footerNav) return null;

  link = document.createElement('a');
  link.id = 'cookie-settings-link';
  link.href = '#';
  link.textContent = 'Cookie settings';

  const termsLink = footerNav.querySelector('a[href="/tos.html"]');
  const privacyLink = footerNav.querySelector('a[href="/privacy.html"]');

  if (termsLink && privacyLink && termsLink.nextSibling === privacyLink) {
    footerNav.insertBefore(link, privacyLink);
  } else if (termsLink?.nextSibling) {
    footerNav.insertBefore(link, termsLink.nextSibling);
  } else if (privacyLink) {
    footerNav.insertBefore(link, privacyLink);
  } else {
    footerNav.appendChild(link);
  }

  return link;
}

function ensureCookieBanner() {
  let banner = document.getElementById('cookie-consent-banner');
  if (banner) return banner;

  banner = document.createElement('section');
  banner.id = 'cookie-consent-banner';
  banner.className = 'cookie-consent-banner';
  banner.hidden = true;
  banner.innerHTML = `
    <div class="cookie-consent-mini" role="dialog" aria-live="polite" aria-label="Cookie consent">
      <p>We use cookies for core functionality, analytics, and ads.</p>
      <div class="cookie-consent-mini-actions">
        <button type="button" id="cookie-consent-accept-all">Accept cookies</button>
        <button type="button" id="cookie-consent-open-manage" class="secondary">Manage preferences</button>
      </div>
    </div>
  `;

  document.body.appendChild(banner);
  return banner;
}

function ensureCookieManageModal() {
  let overlay = document.getElementById('cookie-manage-overlay');
  if (overlay) return overlay;

  overlay = document.createElement('section');
  overlay.id = 'cookie-manage-overlay';
  overlay.className = 'cookie-manage-overlay';
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="cookie-manage-card" role="dialog" aria-modal="true" aria-labelledby="cookie-manage-title">
      <div class="cookie-manage-head">
        <h3 id="cookie-manage-title">Manage cookie preferences</h3>
        <button type="button" id="cookie-manage-close" class="secondary" aria-label="Close">Close</button>
      </div>
      <p>Choose what you allow. Essential cookies are always enabled.</p>

      <div class="cookie-consent-grid">
        <label class="cookie-consent-item">
          <input type="checkbox" checked disabled>
          <span><strong>Essential</strong><small>Always on</small></span>
        </label>
        <label class="cookie-consent-item">
          <input type="checkbox" id="cookie-manage-analytics">
          <span><strong>Analytics</strong><small>Helps us measure page performance</small></span>
        </label>
        <label class="cookie-consent-item">
          <input type="checkbox" id="cookie-manage-ads">
          <span><strong>Ads</strong><small>Allows personalized ad serving</small></span>
        </label>
      </div>

      <div class="cookie-consent-actions">
        <button type="button" id="cookie-manage-essential" class="secondary">Essential only</button>
        <button type="button" id="cookie-manage-save">Save preferences</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  return overlay;
}

function applyCookieUiVisibility(hasSavedPreferences) {
  const banner = document.getElementById('cookie-consent-banner');
  const settingsButton = ensureCookieSettingsButton();
  if (banner) banner.hidden = Boolean(hasSavedPreferences);
  if (settingsButton) settingsButton.hidden = false;
}

function openCookiePreferences() {
  const overlay = ensureCookieManageModal();
  const current = readStoredCookiePreferences() || DEFAULT_COOKIE_PREFERENCES;

  const analyticsInput = overlay.querySelector('#cookie-manage-analytics');
  const adsInput = overlay.querySelector('#cookie-manage-ads');
  if (analyticsInput) analyticsInput.checked = Boolean(current.analytics);
  if (adsInput) adsInput.checked = Boolean(current.ads);

  overlay.hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeCookiePreferences() {
  const overlay = document.getElementById('cookie-manage-overlay');
  if (!overlay) return;
  overlay.hidden = true;
  document.body.style.overflow = '';
}

window.openCookiePreferences = openCookiePreferences;

function initializeCookiePreferences() {
  const banner = ensureCookieBanner();
  const modal = ensureCookieManageModal();
  const settingsButton = ensureCookieSettingsButton();
  const saved = readStoredCookiePreferences();
  const hasConsent = Boolean(saved?.consentSet);

  applyCookieUiVisibility(hasConsent);

  if (saved?.consentSet && !saved.analytics) {
    if (settingsButton) settingsButton.title = 'Analytics tracking is currently off';
  } else {
    if (settingsButton) settingsButton.title = '';
  }

  settingsButton?.addEventListener('click', event => {
    event.preventDefault();
    openCookiePreferences();
  });

  const acceptAllButton = banner.querySelector('#cookie-consent-accept-all');
  const openManageButton = banner.querySelector('#cookie-consent-open-manage');
  const analyticsInput = modal.querySelector('#cookie-manage-analytics');
  const adsInput = modal.querySelector('#cookie-manage-ads');
  const essentialOnlyButton = modal.querySelector('#cookie-manage-essential');
  const saveButton = modal.querySelector('#cookie-manage-save');
  const closeButton = modal.querySelector('#cookie-manage-close');

  acceptAllButton?.addEventListener('click', () => {
    saveCookiePreferences({ essential: true, analytics: true, ads: true });
    if (settingsButton) settingsButton.title = '';
    banner.hidden = true;
  });

  openManageButton?.addEventListener('click', openCookiePreferences);

  essentialOnlyButton?.addEventListener('click', () => {
    saveCookiePreferences({ essential: true, analytics: false, ads: false });
    if (settingsButton) settingsButton.title = 'Analytics tracking is currently off';
    banner.hidden = true;
    closeCookiePreferences();
  });

  saveButton?.addEventListener('click', () => {
    saveCookiePreferences({
      essential: true,
      analytics: Boolean(analyticsInput?.checked),
      ads: Boolean(adsInput?.checked)
    });
    if (settingsButton) {
      settingsButton.title = analyticsInput?.checked ? '' : 'Analytics tracking is currently off';
    }
    banner.hidden = true;
    closeCookiePreferences();
  });

  closeButton?.addEventListener('click', closeCookiePreferences);
  modal.addEventListener('click', event => {
    if (event.target === modal) {
      closeCookiePreferences();
    }
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !modal.hidden) {
      closeCookiePreferences();
    }
  });
}

function ensureDeleteConfirmModal() {
  let overlay = document.getElementById('app-delete-confirm-overlay');
  if (overlay) return overlay;

  overlay = document.createElement('div');
  overlay.id = 'app-delete-confirm-overlay';
  overlay.className = 'app-delete-confirm-overlay';
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="app-delete-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="app-delete-confirm-title">
      <h3 id="app-delete-confirm-title" class="app-delete-confirm-title">Confirm deletion</h3>
      <p id="app-delete-confirm-message" class="app-delete-confirm-message">Are you sure you want to delete this?</p>
      <div class="app-delete-confirm-actions">
        <button type="button" id="app-delete-confirm-accept" class="danger">Delete</button>
        <button type="button" id="app-delete-confirm-cancel" class="secondary">Cancel</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  return overlay;
}

window.showAppConfirm = function showAppConfirm(message = 'Are you sure?', options = {}) {
  const overlay = ensureDeleteConfirmModal();
  const titleEl = overlay.querySelector('#app-delete-confirm-title');
  const messageEl = overlay.querySelector('#app-delete-confirm-message');
  const acceptButton = overlay.querySelector('#app-delete-confirm-accept');
  const cancelButton = overlay.querySelector('#app-delete-confirm-cancel');

  if (!titleEl || !messageEl || !acceptButton || !cancelButton) {
    return Promise.resolve(window.confirm(message));
  }

  const {
    title = 'Please confirm',
    confirmText = 'OK',
    cancelText = 'Cancel',
    confirmClass = ''
  } = options || {};

  titleEl.textContent = title;
  messageEl.textContent = message;
  acceptButton.textContent = confirmText;
  cancelButton.textContent = cancelText;
  acceptButton.className = confirmClass ? String(confirmClass) : '';

  return new Promise(resolve => {
    const previousOverflow = document.body.style.overflow;

    const cleanup = (result) => {
      overlay.hidden = true;
      document.body.style.overflow = previousOverflow;
      overlay.removeEventListener('click', handleOverlayClick);
      document.removeEventListener('keydown', handleKeyDown);
      acceptButton.removeEventListener('click', onAccept);
      cancelButton.removeEventListener('click', onCancel);
      resolve(result);
    };

    const onAccept = () => cleanup(true);
    const onCancel = () => cleanup(false);

    const handleOverlayClick = (event) => {
      if (event.target === overlay) {
        cleanup(false);
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        cleanup(false);
      }
    };

    overlay.hidden = false;
    document.body.style.overflow = 'hidden';
    acceptButton.focus();

    overlay.addEventListener('click', handleOverlayClick);
    document.addEventListener('keydown', handleKeyDown);
    acceptButton.addEventListener('click', onAccept);
    cancelButton.addEventListener('click', onCancel);
  });
};

window.showDeleteConfirm = function showDeleteConfirm(message = 'Are you sure you want to delete this?') {
  return window.showAppConfirm(message, {
    title: 'Confirm deletion',
    confirmText: 'Delete',
    cancelText: 'Cancel',
    confirmClass: 'danger'
  });
};

function clearTodayEventsRotationTimer() {
  if (!todayEventsRotationTimer) return;
  clearInterval(todayEventsRotationTimer);
  todayEventsRotationTimer = null;
}

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
let profileRequestPromise = null;

async function getProfile() {
  if (cachedProfile !== undefined) return cachedProfile;

  if (!profileRequestPromise) {
    profileRequestPromise = fetch('/api/auth/profile')
      .then(async (res) => {
        if (!res.ok) {
          cachedProfile = null;
          return null;
        }

        cachedProfile = await res.json();
        return cachedProfile;
      })
      .catch(() => {
        cachedProfile = null;
        return null;
      })
      .finally(() => {
        profileRequestPromise = null;
      });
  }

  return profileRequestPromise;
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

  staffLinks.forEach(link => {
    link.hidden = true;
  });

  const profile = await getProfile();
  staffLinks.forEach(link => {
    const href = String(link.getAttribute('href') || '');
    const isStaffManagementLink = href.includes('/admin/staff.html');
    const isAdminOrStaff = profile && (profile.role === 'admin' || profile.role === 'staff');
    const isAdmin = profile && profile.role === 'admin';

    if (isStaffManagementLink) {
      link.hidden = !isAdmin;
      return;
    }

    link.hidden = !isAdminOrStaff;
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

function toDateKey(dateValue) {
  const year = dateValue.getFullYear();
  const month = String(dateValue.getMonth() + 1).padStart(2, '0');
  const day = String(dateValue.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDateKey(dateKey) {
  const text = String(dateKey || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const [yearRaw, monthRaw, dayRaw] = text.split('-');
  const year = Number(yearRaw);
  const monthIndex = Number(monthRaw) - 1;
  const day = Number(dayRaw);
  const parsed = new Date(year, monthIndex, day);
  if (Number.isNaN(parsed.getTime())) return null;
  if (parsed.getFullYear() !== year || parsed.getMonth() !== monthIndex || parsed.getDate() !== day) return null;
  return parsed;
}

function createTodayEventsBanner() {
  const banner = document.createElement('section');
  banner.id = 'today-events-banner';
  banner.className = 'today-events-banner';
  banner.setAttribute('aria-live', 'polite');
  banner.hidden = true;
  banner.innerHTML = `
    <div class="today-events-banner-inner">
      <span class="today-events-label">Today</span>
      <div class="today-events-content" id="today-events-content"></div>
    </div>
  `;
  return banner;
}

function createEventLink(eventItem) {
  const slug = String(eventItem?.slug || '').trim();
  if (!slug) return null;
  const anchor = document.createElement('a');
  anchor.className = 'today-events-item';
  anchor.href = `/post.html?slug=${encodeURIComponent(slug)}`;
  anchor.textContent = String(eventItem?.title || 'Untitled event');
  return anchor;
}

function createEventChip(eventItem) {
  const type = String(eventItem?.type || '').trim();
  const chip = document.createElement('span');
  chip.className = 'today-events-chip';
  chip.textContent = type || 'Event';
  return chip;
}

function formatEventDateText(dateKey) {
  const parsed = parseDateKey(dateKey);
  if (!parsed) return '';
  return parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

function updateReleaseCalendarTopOffset() {
  const calendar = document.getElementById('release-calendar');
  if (!calendar) return;

  const header = document.querySelector('body > header');
  const banner = document.getElementById('today-events-banner');

  let topOffset = 96;

  if (header) {
    const headerRect = header.getBoundingClientRect();
    topOffset = Math.max(topOffset, Math.round(headerRect.bottom + 6));
  }

  if (banner && !banner.hidden) {
    const bannerRect = banner.getBoundingClientRect();
    if (bannerRect.bottom > 0) {
      topOffset = Math.max(topOffset, Math.round(bannerRect.bottom + 6));
    }
  }

  const nextValue = `${topOffset}px`;
  if (document.documentElement.style.getPropertyValue('--release-calendar-top') !== nextValue) {
    document.documentElement.style.setProperty('--release-calendar-top', nextValue);
  }
}

let releaseCalendarTopOffsetFrame = null;
function scheduleReleaseCalendarTopOffsetUpdate() {
  if (releaseCalendarTopOffsetFrame !== null) return;
  releaseCalendarTopOffsetFrame = requestAnimationFrame(() => {
    releaseCalendarTopOffsetFrame = null;
    updateReleaseCalendarTopOffset();
  });
}

function renderTodayEventsBanner(events) {
  const header = document.querySelector('body > header');
  if (!header) return;

  clearTodayEventsRotationTimer();

  let banner = document.getElementById('today-events-banner');
  if (!banner) {
    banner = createTodayEventsBanner();
    header.insertAdjacentElement('afterend', banner);
  }

  const content = banner.querySelector('#today-events-content');
  const bannerLabel = banner.querySelector('.today-events-label');
  if (!content) return;

  const list = Array.isArray(events) ? events : [];
  const now = new Date();
  const todayKey = toDateKey(now);
  const todayDate = parseDateKey(todayKey);

  const normalized = list
    .map(item => ({
      title: String(item?.title || '').trim(),
      slug: String(item?.slug || '').trim(),
      type: String(item?.type || '').trim(),
      date: String(item?.date || '').trim()
    }))
    .filter(item => item.title && item.date)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));

  const todaysEvents = normalized.filter(item => item.date === todayKey);
  const nextEvent = normalized.find(item => {
    const parsed = parseDateKey(item.date);
    return parsed && todayDate && parsed > todayDate;
  });

  content.innerHTML = '';

  if (todaysEvents.length) {
    if (bannerLabel) bannerLabel.textContent = 'Today';
    const intro = document.createElement('span');
    intro.className = 'today-events-intro';
    intro.textContent = `${todaysEvents.length} upcoming ${todaysEvents.length === 1 ? 'event' : 'events'}:`;
    content.appendChild(intro);

    const eventWrap = document.createElement('span');
    eventWrap.className = 'today-events-entry';
    content.appendChild(eventWrap);

    const dateHint = document.createElement('span');
    dateHint.className = 'today-events-date';
    content.appendChild(dateHint);

    const setActiveEvent = (eventItem) => {
      eventWrap.innerHTML = '';
      const eventLink = createEventLink(eventItem);

      if (eventLink) {
        eventWrap.appendChild(eventLink);
      } else {
        const label = document.createElement('span');
        label.className = 'today-events-item';
        label.textContent = eventItem.title;
        eventWrap.appendChild(label);
      }

      eventWrap.appendChild(createEventChip(eventItem));

      const formattedDate = formatEventDateText(eventItem.date);
      dateHint.textContent = formattedDate;
      dateHint.hidden = !formattedDate;
    };

    let activeEventIndex = 0;
    setActiveEvent(todaysEvents[activeEventIndex]);

    if (todaysEvents.length > 1) {
      todayEventsRotationTimer = setInterval(() => {
        const isConnected = document.body.contains(eventWrap);
        if (!isConnected) {
          clearTodayEventsRotationTimer();
          return;
        }

        activeEventIndex = (activeEventIndex + 1) % todaysEvents.length;
        setActiveEvent(todaysEvents[activeEventIndex]);
      }, TODAY_EVENTS_ROTATION_MS);
    }

    banner.hidden = false;
    scheduleReleaseCalendarTopOffsetUpdate();
    return;
  }

  if (nextEvent) {
    if (bannerLabel) bannerLabel.textContent = 'Upcoming';
    const intro = document.createElement('span');
    intro.className = 'today-events-intro';
    intro.textContent = 'Upcoming event:';
    content.appendChild(intro);

    const nextWrap = document.createElement('span');
    nextWrap.className = 'today-events-entry';
    const link = createEventLink(nextEvent);
    if (link) {
      nextWrap.appendChild(link);
    } else {
      const text = document.createElement('span');
      text.className = 'today-events-item';
      text.textContent = nextEvent.title;
      nextWrap.appendChild(text);
    }
    nextWrap.appendChild(createEventChip(nextEvent));
    content.appendChild(nextWrap);

    const formattedNextDate = formatEventDateText(nextEvent.date);
    if (formattedNextDate) {
      const dateHint = document.createElement('span');
      dateHint.className = 'today-events-date';
      dateHint.textContent = formattedNextDate;
      content.appendChild(dateHint);
    }

    banner.hidden = false;
    scheduleReleaseCalendarTopOffsetUpdate();
    return;
  }

  if (bannerLabel) bannerLabel.textContent = 'Upcoming';
  const intro = document.createElement('span');
  intro.className = 'today-events-intro';
  intro.textContent = 'No upcoming events right now.';
  content.appendChild(intro);

  banner.hidden = false;
  scheduleReleaseCalendarTopOffsetUpdate();
}

async function initializeTodayEventsBanner() {
  const pathname = String(window.location.pathname || '/');
  const isHomePage = pathname === '/' || pathname === '/index.html';
  const isAuthorPage = pathname === '/author.html';
  if (!isHomePage && !isAuthorPage) return;

  const header = document.querySelector('body > header');
  if (!header) return;

  try {
    const response = await fetch('/api/releases');
    if (!response.ok) return;
    const payload = await response.json();
    renderTodayEventsBanner(payload);
  } catch {
    scheduleReleaseCalendarTopOffsetUpdate();
  }

  window.addEventListener('resize', scheduleReleaseCalendarTopOffsetUpdate);
  window.addEventListener('scroll', scheduleReleaseCalendarTopOffsetUpdate, { passive: true });
}

function ensureFooterNewsletterBlock() {
  const footer = document.querySelector('.site-footer');
  if (!footer) return null;

  const center = footer.querySelector('.footer-center');
  if (!center) return null;

  let newsletter = center.querySelector('.footer-newsletter');
  if (newsletter) return newsletter;

  newsletter = document.createElement('div');
  newsletter.className = 'footer-newsletter';
  newsletter.innerHTML = `
    <p class="newsletter-title">Subscribe to our Newsletters</p>
    <form id="newsletter-form" class="newsletter-form" aria-label="Newsletter subscription">
      <input id="newsletter-email" type="email" placeholder="Subscribe to our Newsletters" autocomplete="email" required />
      <button type="submit">Subscribe</button>
    </form>
    <div id="newsletter-status" class="newsletter-status" aria-live="polite"></div>
  `;

  center.insertBefore(newsletter, center.firstChild);
  return newsletter;
}

function initializeGlobalNewsletterCapture() {
  ensureFooterNewsletterBlock();

  const form = document.getElementById('newsletter-form');
  const emailInput = document.getElementById('newsletter-email');
  const statusEl = document.getElementById('newsletter-status');
  if (!form || !emailInput || !statusEl) return;
  if (form.dataset.bound === '1') return;
  form.dataset.bound = '1';
  let statusHideTimer = null;

  function setNewsletterStatus(message, type = '') {
    if (statusHideTimer) {
      clearTimeout(statusHideTimer);
      statusHideTimer = null;
    }

    statusEl.textContent = String(message || '');
    statusEl.classList.remove('is-error', 'is-success');
    if (type) statusEl.classList.add(type);

    if (!message) return;
    statusHideTimer = setTimeout(() => {
      statusEl.textContent = '';
      statusEl.classList.remove('is-error', 'is-success');
      statusHideTimer = null;
    }, 5000);
  }

  function getNewsletterContext() {
    const pathname = String(window.location.pathname || '/');
    const isHome = pathname === '/' || pathname === '/index.html';
    const isPost = pathname === '/post.html';
    const isAuthor = pathname === '/author.html';

    let source = 'footer-global';
    if (isHome) source = 'homepage-footer';
    else if (isPost) source = 'post-footer';
    else if (isAuthor) source = 'author-footer';
    else if (pathname.startsWith('/admin/')) source = 'admin-footer';
    else source = 'page-footer';

    let postId = '';
    let postSlug = '';
    let postTitle = '';

    if (isPost) {
      const params = new URLSearchParams(window.location.search || '');
      postId = String(params.get('id') || '').trim();
      postSlug = String(params.get('slug') || '').trim();
      postTitle = String(document.querySelector('#post h1')?.textContent || '').trim();
    }

    return {
      source,
      sourcePath: pathname,
      postId,
      postSlug,
      postTitle
    };
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = String(emailInput.value || '').trim();
    if (!email) return;

    setNewsletterStatus('Subscribing...');

    const context = getNewsletterContext();

    try {
      const response = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          source: context.source,
          sourcePath: context.sourcePath,
          postId: context.postId,
          postSlug: context.postSlug,
          postTitle: context.postTitle,
          locale: document.documentElement?.lang || navigator.language || ''
        })
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        setNewsletterStatus(payload?.error || 'Could not subscribe right now.', 'is-error');
        return;
      }

      const payload = await response.json().catch(() => ({}));

      if (payload?.alreadySubscribed) {
        setNewsletterStatus('You are already subscribed.', 'is-success');
        return;
      }

      setNewsletterStatus('Thanks! You are subscribed.', 'is-success');
      emailInput.value = '';
    } catch {
      setNewsletterStatus('Could not subscribe right now.', 'is-error');
    }
  });
}

updateAuthLinks();
updateStaffLinks();
updateGuestLinks();
initializeMobileSidebar();
initializeTodayEventsBanner();
scheduleReleaseCalendarTopOffsetUpdate();
initializeCookiePreferences();
initializeGlobalNewsletterCapture();
