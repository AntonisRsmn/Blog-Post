// Search state
let allPosts = [];
let releaseEvents = [];
let calendarViewDate = new Date();
const selectedCategoryFilters = new Set();
const POSTS_PAGE_SIZE = 7;
const HOME_BASE_VISIBLE_COUNT = 7;
const HOME_TOGGLE_STEP = 9;
let latestVisibleCount = HOME_BASE_VISIBLE_COUNT;
let searchVisibleCount = POSTS_PAGE_SIZE;
const categoryVisibleCounts = new Map();
let latestPaginationMode = "expand";
const categoryPaginationModes = new Map();
let homeRenderVersion = 0;
let featuredRotationTimer = null;
const FEATURED_ROTATION_MS = 5000;
const DEFAULT_POST_IMAGE = "/assets/default-post.svg";
const DEFAULT_AUTHOR_AVATAR = "/assets/default-avatar.svg";
let authorPageName = "";
let authorPageTotalCount = 0;
let authorPageRenderCallback = null;

function normalizeCategoryLabel(value) {
  return String(value || "").replace(/\s+/g, " ").trim().toUpperCase();
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function toHeadingId(value, fallback = "section") {
  const base = String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return base || fallback;
}

function estimateReadingMinutesFromHtml(html) {
  const plain = String(html || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const words = plain ? plain.split(" ").filter(Boolean).length : 0;
  if (!words) return 1;
  return Math.max(1, Math.ceil(words / 220));
}

function initializeReadingProgress() {
  const progress = document.getElementById("article-reading-progress");
  const article = document.getElementById("post");
  if (!progress || !article) return;

  const update = () => {
    const rect = article.getBoundingClientRect();
    const viewport = Math.max(window.innerHeight, 1);
    const total = Math.max(rect.height - viewport * 0.45, 1);
    const consumed = Math.min(Math.max(-rect.top + viewport * 0.2, 0), total);
    const ratio = consumed / total;
    progress.style.width = `${Math.round(ratio * 100)}%`;
  };

  window.addEventListener("scroll", update, { passive: true });
  window.addEventListener("resize", update);
  update();
}

function renderArticleToc(rootElement) {
  const tocRoot = rootElement?.querySelector("#article-toc");
  const tocList = rootElement?.querySelector("#article-toc-list");
  if (!tocRoot || !tocList) return;

  const headings = Array.from(rootElement.querySelectorAll(".article-content h2, .article-content h3"));
  tocList.innerHTML = "";

  if (!headings.length) {
    tocRoot.hidden = true;
    return;
  }

  const used = new Set();
  headings.forEach((heading, index) => {
    const text = String(heading.textContent || "").trim();
    if (!text) return;

    let id = toHeadingId(text, `section-${index + 1}`);
    while (used.has(id)) {
      id = `${id}-${index + 1}`;
    }
    used.add(id);
    heading.id = id;

    const li = document.createElement("li");
    if (heading.tagName.toLowerCase() === "h3") {
      li.style.marginLeft = "12px";
    }

    const anchor = document.createElement("a");
    anchor.href = `#${id}`;
    anchor.textContent = text;
    li.appendChild(anchor);
    tocList.appendChild(li);
  });

  tocRoot.hidden = tocList.children.length === 0;
}

async function trackPostView(post) {
  const id = String(post?._id || "").trim();
  const slug = String(post?.slug || "").trim();
  if (!id && !slug) return;

  const preferences = typeof window.getCookiePreferences === "function"
    ? window.getCookiePreferences()
    : null;
  if (preferences && !preferences.analytics) return;

  const sessionKey = `tracked-post-view:${id || slug}`;
  try {
    if (sessionStorage.getItem(sessionKey) === "1") return;
  } catch {
  }

  try {
    await fetch("/api/posts/track-view", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, slug })
    });
    sessionStorage.setItem(sessionKey, "1");
  } catch {
  }
}

function getDisplayExcerpt(post, maxLength = 170) {
  const primary = post?.excerpt || post?.summary || "";
  const secondary = post?.content || "";
  let text = String(primary || secondary || "");

  text = text
    .replace(/<br\b[^>]*>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\((?:https?:\/\/|\/)[^)]+\)/g, "$1")
    .replace(/https?:\/\/[^\s<]+/gi, " ")
    .replace(/\b(?:image|images|paragraph)\b/gi, " ")
    .replace(/^(?:\s*[A-Za-z0-9_-]{8,}\s+){1,4}/u, "")
    .replace(/\b(?=[A-Za-z0-9_-]{8,}\b)(?=.*[_\d])[A-Za-z0-9_-]+\b/gu, " ")
    .replace(/\b[A-Za-z0-9]{16,}\b/g, " ")
    .replace(/\b[a-z0-9]{8,}\b(?=\s+[\p{L}\p{N}])/giu, " ")
    .replace(/\s+/g, " ")
    .trim();

  const parts = text
    .split(/(?<=[.!?;])\s+|\n+/)
    .map(part => part.trim())
    .filter(Boolean)
    .filter(part => !/^[a-z0-9]{8,}$/i.test(part))
    .filter(part => !/^(?:[A-Za-z0-9_-]{8,}\s+){1,3}[\p{L}]{2,}/u.test(part))
    .filter(part => /[\p{L}\p{N}]{3,}/u.test(part));

  if (parts.length) {
    text = parts.join(" ");
  }

  if (!text) return "Read more...";
  if (text.length <= maxLength) return text;

  const shortened = text.slice(0, maxLength).trim().replace(/[\s.,;:!?-]+$/g, "");
  return `${shortened}…`;
}

function toSafeHttpUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const hasScheme = /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(raw);
  const isRelativePath = raw.startsWith("/") || raw.startsWith("./") || raw.startsWith("../");
  if (!hasScheme && !isRelativePath) return "";

  try {
    const parsed = new URL(raw, window.location.origin);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    return parsed.href;
  } catch {
    return "";
  }
}

