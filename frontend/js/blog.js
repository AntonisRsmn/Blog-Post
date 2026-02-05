async function loadPosts() {
  const container = document.getElementById("home");
  if (!container) return;

  const res = await fetch("/api/posts");
  const posts = await res.json();

  container.innerHTML = "";
  if (!posts.length) return;

  posts.forEach((post, index) => {
    const imageBlock = post.content?.find(b => b.type === "image");
    const imageUrl = imageBlock?.data?.file?.url;

    const card = document.createElement("a");
    card.href = `post.html?slug=${post.slug}`;
    card.className = `card ${index === 0 ? "featured" : "small"}`;

    card.innerHTML = `
      ${imageUrl ? `<img src="${imageUrl}" alt="${post.title}">` : ""}
      <div class="card-overlay"></div>
      <div class="card-content">
        <h2>${post.title}</h2>
        <p>${post.excerpt || ""}</p>
      </div>
    `;

    container.appendChild(card);
  });
}

async function loadPost() {
  const container = document.getElementById("post");
  if (!container) return;

  const slug = new URLSearchParams(window.location.search).get("slug");
  const res = await fetch("/api/posts/" + slug);
  const post = await res.json();

  // First image is the hero
  const heroImage = post.content.find(b => b.type === "image");

  const bodyHtml = post.content.map(block => {
    // Skip hero image in body
    if (block === heroImage) return "";

    if (block.type === "paragraph") {
      return `<p>${block.data.text}</p>`;
    }

    if (block.type === "image") {
      return `
        <div class="article-media">
          <img src="${block.data.file.url}" alt="${post.title}">
        </div>
      `;
    }

    if (block.type === "embed" && block.data.service === "youtube") {
      const videoId = block.data.source.split("v=")[1];
      return `
        <div class="article-media">
          <div class="embed">
            <iframe
              src="https://www.youtube.com/embed/${videoId}"
              allowfullscreen>
            </iframe>
          </div>
        </div>
      `;
    }

    return "";
  }).join("");

  container.innerHTML = `
    ${heroImage ? `
      <div class="hero">
        <img src="${heroImage.data.file.url}" alt="${post.title}">
        <div class="hero-overlay"></div>
        <div class="hero-content">
          <h1>${post.title}</h1>
          <div class="meta">
            ${new Date(post.createdAt).toLocaleDateString()}
          </div>
        </div>
      </div>
    ` : `<h1>${post.title}</h1>`}

    ${bodyHtml}
  `;
}

loadPosts();
loadPost();
