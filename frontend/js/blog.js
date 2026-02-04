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
      ${imageUrl ? `<img src="${imageUrl}">` : ""}
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

  let heroImage = post.content.find(b => b.type === "image");

  let bodyHtml = post.content.map(block => {
    if (block.type === "paragraph") {
      return `<p>${block.data.text}</p>`;
    }

    if (block.type === "image") {
      return `<img src="${block.data.file.url}" />`;
    }

    if (block.type === "embed" && block.data.service === "youtube") {
      return `
        <div class="embed">
          <iframe
            src="https://www.youtube.com/embed/${block.data.source.split("v=")[1]}"
            allowfullscreen>
          </iframe>
        </div>
      `;
    }

    return "";
  }).join("");

  container.innerHTML = `
    ${heroImage ? `
      <div class="hero">
        <img src="${heroImage.data.file.url}">
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
