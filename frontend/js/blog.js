async function loadPosts() {
  const container = document.getElementById("home");
  if (!container) return;

  const res = await fetch("/api/posts");
  const posts = await res.json();

  posts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  
  console.log("Posts from API:", posts);

  container.innerHTML = "";
  if (!posts.length) {
    container.innerHTML = '<div style="grid-column: span 12; text-align: center; color: var(--text-muted); padding: 40px 0;">No articles published yet.</div>';
    return;
  }

  posts.forEach((post) => {
    console.log("Processing post:", post.title);
    console.log("Content blocks:", post.content);
    
    const imageBlock = post.content?.find(b => b.type === "image");
    console.log("Image block found:", imageBlock);
    
    let imageUrl = null;
    if (imageBlock) {
      // Try multiple possible paths
      imageUrl = imageBlock.data?.file?.url || 
                 imageBlock.data?.url || 
                 imageBlock.data?.file;
      console.log("Image URL resolved to:", imageUrl);
    }

    const card = document.createElement("a");
    card.href = `post.html?slug=${post.slug}`;
    card.className = "post-card";

    const date = new Date(post.createdAt).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });

    const authorText = post.author ? `By ${post.author} • ` : "";
    const categoryText = Array.isArray(post.categories) && post.categories.length
      ? post.categories.join(" · ")
      : "";

    card.innerHTML = `
      ${imageUrl ? `<img src="${imageUrl}" alt="${post.title}" class="post-card-image" onerror="console.log('Image failed to load:', '${imageUrl}')">` : '<div class="post-card-image" style="background: var(--bg-secondary);"></div>'}
      <div class="post-card-content">
        <h3 class="post-card-title">${post.title}</h3>
        ${categoryText ? `<div class="post-card-categories">${categoryText}</div>` : ""}
        <p class="post-card-excerpt">${post.excerpt || 'Read more...'}</p>
        <span class="post-card-meta">${authorText}${date}</span>
      </div>
    `;

    container.appendChild(card);
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
  if (!form || !status) return;

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

// Load posts on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function() {
    loadPosts();
    loadPost();
  });
} else {
  loadPosts();
  loadPost();
}
