document.getElementById("loginForm")?.addEventListener("submit", async e => {
  e.preventDefault();

  const email = document.getElementById("email")?.value;
  const password = document.getElementById("password").value;

  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });

  if (!res.ok) {
    document.getElementById("error").textContent = "Invalid password";
    return;
  }

  const profileRes = await fetch(`${API_BASE}/auth/profile`);
  if (!profileRes.ok) {
    window.location.href = "/admin/login.html";
    return;
  }

  const profile = await profileRes.json();
  const isAdminRole = profile.role === "admin" || profile.role === "staff";
  window.location.href = isAdminRole ? "/admin/dashboard.html" : "/admin/profile.html";
});
