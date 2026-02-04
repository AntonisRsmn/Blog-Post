document.getElementById("loginForm")?.addEventListener("submit", async e => {
  e.preventDefault();

  const password = document.getElementById("password").value;

  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password })
  });

  if (!res.ok) {
    document.getElementById("error").textContent = "Invalid password";
    return;
  }

  alert("Logged in (token stored by server)");
});