function upsertMetaTag(attributeName, attributeValue, content) {
  const safeContent = String(content || "").trim();
  if (!attributeName || !attributeValue) return;
  if (!safeContent) return;

  let tag = document.head.querySelector(`meta[${attributeName}="${attributeValue}"]`);
  if (!tag) {
    tag = document.createElement("meta");
    tag.setAttribute(attributeName, attributeValue);
    document.head.appendChild(tag);
  }

  tag.setAttribute("content", safeContent);
}

function upsertCanonicalLink(href) {
  const safeHref = toSafeHttpUrl(href);
  if (!safeHref) return;

  let canonical = document.head.querySelector("link[rel='canonical']");
  if (!canonical) {
    canonical = document.createElement("link");
    canonical.setAttribute("rel", "canonical");
    document.head.appendChild(canonical);
  }

  canonical.setAttribute("href", safeHref);
}

function updateArticleStructuredData(payload) {
  if (!payload) return;

  const scriptId = "article-structured-data";
  let scriptTag = document.getElementById(scriptId);
  if (!scriptTag) {
    scriptTag = document.createElement("script");
    scriptTag.id = scriptId;
    scriptTag.type = "application/ld+json";
    document.head.appendChild(scriptTag);
  }

  scriptTag.textContent = JSON.stringify(payload);
}

function applyPostSeo(post, options = {}) {
  const title = String(post?.title || "Untitled").trim();
  const author = String(post?.author || "").trim();
  const articleUrl = String(options?.url || "").trim();
  const imageUrl = String(options?.imageUrl || "").trim();

  const preferredDescription = String(post?.metaDescription || post?.excerpt || "").trim();
  const generatedDescription = String(options?.fallbackDescription || "").trim();
  const description = (preferredDescription || generatedDescription || "Read the latest article on Rusman Blog.")
    .replace(/\s+/g, " ")
    .slice(0, 220)
    .trim();

  const docTitle = title ? `${title} | Rusman` : "Post | Rusman";
  document.title = docTitle;

  upsertMetaTag("name", "description", description);
  upsertMetaTag("property", "og:type", "article");
  upsertMetaTag("property", "og:site_name", "Rusman");
  upsertMetaTag("property", "og:title", docTitle);
  upsertMetaTag("property", "og:description", description);
  upsertMetaTag("property", "og:url", articleUrl);
  upsertMetaTag("property", "og:image", imageUrl);
  upsertMetaTag("name", "twitter:card", "summary_large_image");
  upsertMetaTag("name", "twitter:title", docTitle);
  upsertMetaTag("name", "twitter:description", description);
  upsertMetaTag("name", "twitter:image", imageUrl);
  upsertCanonicalLink(articleUrl);

  const datePublished = post?.createdAt ? new Date(post.createdAt).toISOString() : undefined;
  const dateModifiedSource = post?.updatedAt || post?.createdAt;
  const dateModified = dateModifiedSource ? new Date(dateModifiedSource).toISOString() : undefined;

  updateArticleStructuredData({
    "@context": "https://schema.org",
    "@type": "Article",
    headline: title,
    description,
    image: imageUrl ? [imageUrl] : undefined,
    author: author ? { "@type": "Person", name: author } : undefined,
    publisher: {
      "@type": "Organization",
      name: "Rusman"
    },
    datePublished,
    dateModified,
    mainEntityOfPage: articleUrl
  });
}

function isTwitterStatusUrl(value) {
  try {
    const parsed = new URL(String(value || ""));
    const host = parsed.hostname.toLowerCase();
    const isTwitterHost = host === "twitter.com" || host === "www.twitter.com" || host === "x.com" || host === "www.x.com";
    if (!isTwitterHost) return false;
    return /^\/[A-Za-z0-9_]{1,15}\/status\/\d+/.test(parsed.pathname);
  } catch {
    return false;
  }
}

function extractTwitterStatusUrl(text) {
  const raw = String(text || "");
  const matches = raw.match(/https?:\/\/(?:www\.)?(?:twitter\.com|x\.com)\/[A-Za-z0-9_]{1,15}\/status\/\d+[^\s<]*/gi) || [];

  for (const candidate of matches) {
    const safe = toSafeHttpUrl(candidate);
    if (safe && isTwitterStatusUrl(safe)) {
      return safe;
    }
  }

  return "";
}

