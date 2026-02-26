import "dotenv/config";
import assert from "node:assert/strict";
import test from "node:test";

const BASE_URL = String(process.env.SMOKE_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const ADMIN_EMAIL = String(process.env.SMOKE_ADMIN_EMAIL || "").trim().toLowerCase();
const ADMIN_PASSWORD = String(process.env.SMOKE_ADMIN_PASSWORD || "");
const LOCKOUT_ATTEMPTS = Number.parseInt(String(process.env.LOGIN_MAX_ATTEMPTS || "5"), 10) || 5;

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

async function apiFetch(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  return { res, body };
}

function requireAdminEnv() {
  assert.ok(ADMIN_EMAIL, "Missing env var: SMOKE_ADMIN_EMAIL");
  assert.ok(ADMIN_PASSWORD, "Missing env var: SMOKE_ADMIN_PASSWORD");
}

function getCookieFromLoginResponse(res) {
  const setCookie = res.headers.get("set-cookie") || "";
  const cookie = setCookie.split(";")[0];
  assert.ok(cookie && cookie.includes("="), "Login did not return auth cookie");
  return cookie;
}

test("smoke: admin login succeeds and returns auth cookie", async () => {
  requireAdminEnv();

  const { res, body } = await apiFetch("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
  });

  assert.equal(res.status, 200, `Expected 200, got ${res.status} with ${JSON.stringify(body)}`);
  assert.equal(body?.success, true, `Expected success true, got ${JSON.stringify(body)}`);
  getCookieFromLoginResponse(res);
});

test("smoke: lockout triggers after repeated invalid logins", async () => {
  const unique = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const email = normalizeEmail(`smoke-lockout-${unique}@example.com`);
  const goodPassword = "Smoke!234";

  const signup = await apiFetch("/api/auth/signup", {
    method: "POST",
    body: JSON.stringify({
      firstName: "Smoke",
      lastName: "Lockout",
      email,
      password: goodPassword
    })
  });

  assert.equal(signup.res.status, 200, `Signup failed: ${signup.res.status} ${JSON.stringify(signup.body)}`);

  for (let i = 0; i < LOCKOUT_ATTEMPTS; i += 1) {
    const wrong = await apiFetch("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password: `Wrong!${i}Pass1` })
    });

    assert.equal(
      wrong.res.status,
      401,
      `Wrong attempt ${i + 1} expected 401, got ${wrong.res.status} with ${JSON.stringify(wrong.body)}`
    );
  }

  const locked = await apiFetch("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password: "Wrong!AfterLock1" })
  });

  assert.equal(
    locked.res.status,
    423,
    `Expected 423 after lockout threshold, got ${locked.res.status} with ${JSON.stringify(locked.body)}`
  );
  assert.match(String(locked.body?.error || ""), /locked/i, "Expected lockout error message");
});

test("smoke: self-remove admin is blocked", async () => {
  requireAdminEnv();

  const login = await apiFetch("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
  });

  assert.equal(login.res.status, 200, `Login failed: ${login.res.status} ${JSON.stringify(login.body)}`);
  const cookie = getCookieFromLoginResponse(login.res);

  const attempt = await apiFetch(`/api/staff/${encodeURIComponent(ADMIN_EMAIL)}`, {
    method: "DELETE",
    headers: {
      Cookie: cookie
    }
  });

  assert.equal(
    attempt.res.status,
    400,
    `Expected 400 for self-remove block, got ${attempt.res.status} with ${JSON.stringify(attempt.body)}`
  );
  assert.match(
    String(attempt.body?.error || ""),
    /cannot remove your own admin access/i,
    "Expected self-remove blocked message"
  );
});

test("smoke: env-admin demotion is blocked", async () => {
  requireAdminEnv();

  const login = await apiFetch("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
  });

  assert.equal(login.res.status, 200, `Login failed: ${login.res.status} ${JSON.stringify(login.body)}`);
  const cookie = getCookieFromLoginResponse(login.res);

  const attempt = await apiFetch("/api/staff", {
    method: "POST",
    headers: {
      Cookie: cookie
    },
    body: JSON.stringify({ email: ADMIN_EMAIL, role: "staff" })
  });

  assert.equal(
    attempt.res.status,
    400,
    `Expected 400 for env-admin demotion block, got ${attempt.res.status} with ${JSON.stringify(attempt.body)}`
  );
  assert.match(
    String(attempt.body?.error || ""),
    /managed by STAFF_EMAILS/i,
    "Expected env-admin managed message"
  );
});
