// Search state
let allPosts = [];
let releaseEvents = [];
let calendarViewDate = new Date();
const selectedCategoryFilters = new Set();
const POSTS_PAGE_SIZE = 7;
let latestVisibleCount = POSTS_PAGE_SIZE;
let searchVisibleCount = POSTS_PAGE_SIZE;
const categoryVisibleCounts = new Map();

async function loadPosts() {
  const container = document.getElementById("home");
  if (!container) return;

  const res = await fetch("/api/posts");
  const posts = await res.json();

  allPosts = posts;
  if (!posts.length) {
    container.className = "home-sections";
    container.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 40px 0;">No articles published yet.</div>';
    return;
  }

  renderFilterSidebar(getAllCategories(allPosts));
  renderHomeSections();
}

function getSortedPosts(posts) {
  return [...posts].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function getPostImageUrl(post) {
  const imageBlock = post.content?.find(block => block.type === "image");
  if (!imageBlock) return null;
  return imageBlock.data?.file?.url || imageBlock.data?.url || imageBlock.data?.file || null;
}

function createPostCard(post) {
  const card = document.createElement("a");
  card.href = `post.html?slug=${post.slug}`;
  card.className = "post-card";

  const imageUrl = getPostImageUrl(post);
  const date = new Date(post.createdAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
  const authorText = post.author ? `By ${post.author} • ` : "";
  const categoryText = Array.isArray(post.categories) && post.categories.length
    ? post.categories.join(" · ")
    : "";

  card.innerHTML = `
    ${imageUrl ? `<img src="${imageUrl}" alt="${post.title}" class="post-card-image">` : '<div class="post-card-image" style="background: var(--bg-secondary);"></div>'}
    <div class="post-card-content">
      <h3 class="post-card-title">${post.title}</h3>
      ${categoryText ? `<div class="post-card-categories">${categoryText}</div>` : ""}
      <p class="post-card-excerpt">${post.excerpt || "Read more..."}</p>
      <span class="post-card-meta">${authorText}${date}</span>
    </div>
  `;

  return card;
}

function ensureCategoryVisibleCount(category) {
  if (!categoryVisibleCounts.has(category)) {
    categoryVisibleCounts.set(category, POSTS_PAGE_SIZE);
  }
  return categoryVisibleCounts.get(category);
}

function createShowMoreButton(onClick) {
  const wrap = document.createElement("div");
  wrap.className = "show-more-wrap";

  const button = document.createElement("button");
  button.type = "button";
  button.className = "show-more-btn";
  button.textContent = "Show more";
  button.addEventListener("click", onClick);

  wrap.appendChild(button);
  return wrap;
}

function createLatestPaginationControls(totalCount) {
  const wrap = document.createElement("div");
  wrap.className = "show-more-wrap";

  if (latestVisibleCount < totalCount) {
    const showMoreButton = document.createElement("button");
    showMoreButton.type = "button";
    showMoreButton.className = "show-more-btn";
    showMoreButton.textContent = "Show more";
    showMoreButton.addEventListener("click", () => {
      latestVisibleCount += POSTS_PAGE_SIZE;
      renderHomeSections();
    });
    wrap.appendChild(showMoreButton);
  }

  if (latestVisibleCount > POSTS_PAGE_SIZE) {
    const showLessButton = document.createElement("button");
    showLessButton.type = "button";
    showLessButton.className = "show-more-btn show-less-btn";
    showLessButton.textContent = "Show less";
    showLessButton.addEventListener("click", () => {
      latestVisibleCount = POSTS_PAGE_SIZE;
      renderHomeSections();
    });
    wrap.appendChild(showLessButton);
  }

  return wrap.childElementCount ? wrap : null;
}

function getAllCategories(posts) {
  const unique = new Set();
  posts.forEach(post => {
    if (!Array.isArray(post.categories)) return;
    post.categories.forEach(category => {
      const value = String(category || "").trim();
      if (value) unique.add(value);
    });
  });
  return [...unique].sort((a, b) => a.localeCompare(b));
}

function postMatchesSelectedCategories(post) {
  if (!selectedCategoryFilters.size) return true;
  const postCategories = Array.isArray(post.categories) ? post.categories : [];
  return postCategories.some(category => selectedCategoryFilters.has(String(category || "").trim()));
}

function getPostsWithActiveFilters(posts) {
  return posts.filter(post => postMatchesSelectedCategories(post));
}

function renderFilterSidebar(categories) {
  const filtersContainer = document.getElementById("category-filters");
  const clearButton = document.getElementById("clear-filters");
  if (!filtersContainer) return;

  filtersContainer.innerHTML = "";

  if (!categories.length) {
    filtersContainer.innerHTML = '<div class="loading">No categories yet.</div>';
  } else {
    categories.forEach(category => {
      const row = document.createElement("label");
      row.className = "category-filter-item";

      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = selectedCategoryFilters.has(category);
      input.addEventListener("change", () => {
        if (input.checked) {
          selectedCategoryFilters.add(category);
        } else {
          selectedCategoryFilters.delete(category);
        }

        latestVisibleCount = POSTS_PAGE_SIZE;
        searchVisibleCount = POSTS_PAGE_SIZE;
        categoryVisibleCounts.clear();

        const searchInput = document.getElementById("search-input");
        const query = normalizeSearchText(searchInput?.value || "");
        if (query) {
          filterPosts(query);
        } else {
          renderHomeSections();
        }
      });

      const text = document.createElement("span");
      text.textContent = category;

      row.appendChild(input);
      row.appendChild(text);
      filtersContainer.appendChild(row);
    });
  }

  if (clearButton) {
    clearButton.onclick = () => {
      if (!selectedCategoryFilters.size) return;
      selectedCategoryFilters.clear();
      latestVisibleCount = POSTS_PAGE_SIZE;
      searchVisibleCount = POSTS_PAGE_SIZE;
      categoryVisibleCounts.clear();
      renderFilterSidebar(getAllCategories(allPosts));

      const searchInput = document.getElementById("search-input");
      const query = normalizeSearchText(searchInput?.value || "");
      if (query) {
        filterPosts(query);
      } else {
        renderHomeSections();
      }
    };
  }
}

function renderHomeSections() {
  const container = document.getElementById("home");
  if (!container) return;

  container.className = "home-sections";
  container.innerHTML = "";

  const categories = getAllCategories(allPosts);
  const filteredPosts = getPostsWithActiveFilters(allPosts);

  if (!filteredPosts.length) {
    container.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 40px 0;">No posts match selected filters.</div>';
    return;
  }

  const hasActiveCategoryFilter = selectedCategoryFilters.size > 0;

  const latestSection = document.createElement("section");
  latestSection.className = "home-section latest-section";
  const latestHead = document.createElement("div");
  latestHead.className = "home-section-head";

  if (hasActiveCategoryFilter) {
    const selectedNames = [...selectedCategoryFilters];
    if (selectedNames.length === 1) {
      latestHead.innerHTML = `<h2>${selectedNames[0]}</h2><p>Latest posts in ${selectedNames[0]}</p>`;
    } else {
      latestHead.innerHTML = `<h2>Filtered Posts</h2><p>Latest posts in selected categories</p>`;
    }
  } else {
    latestHead.innerHTML = "<h2>Latest Posts</h2><p>Latest 7 posts</p>";
  }

  const latestSorted = getSortedPosts(filteredPosts);
  const latestGrid = document.createElement("div");
  latestGrid.className = "home-grid";
  latestSorted.slice(0, latestVisibleCount).forEach(post => {
    latestGrid.appendChild(createPostCard(post));
  });

  latestSection.appendChild(latestHead);
  latestSection.appendChild(latestGrid);

  const latestControls = createLatestPaginationControls(latestSorted.length);
  if (latestControls) {
    latestSection.appendChild(latestControls);
  }

  container.appendChild(latestSection);

  if (hasActiveCategoryFilter) {
    return;
  }

  const categoriesToRender = selectedCategoryFilters.size
    ? categories.filter(category => selectedCategoryFilters.has(category))
    : categories;

  categoriesToRender.forEach(category => {
    const postsInCategoryAll = getSortedPosts(
      allPosts.filter(post => Array.isArray(post.categories) && post.categories.includes(category))
    );

    const isSelectedCategory = selectedCategoryFilters.has(category);
    const visibleCount = isSelectedCategory
      ? postsInCategoryAll.length
      : ensureCategoryVisibleCount(category);
    const postsInCategory = postsInCategoryAll.slice(0, visibleCount);

    if (!postsInCategory.length) return;

    const section = document.createElement("section");
    section.className = "home-section category-section";

    const head = document.createElement("div");
    head.className = "home-section-head";
    head.innerHTML = `<h2>${category}</h2><p>Latest 7 posts in ${category}</p>`;

    const grid = document.createElement("div");
    grid.className = "home-grid";
    postsInCategory.forEach(post => {
      grid.appendChild(createPostCard(post));
    });

    section.appendChild(head);
    section.appendChild(grid);

    if (!isSelectedCategory && visibleCount < postsInCategoryAll.length) {
      section.appendChild(createShowMoreButton(() => {
        categoryVisibleCounts.set(category, visibleCount + POSTS_PAGE_SIZE);
        renderHomeSections();
      }));
    }

    container.appendChild(section);
  });
}

async function loadPost() {
  const container = document.getElementById("post");
  if (!container) return;

  const slug = new URLSearchParams(window.location.search).get("slug");
  if (!slug) return;

  const res = await fetch("/api/posts/" + slug);
  if (!res.ok) {
    container.innerHTML = '<p style="color: var(--text-muted);">Post not found.</p>';
    return;
  }

  const post = await res.json();
  console.log("Full post:", post);

  currentPostId = post._id;
  const heroImage = post.content?.find(b => b.type === "image");
  console.log("Hero image block:", heroImage);

  const bodyHtml = post.content?.map(block => {
    if (block === heroImage) return "";

    if (block.type === "paragraph") {
      return `<p>${block.data.text}</p>`;
    }

    if (block.type === "image") {
      const imgUrl = block.data?.file?.url || 
                     block.data?.url || 
                     block.data?.file;
      console.log("Image URL in body:", imgUrl);
      return `<img src="${imgUrl}" alt="Article image" class="article-image">`;
    }

    if (block.type === "embed" && block.data.service === "youtube") {
      const videoId = block.data.source.split("v=")[1];
      return `
        <div class="article-embed">
          <iframe
            src="https://www.youtube.com/embed/${videoId}"
            allowfullscreen>
          </iframe>
        </div>
      `;
    }

    return "";
  }).join("") || "";

  const date = new Date(post.createdAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const authorLine = post.author ? `<span>By ${post.author}</span>` : "";
  const categoryLine = Array.isArray(post.categories) && post.categories.length
    ? `<span>${post.categories.join(" · ")}</span>`
    : "";

  const heroUrl = heroImage?.data?.file?.url || 
                  heroImage?.data?.url || 
                  heroImage?.data?.file;

  container.innerHTML = `
    <h1>${post.title}</h1>
    ${heroUrl ? `<img src="${heroUrl}" alt="${post.title}" class="article-image">` : ""}
    <div class="article-meta">
      ${authorLine}
      ${categoryLine}
      <span>${date}</span>
    </div>
    <div class="article-content">
      ${bodyHtml}
    </div>
  `;

  await loadViewer();
  loadComments(post._id);
  setupCommentForm(post._id);
}

let currentUser = null;
let currentPostId = null;

async function loadViewer() {
  const res = await fetch("/api/auth/profile");
  if (!res.ok) {
    currentUser = null;
    return;
  }

  currentUser = await res.json();
}

async function loadComments(postId) {
  const list = document.getElementById("commentList");
  if (!list) return;

  const res = await fetch(`/api/comments/${postId}`);
  const comments = res.ok ? await res.json() : [];

  list.innerHTML = "";
  if (!comments.length) {
    list.innerHTML = '<p class="comment-empty">Be the first to comment.</p>';
    return;
  }

  comments.forEach(comment => {
    const item = document.createElement("div");
    item.className = "comment-item";
    const date = new Date(comment.createdAt).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });

    const canDelete = currentUser && (currentUser.role === "staff" || currentUser._id === comment.userId);
    const deleteButton = canDelete
      ? `<button class="comment-delete" onclick="deleteComment('${comment._id}')">Delete</button>`
      : "";

    item.innerHTML = `
      <div class="comment-author">
        ${comment.authorAvatar ? `<img src="${comment.authorAvatar}" alt="${comment.authorName}">` : ""}
        <div>
          <strong>${comment.authorName}</strong>
          <span>${date}</span>
        </div>
        ${deleteButton}
      </div>
      <p>${comment.text}</p>
    `;
    list.appendChild(item);
  });
}

async function deleteComment(commentId) {
  const res = await fetch(`/api/comments/${commentId}`, {
    method: "DELETE"
  });

  if (!res.ok) {
    const status = document.getElementById("commentStatus");
    if (status) status.textContent = "Could not delete comment.";
    return;
  }

    if (!currentPostId) return;
    loadComments(currentPostId);
}

function setupCommentForm(postId) {
  const form = document.getElementById("commentForm");
  const status = document.getElementById("commentStatus");
  const loginPrompt = document.getElementById("commentLoginPrompt");
  
  if (!form || !status) return;

  // Check if user is logged in
  if (!currentUser) {
    // Hide the form and show login prompt
    form.style.display = "none";
    if (loginPrompt) {
      loginPrompt.style.display = "block";
    }
    return;
  }

  // User is logged in, show the form
  form.style.display = "block";
  if (loginPrompt) {
    loginPrompt.style.display = "none";
  }

  form.addEventListener("submit", async e => {
    e.preventDefault();
    status.textContent = "";

    const textArea = document.getElementById("commentText");
    const text = textArea.value.trim();
    if (!text) return;

    const res = await fetch(`/api/comments/${postId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text })
    });

    if (res.status === 401) {
      status.textContent = "Please log in to comment.";
      return;
    }

    if (!res.ok) {
      status.textContent = "Could not post comment. Try again.";
      return;
    }

    textArea.value = "";
    status.textContent = "Comment posted.";
    loadComments(postId);
  }, { once: true });
}

// Search functionality
async function initializeSearch() {
  const searchInput = document.getElementById('search-input');
  const clearBtn = document.getElementById('clear-search');
  const searchResults = document.getElementById('search-results');
  const searchHint = document.querySelector('.search-hint');
  
  if (!searchInput) return;

  // Search input handler
  searchInput.addEventListener('input', (e) => {
    const query = normalizeSearchText(e.target.value);
    searchVisibleCount = POSTS_PAGE_SIZE;
    
    if (query.length > 0) {
      clearBtn.style.display = 'flex';
      if (searchHint) searchHint.style.display = 'none';
      filterPosts(query);
    } else {
      clearBtn.style.display = 'none';
      if (searchHint) searchHint.style.display = 'block';
      searchResults.innerHTML = '';
      displayAllPosts();
    }
  });

  // Clear button handler
  clearBtn.addEventListener('click', () => {
    searchInput.value = '';
    clearBtn.style.display = 'none';
    if (searchHint) searchHint.style.display = 'block';
    searchResults.innerHTML = '';
    displayAllPosts();
    searchInput.focus();
  });

  // Keyboard shortcut: "/" or "Ctrl+K" to focus search
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
      e.preventDefault();
      searchInput.focus();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      searchInput.focus();
    }
    // ESC to clear search
    if (e.key === 'Escape' && searchInput === document.activeElement) {
      searchInput.value = '';
      clearBtn.style.display = 'none';
      if (searchHint) searchHint.style.display = 'block';
      searchResults.innerHTML = '';
      displayAllPosts();
      searchInput.blur();
    }
  });
}

function normalizeSearchText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatReleaseDate(dateValue) {
  return new Date(dateValue).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric"
  });
}

function getDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function loadReleaseEvents() {
  try {
    const response = await fetch("/api/releases");
    if (!response.ok) throw new Error("Failed to load releases");

    const data = await response.json();
    if (!Array.isArray(data) || !data.length) {
      releaseEvents = [];
      return;
    }

    releaseEvents = data
      .filter(item => item && item.date && item.title)
      .map(item => ({
        date: item.date,
        title: item.title,
        type: item.type === "Game" ? "Game" : "Tech",
        slug: item.slug || ""
      }));
  } catch {
    releaseEvents = [];
  }
}

function renderReleaseCalendar() {
  const monthLabel = document.getElementById("calendar-month");
  const daysContainer = document.getElementById("calendar-days");
  const releaseList = document.getElementById("release-list");
  if (!monthLabel || !daysContainer || !releaseList) return;

  const currentYear = calendarViewDate.getFullYear();
  const currentMonth = calendarViewDate.getMonth();
  const firstDay = new Date(currentYear, currentMonth, 1);
  const lastDay = new Date(currentYear, currentMonth + 1, 0);
  const startWeekDay = firstDay.getDay();
  const daysInMonth = lastDay.getDate();
  const todayKey = getDateKey(new Date());

  monthLabel.textContent = firstDay.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric"
  });

  const releaseDates = new Set(releaseEvents.map(event => event.date));
  daysContainer.innerHTML = "";

  for (let i = 0; i < startWeekDay; i += 1) {
    const empty = document.createElement("div");
    empty.className = "calendar-day is-outside";
    daysContainer.appendChild(empty);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(currentYear, currentMonth, day);
    const dateKey = getDateKey(date);
    const dayCell = document.createElement("div");
    dayCell.className = "calendar-day";
    dayCell.textContent = String(day);

    if (dateKey === todayKey) {
      dayCell.classList.add("is-today");
    }
    if (releaseDates.has(dateKey)) {
      dayCell.classList.add("has-release");
    }

    daysContainer.appendChild(dayCell);
  }

  const monthEvents = releaseEvents
    .filter(event => {
      const eventDate = new Date(event.date);
      return eventDate.getFullYear() === currentYear && eventDate.getMonth() === currentMonth;
    })
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  releaseList.innerHTML = "";
  if (!monthEvents.length) {
    releaseList.innerHTML = '<div class="release-item"><div class="release-item-meta">No planned releases this month.</div></div>';
    return;
  }

  monthEvents.forEach(event => {
    const item = document.createElement("div");
    item.className = "release-item";
    item.innerHTML = `
      <div class="release-item-name">${event.title}</div>
      <div class="release-item-meta">${event.type} • ${formatReleaseDate(event.date)}</div>
    `;

    if (event.slug) {
      item.style.cursor = "pointer";
      item.setAttribute("role", "link");
      item.tabIndex = 0;
      item.addEventListener("click", () => {
        window.location.href = `post.html?slug=${encodeURIComponent(event.slug)}`;
      });
      item.addEventListener("keydown", e => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          window.location.href = `post.html?slug=${encodeURIComponent(event.slug)}`;
        }
      });
    }

    releaseList.appendChild(item);
  });
}

async function initializeReleaseCalendar() {
  const calendarRoot = document.getElementById("release-calendar");
  if (!calendarRoot) return;

  await loadReleaseEvents();

  const prevButton = document.getElementById("calendar-prev");
  const nextButton = document.getElementById("calendar-next");

  if (prevButton) {
    prevButton.addEventListener("click", () => {
      calendarViewDate.setMonth(calendarViewDate.getMonth() - 1);
      renderReleaseCalendar();
    });
  }

  if (nextButton) {
    nextButton.addEventListener("click", () => {
      calendarViewDate.setMonth(calendarViewDate.getMonth() + 1);
      renderReleaseCalendar();
    });
  }

  renderReleaseCalendar();
}

function initializeMobilePanelToggles() {
  const filtersPanel = document.getElementById("home-filters");
  const calendarPanel = document.getElementById("release-calendar");
  const filtersButton = document.getElementById("toggle-filters");
  const calendarButton = document.getElementById("toggle-calendar");
  if (!filtersPanel || !calendarPanel || !filtersButton || !calendarButton) return;

  const mobileQuery = window.matchMedia("(max-width: 1510px)");

  const setExpanded = (button, expanded) => {
    button.setAttribute("aria-expanded", String(expanded));
  };

  const closeAllPanels = () => {
    filtersPanel.classList.remove("is-open");
    calendarPanel.classList.remove("is-open");
    setExpanded(filtersButton, false);
    setExpanded(calendarButton, false);
  };

  const togglePanel = (panel, button) => {
    if (!mobileQuery.matches) return;
    const willOpen = !panel.classList.contains("is-open");
    panel.classList.toggle("is-open", willOpen);
    setExpanded(button, willOpen);
  };

  filtersButton.addEventListener("click", () => togglePanel(filtersPanel, filtersButton));
  calendarButton.addEventListener("click", () => togglePanel(calendarPanel, calendarButton));
  mobileQuery.addEventListener("change", closeAllPanels);

  closeAllPanels();
}

function filterPosts(query) {
  const searchResults = document.getElementById('search-results');
  const container = document.getElementById("home");
  const normalizedQuery = normalizeSearchText(query);
  const sourcePosts = getPostsWithActiveFilters(allPosts);
  
  // Filter posts based on title, excerpt, categories, author, or slug
  const filtered = sourcePosts.filter(post => {
    const titleMatch = normalizeSearchText(post.title).includes(normalizedQuery);
    const excerptMatch = normalizeSearchText(post.excerpt).includes(normalizedQuery);
    const authorMatch = normalizeSearchText(post.author).includes(normalizedQuery);
    const slugMatch = normalizeSearchText(post.slug).includes(normalizedQuery);
    const categoryMatch = post.categories?.some(cat => 
      normalizeSearchText(cat).includes(normalizedQuery)
    );
    
    return titleMatch || excerptMatch || authorMatch || categoryMatch || slugMatch;
  });

  // Display results count
  if (filtered.length === 0) {
    if (container) container.className = "home-sections";
    searchResults.innerHTML = '<span style="color: var(--text-muted);">No articles found matching your search</span>';
    container.innerHTML = `
      <div style="text-align: center; padding: 60px 20px;">
        <svg viewBox="0 0 24 24" fill="none" width="48" height="48" style="opacity: 0.3; margin-bottom: 16px;">
          <circle cx="10" cy="10" r="7" stroke="currentColor" stroke-width="2"/>
          <path d="M15 15L21 21" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
        <p style="color: var(--text-muted); font-size: 1.1rem; margin: 0;">No articles match your search</p>
        <p style="color: var(--text-muted); font-size: 0.9rem; margin-top: 8px;">Try different keywords or browse all articles</p>
      </div>
    `;
  } else {
    const plural = filtered.length === 1 ? 'article' : 'articles';
    searchResults.innerHTML = `<span style="color: var(--accent);">${filtered.length}</span> ${plural} found`;
    displayPosts(filtered);
  }
}

function displayAllPosts() {
  latestVisibleCount = POSTS_PAGE_SIZE;
  categoryVisibleCounts.clear();
  renderHomeSections();
}

function displayPosts(posts) {
  const container = document.getElementById("home");
  if (!container) return;

  const sorted = [...posts].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  container.className = "home-grid search-grid";
  
  container.innerHTML = "";
  if (!sorted.length) {
    container.className = "home-sections";
    container.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 40px 0;">No articles published yet.</div>';
    return;
  }

  const visiblePosts = sorted.slice(0, searchVisibleCount);
  visiblePosts.forEach((post) => {
    container.appendChild(createPostCard(post));
  });

  if (visiblePosts.length < sorted.length) {
    container.appendChild(createShowMoreButton(() => {
      searchVisibleCount += POSTS_PAGE_SIZE;
      displayPosts(sorted);
    }));
  }
}

// Load posts on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function() {
    loadPosts();
    loadPost();
    initializeSearch();
    initializeReleaseCalendar();
    initializeMobilePanelToggles();
  });
} else {
  loadPosts();
  loadPost();
  initializeSearch();
  initializeReleaseCalendar();
  initializeMobilePanelToggles();
}