function renderLinkedText(text) {
  const raw = String(text || "");

  function linkifyPlainText(value) {
    const input = String(value || "");
    const urlRegex = /https?:\/\/[^\s<]+/gi;
    let output = "";
    let cursor = 0;

    for (const match of input.matchAll(urlRegex)) {
      const foundUrl = String(match[0] || "");
      const start = Number(match.index || 0);

      output += escapeHtml(input.slice(cursor, start));

      const safeUrl = toSafeHttpUrl(foundUrl);
      if (!safeUrl) {
        output += escapeHtml(foundUrl);
      } else {
        output += `<a href="${escapeHtml(safeUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(foundUrl)}</a>`;
      }

      cursor = start + foundUrl.length;
    }

    output += escapeHtml(input.slice(cursor));
    return output;
  }

  function stripTags(value) {
    return String(value || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  }

  const anchorRegex = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let html = "";
  let lastIndex = 0;

  for (const match of raw.matchAll(anchorRegex)) {
    const start = Number(match.index || 0);
    const fullMatch = String(match[0] || "");
    const href = String(match[1] || "");
    const label = stripTags(match[2] || "");

    html += linkifyPlainText(raw.slice(lastIndex, start));

    const safeUrl = toSafeHttpUrl(href);
    if (!safeUrl) {
      html += escapeHtml(stripTags(fullMatch) || fullMatch);
    } else {
      const linkLabel = label || safeUrl;
      html += `<a href="${escapeHtml(safeUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(linkLabel)}</a>`;
    }

    lastIndex = start + fullMatch.length;
  }

  html += linkifyPlainText(raw.slice(lastIndex));
  return html;
}

function renderParagraphBlock(text) {
  const raw = String(text || "").replace(/<br\b[^>]*>/gi, "\n");
  const trimmed = raw.trim();
  const twitterUrl = extractTwitterStatusUrl(trimmed);
  const looksLikeTwitterSnippet = /twitter-tweet|platform\.twitter\.com\/widgets\.js/i.test(trimmed);

  if (twitterUrl && (trimmed === twitterUrl || looksLikeTwitterSnippet)) {
    const safeUrl = escapeHtml(twitterUrl);
    return `
      <div class="article-embed article-embed-tweet">
        <blockquote class="twitter-tweet">
          <a href="${safeUrl}">${safeUrl}</a>
        </blockquote>
      </div>
    `;
  }

  const parts = raw
    .split(/\n\s*\n+/)
    .map(part => part.replace(/\n+/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean);

  if (!parts.length) return "";
  return parts.map(part => `<p>${renderLinkedText(part)}</p>`).join("");
}

function loadTwitterWidgets(target) {
  const root = target || document;
  if (!root.querySelector(".twitter-tweet")) return;

  if (window.twttr && window.twttr.widgets && typeof window.twttr.widgets.load === "function") {
    window.twttr.widgets.load(root);
    return;
  }

  let script = document.getElementById("twitter-wjs");
  if (script) return;

  script = document.createElement("script");
  script.id = "twitter-wjs";
  script.async = true;
  script.src = "https://platform.twitter.com/widgets.js";
  script.onload = () => {
    if (window.twttr && window.twttr.widgets && typeof window.twttr.widgets.load === "function") {
      window.twttr.widgets.load(root);
    }
  };
  document.body.appendChild(script);
}

function extractYouTubeVideoId(source) {
  const raw = String(source || "");
  const fromQuery = raw.includes("v=") ? raw.split("v=")[1] : "";
  const candidate = (fromQuery || raw).split("&")[0].trim();
  return /^[a-zA-Z0-9_-]{11}$/.test(candidate) ? candidate : "";
}

async function loadPosts() {
  const container = document.getElementById("home");
  if (!container) return;

  const res = await fetch("/api/posts?list=1");
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

async function loadAuthorPage() {
  const authorRoot = document.getElementById("author-page");
  const header = document.getElementById("author-header");
  const container = document.getElementById("author-posts");
  const heroName = document.getElementById("author-hero-name");
  const heroSubtitle = document.getElementById("author-hero-subtitle");
  const heroAvatar = document.getElementById("author-hero-avatar");
  const heroLinks = document.getElementById("author-hero-links");
  if (!authorRoot || !header || !container) return;

  const params = new URLSearchParams(window.location.search);
  const author = String(params.get("author") || "").trim();

  if (!author) {
    header.innerHTML = "<h2>Author</h2><p>No author selected.</p>";
    container.innerHTML = '<div style="color: var(--text-muted);">Choose an author from an article page.</div>';
    if (heroName) heroName.textContent = "Author";
    if (heroSubtitle) heroSubtitle.textContent = "No author selected.";
    if (heroAvatar) heroAvatar.src = DEFAULT_AUTHOR_AVATAR;
    if (heroLinks) {
      heroLinks.innerHTML = "";
      heroLinks.hidden = true;
    }
    authorPageRenderCallback = null;
    return;
  }

  const renderAuthorHero = (profile) => {
    const displayName = String(profile?.name || author).trim() || author;
    if (heroName) heroName.textContent = displayName;
    if (heroSubtitle) heroSubtitle.textContent = `Posts by ${displayName}`;

    const avatar = toSafeHttpUrl(profile?.avatarUrl || "") || DEFAULT_AUTHOR_AVATAR;
    if (heroAvatar) {
      heroAvatar.src = avatar;
      heroAvatar.alt = `${displayName} avatar`;
      heroAvatar.onerror = () => {
        heroAvatar.src = DEFAULT_AUTHOR_AVATAR;
      };
    }

    if (heroLinks) {
      heroLinks.innerHTML = "";
      heroLinks.hidden = true;
      const links = profile?.links || {};
      const candidates = [
        { key: "website", label: "Website" },
        { key: "github", label: "GitHub" },
        { key: "linkedin", label: "LinkedIn" },
        { key: "instagram", label: "Instagram" },
        { key: "twitter", label: "Twitter/X" },
        { key: "tiktok", label: "TikTok" }
      ];

      candidates.forEach(item => {
        const url = toSafeHttpUrl(links?.[item.key] || "");
        if (!url) return;
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.target = "_blank";
        anchor.rel = "noopener noreferrer";
        anchor.textContent = item.label;
        heroLinks.appendChild(anchor);
      });

      heroLinks.hidden = heroLinks.childElementCount === 0;
    }
  };

  const renderAuthorSections = () => {
    if (!header || !container) return;

    const categories = getAllCategories(allPosts);
    const filteredPosts = getPostsWithActiveFilters(allPosts);
    const hasActiveCategoryFilter = selectedCategoryFilters.size > 0;
    const latestSorted = getSortedPosts(filteredPosts);
    const totalCount = Number(authorPageTotalCount || allPosts.length || 0);
    const articleLabel = totalCount === 1 ? "article" : "articles";

    header.innerHTML = `<h2>Posts by ${escapeHtml(authorPageName || author || "Author")}</h2><p>${latestSorted.length} of ${totalCount} ${articleLabel}</p>`;
    container.className = "home-sections";
    container.innerHTML = "";

    if (!latestSorted.length) {
      container.innerHTML = '<div style="color: var(--text-muted);">No posts match selected filters.</div>';
      return;
    }

    const latestSection = document.createElement("section");
    latestSection.className = "home-section latest-section";

    const latestHead = document.createElement("div");
    latestHead.className = "home-section-head";
    if (hasActiveCategoryFilter) {
      const selectedNames = [...selectedCategoryFilters];
      if (selectedNames.length === 1) {
        latestHead.innerHTML = `<h2>${selectedNames[0]}</h2><p>Latest posts in ${selectedNames[0]}</p>`;
      } else {
        latestHead.innerHTML = "<h2>Filtered Posts</h2><p>Latest posts in selected categories</p>";
      }
    } else {
      latestHead.innerHTML = "<h2>Latest Posts</h2><p>Latest 7 posts</p>";
    }

    latestVisibleCount = Math.min(Math.max(latestVisibleCount, HOME_BASE_VISIBLE_COUNT), latestSorted.length);
    const latestGrid = document.createElement("div");
    latestGrid.className = "home-grid";
    latestSorted.slice(0, latestVisibleCount).forEach(post => {
      latestGrid.appendChild(createPostCard(post));
    });

    latestSection.appendChild(latestHead);
    latestSection.appendChild(latestGrid);

    const latestControls = createLatestPaginationControls(latestSorted.length, renderAuthorSections);
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
      const currentVisibleCount = Math.min(Math.max(visibleCount, HOME_BASE_VISIBLE_COUNT), postsInCategoryAll.length);
      const postsInCategory = postsInCategoryAll.slice(0, currentVisibleCount);

      if (!isSelectedCategory && !categoryPaginationModes.has(category)) {
        categoryPaginationModes.set(category, "expand");
      }

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

      if (!isSelectedCategory && postsInCategoryAll.length > HOME_BASE_VISIBLE_COUNT) {
        const mode = categoryPaginationModes.get(category) === "collapse" && currentVisibleCount > HOME_BASE_VISIBLE_COUNT
          ? "collapse"
          : "expand";

        section.appendChild(createPaginationToggleButton(
          mode === "collapse" ? "Show less" : "Show more",
          () => {
            if (mode === "collapse") {
              const nextCount = Math.max(HOME_BASE_VISIBLE_COUNT, currentVisibleCount - HOME_TOGGLE_STEP);
              categoryVisibleCounts.set(category, nextCount);
              categoryPaginationModes.set(category, nextCount > HOME_BASE_VISIBLE_COUNT ? "collapse" : "expand");
            } else {
              const nextCount = Math.min(postsInCategoryAll.length, currentVisibleCount + HOME_TOGGLE_STEP);
              categoryVisibleCounts.set(category, nextCount);
              categoryPaginationModes.set(category, nextCount >= postsInCategoryAll.length ? "collapse" : "expand");
            }

            renderAuthorSections();
          },
          mode === "collapse" ? "show-less-btn" : ""
        ));
      }

      container.appendChild(section);
    });
  };

  authorPageRenderCallback = renderAuthorSections;

  try {
    const profileResponse = await fetch(`/api/auth/author?name=${encodeURIComponent(author)}`);
    if (profileResponse.ok) {
      const profilePayload = await profileResponse.json().catch(() => ({}));
      renderAuthorHero(profilePayload);
    } else {
      renderAuthorHero({ name: author, avatarUrl: "", links: {} });
    }

    const response = await fetch(`/api/posts/by-author?author=${encodeURIComponent(author)}`);
    if (!response.ok) throw new Error("author-load-failed");
    const posts = await response.json();
    const list = Array.isArray(posts) ? posts : [];

    document.title = `${author} | Rusman`;
    authorPageName = author;
    authorPageTotalCount = list.length;
    allPosts = list;
    resetHomePaginationState();
    selectedCategoryFilters.clear();
    renderFilterSidebar(getAllCategories(allPosts));
    renderAuthorSections();
  } catch {
    renderAuthorHero({ name: author, avatarUrl: "", links: {} });
    header.innerHTML = `<h2>Posts by ${escapeHtml(author)}</h2><p>Could not load posts right now.</p>`;
    container.innerHTML = '<div style="color: var(--error);">Please try again later.</div>';
    allPosts = [];
    selectedCategoryFilters.clear();
    renderFilterSidebar([]);
    authorPageRenderCallback = null;
  }
}

function getSortedPosts(posts) {
  return [...posts].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function getPostImageUrl(post) {
  if (post?.thumbnailUrl) return post.thumbnailUrl;
  const imageBlock = post.content?.find(block => block.type === "image");
  const resolved = imageBlock
    ? (imageBlock.data?.file?.url || imageBlock.data?.url || imageBlock.data?.file || "")
    : "";
  return resolved || DEFAULT_POST_IMAGE;
}

function getPostHref(post) {
  const encodedId = encodeURIComponent(String(post?._id || ""));
  const encodedSlug = encodeURIComponent(String(post?.slug || ""));
  return encodedId
    ? `post.html?id=${encodedId}${encodedSlug ? `&slug=${encodedSlug}` : ""}`
    : `post.html?slug=${encodedSlug}`;
}

function clearFeaturedRotationTimer() {
  if (!featuredRotationTimer) return;
  clearInterval(featuredRotationTimer);
  featuredRotationTimer = null;
}

function createFeaturedRotator(posts) {
  const featuredPosts = Array.isArray(posts) ? posts.slice(0, 6) : [];
  if (!featuredPosts.length) return null;

  const section = document.createElement("section");
  section.className = "featured-rotator";
  section.setAttribute("aria-label", "Featured posts");

  const track = document.createElement("div");
  track.className = "featured-rotator-track";

  const dots = document.createElement("div");
  dots.className = "featured-rotator-dots";

  const progress = document.createElement("div");
  progress.className = "featured-rotator-progress";
  const progressFill = document.createElement("span");
  progressFill.className = "featured-rotator-progress-fill";
  progress.appendChild(progressFill);

  const slideElements = [];
  const dotElements = [];

  featuredPosts.forEach((post, index) => {
    const slide = document.createElement("a");
    slide.className = "featured-rotator-slide";
    slide.href = getPostHref(post);
    slide.setAttribute("aria-hidden", index === 0 ? "false" : "true");

    const imageUrl = toSafeHttpUrl(getPostImageUrl(post));
    const date = new Date(post.createdAt).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric"
    });
    const safeTitle = escapeHtml(post.title || "Untitled");
    const safeAuthor = escapeHtml(post.author || "");
    const authorText = safeAuthor ? `By ${safeAuthor} • ` : "";

    slide.innerHTML = `
      ${imageUrl ? `<img src="${imageUrl}" alt="${safeTitle}" class="featured-rotator-image" loading="lazy" decoding="async">` : '<div class="featured-rotator-image" style="background: var(--bg-secondary);"></div>'}
      <div class="featured-rotator-overlay">
        <span class="featured-rotator-badge">Featured</span>
        <h2 class="featured-rotator-title">${safeTitle}</h2>
        <span class="featured-rotator-meta">${authorText}${date}</span>
      </div>
    `;

    track.appendChild(slide);
    slideElements.push(slide);

    const dot = document.createElement("button");
    dot.type = "button";
    dot.className = "featured-rotator-dot";
    dot.setAttribute("aria-label", `Show featured post ${index + 1}`);
    dot.setAttribute("aria-current", index === 0 ? "true" : "false");
    dot.addEventListener("click", () => {
      setActiveSlide(index);
      restartTimer();
    });

    dots.appendChild(dot);
    dotElements.push(dot);
  });

  section.appendChild(track);
  if (featuredPosts.length > 1) {
    track.appendChild(progress);
    section.appendChild(dots);
  }

  let activeIndex = 0;

  function setActiveSlide(nextIndex) {
    activeIndex = (nextIndex + slideElements.length) % slideElements.length;
    slideElements.forEach((slide, index) => {
      slide.classList.toggle("is-active", index === activeIndex);
      slide.setAttribute("aria-hidden", index === activeIndex ? "false" : "true");
    });
    dotElements.forEach((dot, index) => {
      dot.classList.toggle("is-active", index === activeIndex);
      dot.setAttribute("aria-current", index === activeIndex ? "true" : "false");
    });

    if (slideElements.length > 1) {
      progressFill.style.transition = "none";
      progressFill.style.width = "0%";
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          progressFill.style.transition = `width ${FEATURED_ROTATION_MS}ms linear`;
          progressFill.style.width = "100%";
        });
      });
    }
  }

  function restartTimer() {
    clearFeaturedRotationTimer();
    if (slideElements.length <= 1) return;
    featuredRotationTimer = setInterval(() => {
      const isConnected = document.body.contains(section);
      if (!isConnected) {
        clearFeaturedRotationTimer();
        return;
      }
      setActiveSlide(activeIndex + 1);
    }, FEATURED_ROTATION_MS);
  }

  setActiveSlide(0);
  restartTimer();

  return section;
}

