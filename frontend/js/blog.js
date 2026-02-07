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

    card.innerHTML = `
      ${imageUrl ? `<img src="${imageUrl}" alt="${post.title}" class="post-card-image" onerror="console.log('Image failed to load:', '${imageUrl}')">` : '<div class="post-card-image" style="background: var(--bg-secondary);"></div>'}
      <div class="post-card-content">
        <h3 class="post-card-title">${post.title}</h3>
        <p class="post-card-excerpt">${post.excerpt || 'Read more...'}</p>
        <span class="post-card-meta">${date}</span>
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

  const heroUrl = heroImage?.data?.file?.url || 
                  heroImage?.data?.url || 
                  heroImage?.data?.file;

  container.innerHTML = `
    ${heroUrl ? `<img src="${heroUrl}" alt="${post.title}" class="article-image">` : ""}
    <h1>${post.title}</h1>
    <div class="article-meta">
      <span>${date}</span>
    </div>
    <div class="article-content">
      ${bodyHtml}
    </div>
  `;
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