function createPostCard(post) {
  const card = document.createElement("a");
  card.href = getPostHref(post);
  card.className = "post-card";

  const imageUrl = toSafeHttpUrl(getPostImageUrl(post));
  const date = new Date(post.createdAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
  const safeTitle = escapeHtml(post.title || "Untitled");
  const safeExcerpt = escapeHtml(getDisplayExcerpt(post, 130));
  const safeAuthor = escapeHtml(post.author || "");
  const authorText = safeAuthor ? `By ${safeAuthor} • ` : "";
  const categoryText = Array.isArray(post.categories) && post.categories.length
    ? post.categories.map(category => escapeHtml(normalizeCategoryLabel(category))).join(" · ")
    : "";

  card.innerHTML = `
    ${imageUrl ? `<img src="${imageUrl}" alt="${safeTitle}" class="post-card-image" loading="lazy" decoding="async">` : '<div class="post-card-image" style="background: var(--bg-secondary);"></div>'}
    <div class="post-card-content">
      <h3 class="post-card-title">${safeTitle}</h3>
      ${categoryText ? `<div class="post-card-categories">${categoryText}</div>` : ""}
      <p class="post-card-excerpt">${safeExcerpt}</p>
      <span class="post-card-meta">${authorText}${date}</span>
    </div>
  `;

  return card;
}

function ensureCategoryVisibleCount(category) {
  if (!categoryVisibleCounts.has(category)) {
    categoryVisibleCounts.set(category, HOME_BASE_VISIBLE_COUNT);
  }
  return categoryVisibleCounts.get(category);
}

function resetHomePaginationState() {
  latestVisibleCount = HOME_BASE_VISIBLE_COUNT;
  latestPaginationMode = "expand";
  categoryVisibleCounts.clear();
  categoryPaginationModes.clear();
}

function createShowMoreButton(onClick) {
  return createPaginationToggleButton("Show more", onClick);
}

function createPaginationToggleButton(label, onClick, className = "") {
  const wrap = document.createElement("div");
  wrap.className = "show-more-wrap";

  const button = document.createElement("button");
  button.type = "button";
  button.className = `show-more-btn ${className}`.trim();
  button.textContent = label;
  button.addEventListener("click", onClick);

  wrap.appendChild(button);
  return wrap;
}

function createLatestPaginationControls(totalCount, rerender = renderHomeSections) {
  if (totalCount <= HOME_BASE_VISIBLE_COUNT) return null;

  const isCollapsing = latestPaginationMode === "collapse" && latestVisibleCount > HOME_BASE_VISIBLE_COUNT;
  const buttonText = isCollapsing ? "Show less" : "Show more";
  const buttonClass = isCollapsing ? "show-less-btn" : "";

  return createPaginationToggleButton(buttonText, () => {
    if (isCollapsing) {
      latestVisibleCount = Math.max(HOME_BASE_VISIBLE_COUNT, latestVisibleCount - HOME_TOGGLE_STEP);
      latestPaginationMode = latestVisibleCount > HOME_BASE_VISIBLE_COUNT ? "collapse" : "expand";
    } else {
      latestVisibleCount = Math.min(totalCount, latestVisibleCount + HOME_TOGGLE_STEP);
      latestPaginationMode = latestVisibleCount >= totalCount ? "collapse" : "expand";
    }

    rerender();
  }, buttonClass);
}

function getAllCategories(posts) {
  const unique = new Set();
  posts.forEach(post => {
    if (!Array.isArray(post.categories)) return;
    post.categories.forEach(category => {
      const value = normalizeCategoryLabel(category);
      if (value) unique.add(value);
    });
  });
  return [...unique].sort((a, b) => a.localeCompare(b));
}

function postMatchesSelectedCategories(post) {
  if (!selectedCategoryFilters.size) return true;
  const postCategories = Array.isArray(post.categories) ? post.categories : [];
  return postCategories.some(category => selectedCategoryFilters.has(normalizeCategoryLabel(category)));
}

function getPostsWithActiveFilters(posts) {
  return posts.filter(post => postMatchesSelectedCategories(post));
}

function renderFilterSidebar(categories) {
  const filtersContainer = document.getElementById("category-filters");
  const clearButton = document.getElementById("clear-filters");
  if (!filtersContainer) return;

  const isAuthorPage = !!document.getElementById("author-page") && !document.getElementById("home");

  const rerenderCurrentListing = () => {
    const searchInput = document.getElementById("search-input");
    const query = normalizeSearchText(searchInput?.value || "");

    if (isAuthorPage) {
      if (typeof authorPageRenderCallback === "function") {
        authorPageRenderCallback();
      }
      return;
    }

    if (query) {
      filterPosts(query);
    } else {
      renderHomeSections();
    }
  };

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

        latestVisibleCount = HOME_BASE_VISIBLE_COUNT;
        latestPaginationMode = "expand";
        searchVisibleCount = POSTS_PAGE_SIZE;
        categoryVisibleCounts.clear();
        categoryPaginationModes.clear();
        rerenderCurrentListing();
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
      latestVisibleCount = HOME_BASE_VISIBLE_COUNT;
      latestPaginationMode = "expand";
      searchVisibleCount = POSTS_PAGE_SIZE;
      categoryVisibleCounts.clear();
      categoryPaginationModes.clear();
      renderFilterSidebar(getAllCategories(allPosts));
      rerenderCurrentListing();
    };
  }
}

function renderHomeSections() {
  const renderVersion = ++homeRenderVersion;
  const container = document.getElementById("home");
  if (!container) return;

  clearFeaturedRotationTimer();

  container.className = "home-sections";
  container.innerHTML = "";

  const categories = getAllCategories(allPosts);
  const filteredPosts = getPostsWithActiveFilters(allPosts);

  if (!filteredPosts.length) {
    container.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 40px 0;">No posts match selected filters.</div>';
    return;
  }

  const hasActiveCategoryFilter = selectedCategoryFilters.size > 0;
  const latestSorted = getSortedPosts(filteredPosts);

  if (!hasActiveCategoryFilter) {
    const manualFeatured = latestSorted
      .filter(post => !!post?.featuredManual)
      .sort((a, b) => new Date(b.featuredAddedAt || 0) - new Date(a.featuredAddedAt || 0));

    const featuredById = new Set();
    const featuredCombined = [];

    manualFeatured.forEach(post => {
      const key = String(post?._id || "");
      if (!key || featuredById.has(key) || featuredCombined.length >= 6) return;
      featuredById.add(key);
      featuredCombined.push(post);
    });

    latestSorted.forEach(post => {
      const key = String(post?._id || "");
      if (!key || featuredById.has(key) || featuredCombined.length >= 6) return;
      featuredById.add(key);
      featuredCombined.push(post);
    });

    const featuredRotator = createFeaturedRotator(featuredCombined);
    if (featuredRotator) {
      container.appendChild(featuredRotator);
    }
  }

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

  latestVisibleCount = Math.min(Math.max(latestVisibleCount, HOME_BASE_VISIBLE_COUNT), latestSorted.length);
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

  setTimeout(() => {
    if (renderVersion !== homeRenderVersion) return;

    categoriesToRender.forEach(category => {
      const postsInCategoryAll = getSortedPosts(
        allPosts.filter(post => Array.isArray(post.categories) && post.categories.includes(category))
      );

      const isSelectedCategory = selectedCategoryFilters.has(category);
      const visibleCount = isSelectedCategory
        ? postsInCategoryAll.length
        : ensureCategoryVisibleCount(category);
      const currentVisibleCount = Math.min(Math.max(visibleCount, HOME_BASE_VISIBLE_COUNT), postsInCategoryAll.length);
      const postsInCategory = postsInCategoryAll.slice(0, currentVisibleCount);

      if (!isSelectedCategory && !categoryPaginationModes.has(category)) {
        categoryPaginationModes.set(category, "expand");
      }

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

      if (!isSelectedCategory && postsInCategoryAll.length > HOME_BASE_VISIBLE_COUNT) {
        const mode = categoryPaginationModes.get(category) === "collapse" && currentVisibleCount > HOME_BASE_VISIBLE_COUNT
          ? "collapse"
          : "expand";

        section.appendChild(createPaginationToggleButton(
          mode === "collapse" ? "Show less" : "Show more",
          () => {
            if (mode === "collapse") {
              const nextCount = Math.max(HOME_BASE_VISIBLE_COUNT, currentVisibleCount - HOME_TOGGLE_STEP);
              categoryVisibleCounts.set(category, nextCount);
              categoryPaginationModes.set(category, nextCount > HOME_BASE_VISIBLE_COUNT ? "collapse" : "expand");
            } else {
              const nextCount = Math.min(postsInCategoryAll.length, currentVisibleCount + HOME_TOGGLE_STEP);
              categoryVisibleCounts.set(category, nextCount);
              categoryPaginationModes.set(category, nextCount >= postsInCategoryAll.length ? "collapse" : "expand");
            }

            renderHomeSections();
          },
          mode === "collapse" ? "show-less-btn" : ""
        ));
      }

      container.appendChild(section);
    });
  }, 0);
}

async function loadPost() {
  const container = document.getElementById("post");
  if (!container) return;

  const params = new URLSearchParams(window.location.search);
  const postId = params.get("id");
  const slug = params.get("slug");

  let post = null;

  const loadFromPublishedList = async () => {
    const listRes = await fetch("/api/posts");
    if (!listRes.ok) return null;
    const posts = await listRes.json();
    if (!Array.isArray(posts)) return null;

    if (postId) {
      const byId = posts.find(item => String(item?._id || "") === String(postId));
      if (byId) return byId;
    }

    if (slug) {
      const bySlug = posts.find(item => String(item?.slug || "") === String(slug));
      if (bySlug) return bySlug;

      const bySlugInsensitive = posts.find(item => String(item?.slug || "").toLowerCase() === String(slug || "").toLowerCase());
      if (bySlugInsensitive) return bySlugInsensitive;
    }

    return null;
  };

  let res = null;
  if (postId) {
    res = await fetch("/api/posts/by-id/" + encodeURIComponent(postId));
    if (res.ok) {
      post = await res.json();
    }
  }

  if (!post && slug) {
    res = await fetch("/api/posts/by-slug?slug=" + encodeURIComponent(slug));
    if (res.ok) {
      post = await res.json();
    }
  }

  if (!post) {
    post = await loadFromPublishedList();
  }

  if (!post) {
    container.innerHTML = '<p style="color: var(--text-muted);">Post not found.</p>';
    return;
  }

  currentPostId = post._id;
  const heroImage = post.content?.find(b => b.type === "image");

  const bodyHtml = post.content?.map(block => {
    if (block === heroImage) return "";

    if (block.type === "paragraph") {
      return renderParagraphBlock(block.data?.text || "");
    }

    if (block.type === "header") {
      const levelRaw = Number(block.data?.level || 2);
      const level = Math.min(Math.max(levelRaw, 2), 3);
      const text = String(block.data?.text || "").replace(/<[^>]*>/g, " ").trim();
      if (!text) return "";
      const safeText = escapeHtml(text);
      const headingId = toHeadingId(text, "section");
      return `<h${level} id="${headingId}">${safeText}</h${level}>`;
    }

    if (block.type === "image") {
      const imgUrl = toSafeHttpUrl(block.data?.file?.url || 
                     block.data?.url || 
                     block.data?.file);
      if (!imgUrl) return "";
      return `<img src="${imgUrl}" alt="Article image" class="article-image">`;
    }

    if (block.type === "embed" && block.data.service === "youtube") {
      const videoId = extractYouTubeVideoId(block.data?.source);
      if (!videoId) return "";
      return `
        <div class="article-embed">
          <iframe
            src="https://www.youtube.com/embed/${videoId}"
            allowfullscreen>
          </iframe>
        </div>
      `;
    }

    if (block.type === "embed" && block.data?.service === "twitter") {
      const twitterUrl = extractTwitterStatusUrl(block.data?.source || block.data?.embed || "");
      if (!twitterUrl) return "";
      const safeUrl = escapeHtml(twitterUrl);
      return `
        <div class="article-embed article-embed-tweet">
          <blockquote class="twitter-tweet">
            <a href="${safeUrl}">${safeUrl}</a>
          </blockquote>
        </div>
      `;
    }

    if (block.type === "quote") {
      const rawQuoteText = String(block.data?.text || "");
      const quoteCaption = escapeHtml(block.data?.caption || "");
      const normalizedQuoteText = rawQuoteText
        .replace(/\r\n/g, "\n")
        .replace(/<br\b[^>]*>/gi, "\n")
        .trim();

      if (!normalizedQuoteText) return "";

      const hasParagraphBreaks = /\n\s*\n+/.test(normalizedQuoteText);
      let quoteTextHtml = "";

      if (hasParagraphBreaks) {
        quoteTextHtml = normalizedQuoteText
          .split(/\n\s*\n+/)
          .map(part => part.replace(/\n+/g, " ").replace(/\s+/g, " ").trim())
          .filter(Boolean)
          .map(part => `<p>${renderLinkedText(part)}</p>`)
          .join("");
      } else {
        quoteTextHtml = `<p>${renderLinkedText(normalizedQuoteText).replace(/\n/g, "<br>")}</p>`;
      }

      return `
        <blockquote class="article-quote">
          ${quoteTextHtml}
          ${quoteCaption ? `<cite>${quoteCaption}</cite>` : ""}
        </blockquote>
      `;
    }

    return "";
  }).join("") || "";

  const date = new Date(post.createdAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const safePostTitle = escapeHtml(post.title || "Untitled");
  const metaParts = [];

  if (post.author) {
    const authorName = escapeHtml(post.author);
    const authorHref = `/author.html?author=${encodeURIComponent(String(post.author || "").trim())}`;
    metaParts.push(`By <a class="article-meta-author" href="${authorHref}">${authorName}</a>`);
  }

  if (Array.isArray(post.categories) && post.categories.length) {
    metaParts.push(post.categories.map(category => escapeHtml(category)).join(" · "));
  }

  metaParts.push(date);

  const metaHtml = metaParts
    .map(part => `<span>${part}</span>`)
    .join('<span aria-hidden="true">|</span>');

  const heroUrl = toSafeHttpUrl(
    heroImage?.data?.file?.url ||
    heroImage?.data?.url ||
    heroImage?.data?.file ||
    getPostImageUrl(post)
  );

  const articleUrl = toSafeHttpUrl(window.location.href);
  const fallbackDescription = bodyHtml
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);

  applyPostSeo(post, {
    url: articleUrl,
    imageUrl: heroUrl || toSafeHttpUrl(DEFAULT_POST_IMAGE),
    fallbackDescription
  });

  container.innerHTML = `
    <h1>${safePostTitle}</h1>
    ${heroUrl ? `<img src="${heroUrl}" alt="${safePostTitle}" class="article-image">` : ""}
    <div class="article-meta">
      ${metaHtml}
    </div>
    <div class="article-reading-time" aria-label="Estimated reading time">⏱ ${estimateReadingMinutesFromHtml(bodyHtml)} min read</div>
    <nav id="article-toc" class="article-toc" aria-label="Table of contents" hidden>
      <h3>On this page</h3>
      <ol id="article-toc-list" class="article-toc-list"></ol>
    </nav>
    <div class="article-summary-tools">
      <button type="button" id="article-generate-summary" class="article-summary-btn">Generate Summary</button>
    </div>
    <div id="article-summary-box" class="article-summary-box" hidden>
      <div class="article-summary-title">AI Summary</div>
      <p id="article-summary" class="article-summary"></p>
    </div>
    <div class="article-content">
      ${bodyHtml}
    </div>
  `;

  const summaryButton = container.querySelector("#article-generate-summary");
  const summaryBox = container.querySelector("#article-summary-box");
  const summaryElement = container.querySelector("#article-summary");
  const summaryId = String(post?._id || post?.slug || "").trim();
  const summaryLockKey = `article-summary-locked:${summaryId}`;
  const summaryTextKey = `article-summary-text:${summaryId}`;

  renderArticleToc(container);
  initializeReadingProgress();
  trackPostView(post);

  function setSummaryMessage(message, isError = false) {
    if (!summaryElement) return;
    summaryElement.textContent = message;
    summaryElement.classList.toggle("is-error", Boolean(isError));
    if (summaryBox) summaryBox.hidden = false;
  }

  try {
    const isLocked = summaryId && localStorage.getItem(summaryLockKey) === "1";
    const savedSummary = localStorage.getItem(summaryTextKey) || "";
    if (savedSummary && summaryElement) {
      setSummaryMessage(savedSummary, false);
    }

    if (isLocked && savedSummary && summaryButton) {
      summaryButton.disabled = true;
      summaryButton.textContent = "Summary Generated";
    }
  } catch {
  }

  summaryButton?.addEventListener("click", async () => {
    if (!summaryElement || !summaryButton) return;
    if (summaryButton.disabled) return;

    summaryButton.disabled = true;
    summaryButton.textContent = "Generating...";
    summaryElement.classList.remove("is-error");

    try {
      const response = await fetch("/api/posts/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: post._id, slug: post.slug })
      });

      if (!response.ok) {
        throw new Error("summary-request-failed");
      }

      const payload = await response.json().catch(() => ({}));
      const summary = String(payload?.summary || "").trim();
      if (!summary) {
        throw new Error("summary-not-ai");
      }

      setSummaryMessage(summary, false);
      summaryButton.textContent = "Summary Generated";

      try {
        if (summaryId) {
          localStorage.setItem(summaryLockKey, "1");
          localStorage.setItem(summaryTextKey, summary);
        }
      } catch {
      }
    } catch {
      setSummaryMessage("Can't generate summary right now.", true);
      summaryButton.disabled = false;
      summaryButton.textContent = "Generate Summary";

      try {
        if (summaryId) {
          localStorage.removeItem(summaryLockKey);
          localStorage.removeItem(summaryTextKey);
        }
      } catch {
      }
    }
  });

  loadTwitterWidgets(container);

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

    const canDelete = currentUser && ((currentUser.role === "admin" || currentUser.role === "staff") || currentUser._id === comment.userId);

    const authorWrap = document.createElement("div");
    authorWrap.className = "comment-author";

    if (comment.authorAvatar) {
      const avatar = document.createElement("img");
      avatar.src = comment.authorAvatar;
      avatar.alt = comment.authorName || "User avatar";
      authorWrap.appendChild(avatar);
    }

    const identity = document.createElement("div");
    const authorName = document.createElement("strong");
    authorName.textContent = comment.authorName || "User";
    const createdAt = document.createElement("span");
    createdAt.textContent = date;
    identity.appendChild(authorName);
    identity.appendChild(createdAt);
    authorWrap.appendChild(identity);

    if (canDelete) {
      const deleteBtn = document.createElement("button");
      deleteBtn.className = "comment-delete";
      deleteBtn.textContent = "Delete";
      deleteBtn.addEventListener("click", () => deleteComment(comment._id));
      authorWrap.appendChild(deleteBtn);
    }

    const text = document.createElement("p");
    text.textContent = comment.text || "";

    item.appendChild(authorWrap);
    item.appendChild(text);
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
    const name = document.createElement("div");
    name.className = "release-item-name";
    name.textContent = String(event.title || "Untitled");
    const meta = document.createElement("div");
    meta.className = "release-item-meta";
    meta.textContent = `${String(event.type || "")}${event.type ? " • " : ""}${formatReleaseDate(event.date)}`;
    item.appendChild(name);
    item.appendChild(meta);

    if (event.slug) {
      item.style.cursor = "pointer";
      item.setAttribute("role", "link");
      item.tabIndex = 0;
      item.addEventListener("click", () => {
        const encodedEventId = encodeURIComponent(String(event.id || ""));
        const encodedEventSlug = encodeURIComponent(String(event.slug || ""));
        window.location.href = encodedEventId
          ? `post.html?id=${encodedEventId}${encodedEventSlug ? `&slug=${encodedEventSlug}` : ""}`
          : `post.html?slug=${encodedEventSlug}`;
      });
      item.addEventListener("keydown", e => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          const encodedEventId = encodeURIComponent(String(event.id || ""));
          const encodedEventSlug = encodeURIComponent(String(event.slug || ""));
          window.location.href = encodedEventId
            ? `post.html?id=${encodedEventId}${encodedEventSlug ? `&slug=${encodedEventSlug}` : ""}`
            : `post.html?slug=${encodedEventSlug}`;
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
      normalizeSearchText(normalizeCategoryLabel(cat)).includes(normalizedQuery)
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
  resetHomePaginationState();
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

function initializeBackToTopButton() {
  const button = document.getElementById("back-to-top");
  if (!button) return;

  const updateVisibility = () => {
    const isVisible = window.scrollY > 320;
    button.classList.toggle("is-visible", isVisible);
    button.setAttribute("aria-hidden", String(!isVisible));
  };

  button.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  window.addEventListener("scroll", updateVisibility, { passive: true });
  updateVisibility();
}

// Load posts on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function() {
    const hasHome = !!document.getElementById("home");
    const hasPost = !!document.getElementById("post");
    const hasAuthorPage = !!document.getElementById("author-page");

    if (hasHome) {
      loadPosts();
      initializeSearch();
      initializeReleaseCalendar();
      initializeMobilePanelToggles();
      initializeBackToTopButton();
    }

    if (hasPost) {
      loadPost();
    }

    if (hasAuthorPage) {
      loadAuthorPage();
      initializeReleaseCalendar();
      initializeMobilePanelToggles();
    }
  });
} else {
  const hasHome = !!document.getElementById("home");
  const hasPost = !!document.getElementById("post");
  const hasAuthorPage = !!document.getElementById("author-page");

  if (hasHome) {
    loadPosts();
    initializeSearch();
    initializeReleaseCalendar();
    initializeMobilePanelToggles();
    initializeBackToTopButton();
  }

  if (hasPost) {
    loadPost();
  }

  if (hasAuthorPage) {
    loadAuthorPage();
    initializeReleaseCalendar();
    initializeMobilePanelToggles();
  }
}
