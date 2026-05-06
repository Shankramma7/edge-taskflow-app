async function hashPassword(password) {
  const data = new TextEncoder().encode(password);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

function encodeBase64Url(str) {
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function decodeBase64Url(str) {
  const padding = "=".repeat((4 - str.length % 4) % 4);
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/") + padding;
  return atob(base64);
}

function arrayBufferToBase64Url(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function base64UrlToArrayBuffer(str) {
  const padding = "=".repeat((4 - str.length % 4) % 4);
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/") + padding;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

async function signJWT(payload, secret) {
  const encoder = new TextEncoder();
  const header = { alg: "HS256", typ: "JWT" };
  const encodedHeader = encodeBase64Url(JSON.stringify(header));
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const data = encoder.encode(`${encodedHeader}.${encodedPayload}`);

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", key, data);
  const encodedSignature = arrayBufferToBase64Url(signature);

  return `${encodedHeader}.${encodedPayload}.${encodedSignature}`;
}

async function verifyJWT(token, secret) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid token format");

  const encoder = new TextEncoder();
  const data = encoder.encode(`${parts[0]}.${parts[1]}`);
  const signature = base64UrlToArrayBuffer(parts[2]);

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );

  const valid = await crypto.subtle.verify("HMAC", key, signature, data);
  if (!valid) throw new Error("Invalid token signature");

  const payload = JSON.parse(decodeBase64Url(parts[1]));

  if (payload.exp && Date.now() >= payload.exp * 1000) {
    throw new Error("Token expired");
  }

  return payload;
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const method = req.method;

    /* ROOT REDIRECT */
    if (url.pathname === "/" && method === "GET") {
      return Response.redirect(new URL("/login.html", req.url), 302);
    }

    /* API DOCS REDIRECT */
    if (url.pathname === "/docs" && method === "GET") {
      return Response.redirect(new URL("/swagger-ui.html", req.url), 302);
    }

    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE"
    };

    if (method === "OPTIONS") {
      return new Response(null, { headers });
    }

    /* ================= AUTH ================= */

    // REGISTER
   if (url.pathname === "/api/auth/register" && method === "POST") {

  let body

  try {
    body = await req.json()
  } catch {
    return Response.json(
      { error: "Invalid JSON body" },
      { status: 400, headers }
    )
  }

  const { email, password, token } = body

  // ✅ REQUIRED FIELD VALIDATION
  if (!email || !password) {
    return Response.json(
      { error: "Email and password are required" },
      { status: 400, headers }
    )
  }

  // ✅ EMAIL FORMAT CHECK
  if (!email.includes("@")) {
    return Response.json(
      { error: "Invalid email format" },
      { status: 400, headers }
    )
  }

  // ✅ PASSWORD LENGTH CHECK
  if (password.length < 6) {
    return Response.json(
      { error: "Password must be at least 6 characters" },
      { status: 400, headers }
    )
  }

  /* 🔐 TURNSTILE — COMMENTED OUT FOR API SHIELD / SWAGGER TESTING
  if (!token) {
    return Response.json(
      { error: "Verification token is required" },
      { status: 400, headers }
    )
  }

  try {
    const verifyRes = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: `secret=${env.TURNSTILE_SECRET}&response=${token}`
    });

    const verifyData = await verifyRes.json();

    if (!verifyData.success) {
      return Response.json(
        { error: "Turnstile verification failed" },
        { status: 403, headers }
      );
    }
  } catch (err) {
    console.error("[TURNSTILE VERIFY ERROR]", err)
    return Response.json(
      { error: "Unable to verify CAPTCHA. Please try again." },
      { status: 503, headers }
    )
  }
  */

  // ✅ ONLY NOW hash password
  const hashed = await hashPassword(password)

  try {
    await env.edge_taskflow_db
      .prepare("INSERT INTO users (email, password) VALUES (?, ?)")
      .bind(email, hashed)
      .run()

  } catch (err) {
    if (err?.message?.includes("UNIQUE constraint failed")) {
      return Response.json(
        { error: "User already exists. Please login." },
        { status: 409, headers }
      )
    }
    console.error("[REGISTER DB ERROR]", err)
    return Response.json(
      { error: "Registration failed. Please try again later." },
      { status: 500, headers }
    )
  }

  return Response.json({ message: "Registered successfully" }, { headers })
}

    // LOGIN
    if (url.pathname === "/api/auth/login" && method === "POST") {
      let body
      try {
        body = await req.json()
      } catch {
        return Response.json(
          { error: "Invalid JSON body" },
          { status: 400, headers }
        )
      }

      const { email, password, token } = body

      if (!email || !password) {
        return Response.json(
          { error: "Email and password are required" },
          { status: 400, headers }
        )
      }

      /* 🔐 TURNSTILE — COMMENTED OUT FOR API SHIELD / SWAGGER TESTING
      if (!token) {
        return Response.json(
          { error: "Verification token is required" },
          { status: 400, headers }
        )
      }

      try {
        const verifyRes = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded"
          },
          body: `secret=${env.TURNSTILE_SECRET}&response=${token}`
        });

        const verifyData = await verifyRes.json();

        if (!verifyData.success) {
          return Response.json(
            { error: "Turnstile verification failed" },
            { status: 403, headers }
          );
        }
      } catch (err) {
        console.error("[TURNSTILE VERIFY ERROR]", err)
        return Response.json(
          { error: "Unable to verify CAPTCHA. Please try again." },
          { status: 503, headers }
        )
      }
      */

      // ✅ Login logic
      const hashed = await hashPassword(password);

      let user
      try {
        user = await env.edge_taskflow_db
          .prepare("SELECT id FROM users WHERE email=? AND password=?")
          .bind(email, hashed)
          .first();
      } catch (err) {
        console.error("[LOGIN DB ERROR]", err)
        return Response.json(
          { error: "Login failed. Please try again later." },
          { status: 500, headers }
        )
      }

      if (!user) {
        return Response.json(
          { error: "Invalid email or password" },
          { status: 401, headers }
        );
      }

      const secret = env.SESSION_SECRET;
      if (!secret) {
        console.error("[SESSION_SECRET NOT CONFIGURED]");
        return Response.json(
          { error: "Server configuration error" },
          { status: 500, headers }
        );
      }

      const expiresInSeconds = 3600;
      const payload = {
        userId: user.id,
        exp: Math.floor(Date.now() / 1000) + expiresInSeconds
      };

      let sessionToken;
      try {
        sessionToken = await signJWT(payload, secret);
      } catch (err) {
        console.error("[JWT SIGN ERROR]", err);
        return Response.json(
          { error: "Unable to create session. Please try again." },
          { status: 500, headers }
        );
      }

      return Response.json({ token: sessionToken }, { headers });
    }
    // LOGOUT
    if (url.pathname === "/api/auth/logout" && method === "POST") {
      // JWT sessions are stateless — client discards the token to log out.
      return Response.json({ message: "Logged out" }, { headers });
    }

    /* ================= AUTH GUARD ================= */

    let userId = null;

    if (url.pathname.startsWith("/api/tasks")) {
      const token = req.headers.get("Authorization");

      if (!token) {
        return Response.json(
          { error: "Missing Authorization token" },
          { status: 401, headers }
        );
      }

      const secret = env.SESSION_SECRET;
      if (!secret) {
        console.error("[SESSION_SECRET NOT CONFIGURED]");
        return Response.json(
          { error: "Server configuration error" },
          { status: 500, headers }
        );
      }

      let payload;
      try {
        payload = await verifyJWT(token, secret);
      } catch (err) {
        console.error("[JWT VERIFY ERROR]", err);
        return Response.json(
          { error: "Session expired or invalid" },
          { status: 401, headers }
        );
      }

      userId = payload.userId;
    }
    // AI SUGGESTION (LIVE PREVIEW)
    if (url.pathname === "/api/ai/suggest" && method === "POST") {
      let body
      try {
        body = await req.json()
      } catch {
        return Response.json(
          { error: "Invalid JSON body", suggestion: "" },
          { status: 400, headers }
        )
      }

      const { description } = body

      if (!description) {
        return Response.json({ suggestion: "" }, { headers });
      }

      let suggestion = "General Task";

      if (env.AI) {
        try {
          const aiResult = await env.AI.run(
            "@cf/meta/llama-3-8b-instruct",
            {
              messages: [
                {
                  role: "user",
                  content: `From this task description:\n"${description}"\n\nReturn ONLY one short tag (1–3 words).\nNo explanation.`
                }
              ]
            }
          );

          suggestion = aiResult.response
            .replace(/\n/g, "")
            .replace(/[^a-zA-Z0-9 ]/g, "")
            .split(" ")
            .slice(0, 3)
            .join(" ");
        } catch (err) {
          console.error("[AI SUGGEST ERROR]", err)
          suggestion = "General Task"
        }
      }

      return Response.json({ suggestion }, { headers });
    }

    // AI DESCRIPTION SUGGESTION (FROM TITLE)
    if (url.pathname === "/api/ai/describe" && method === "POST") {
      let body
      try {
        body = await req.json()
      } catch {
        return Response.json(
          { error: "Invalid JSON body", description: "" },
          { status: 400, headers }
        )
      }

      const { title, language } = body

      if (!title) {
        return Response.json({ description: "" }, { headers });
      }

      let description = "";

      if (env.AI) {
        try {
          const aiResult = await env.AI.run(
            "@cf/meta/llama-3-8b-instruct",
            {
              messages: [
                {
                  role: "system",
                  content: `You are a multilingual assistant. You MUST respond ONLY in ${language || "English"}.`
                },
                {
                  role: "user",
                  content: `Generate a detailed task description based on the title below.\n\nTitle:\n"${title}"\n\nRules:\n- Write ONLY in ${language || "English"}\n- Do NOT use English words if ${language || "English"} is not English\n- Minimum 3 paragraphs\n- Maximum 10000 characters\n- Professional tone\n- Do NOT repeat the title`
                }
              ]
            }
          );

          description = aiResult.response
            .replace(/\n{3,}/g, "\n\n")
            .trim()
            .slice(0, 10000);
        } catch (err) {
          console.error("[AI DESCRIBE ERROR]", err)
          description = ""
        }
      }

      return Response.json({ description }, { headers });
    }



    /* ================= TASK CRUD ================= */

    // CREATE (WITH WORKERS AI)
    if (url.pathname === "/api/tasks" && method === "POST") {
      let body
      try {
        body = await req.json()
      } catch {
        return Response.json(
          { error: "Invalid JSON body" },
          { status: 400, headers }
        )
      }

      const { title, description } = body

      if (!title || !description) {
        return Response.json(
          { error: "Title and description are required" },
          { status: 400, headers }
        );
      }

      let tag = "General";

      if (env.AI) {
        try {
          const aiResult = await env.AI.run(
            "@cf/meta/llama-3-8b-instruct",
            {
              messages: [
                {
                  role: "user",
                  content: `From the task description below:\n"${description}"\n\nReturn ONLY ONE short tag (1–3 words).\nNo explanation. No sentence. No punctuation.`
                }
              ]
            }
          );

          tag = aiResult.response
            .replace(/\n/g, "")
            .replace(/[^a-zA-Z0-9 ]/g, "")
            .split(" ")
            .slice(0, 3)
            .join(" ");
        } catch (err) {
          console.error("[AI TAG ERROR]", err)
          tag = "General"
        }
      }

      try {
        await env.edge_taskflow_db
          .prepare(
            "INSERT INTO tasks (user_id, title, description, tag) VALUES (?, ?, ?, ?)"
          )
          .bind(userId, title, description, tag)
          .run();
      } catch (err) {
        console.error("[TASK CREATE ERROR]", err)
        return Response.json(
          { error: "Failed to create task. Please try again." },
          { status: 500, headers }
        )
      }

      return Response.json({ message: "Task created", tag }, { headers });
    }

    // READ
    if (url.pathname === "/api/tasks" && method === "GET") {
      try {
        const tasks = await env.edge_taskflow_db
          .prepare("SELECT * FROM tasks WHERE user_id=? ORDER BY created_at DESC")
          .bind(userId)
          .all();

        return Response.json(tasks.results || [], { headers });
      } catch (err) {
        console.error("[TASK READ ERROR]", err)
        return Response.json(
          { error: "Failed to load tasks. Please try again." },
          { status: 500, headers }
        )
      }
    }

    // UPDATE
    if (url.pathname.startsWith("/api/tasks/") && method === "PUT") {
      let body
      try {
        body = await req.json()
      } catch {
        return Response.json(
          { error: "Invalid JSON body" },
          { status: 400, headers }
        )
      }

      const id = url.pathname.split("/").pop();
      const { title, description } = body;

      if (!id || isNaN(Number(id))) {
        return Response.json(
          { error: "Invalid task ID" },
          { status: 400, headers }
        );
      }

      if (!title || !description) {
        return Response.json(
          { error: "Title and description are required" },
          { status: 400, headers }
        );
      }

      let result;
      try {
        result = await env.edge_taskflow_db
          .prepare(
            "UPDATE tasks SET title=?, description=? WHERE id=? AND user_id=?"
          )
          .bind(title, description, Number(id), userId)
          .run();
      } catch (err) {
        console.error("[TASK UPDATE ERROR]", err)
        return Response.json(
          { error: "Failed to update task. Please try again." },
          { status: 500, headers }
        )
      }

      if (result.meta.changes === 0) {
        return Response.json(
          { error: "Task not found or access denied" },
          { status: 404, headers }
        );
      }

      return Response.json({ message: "Task updated" }, { headers });
    }

    // DELETE
    if (url.pathname.startsWith("/api/tasks/") && method === "DELETE") {
      const id = url.pathname.split("/").pop();

      if (!id || isNaN(Number(id))) {
        return Response.json(
          { error: "Invalid task ID" },
          { status: 400, headers }
        );
      }

      let result;
      try {
        result = await env.edge_taskflow_db
          .prepare("DELETE FROM tasks WHERE id=? AND user_id=?")
          .bind(Number(id), userId)
          .run();
      } catch (err) {
        console.error("[TASK DELETE ERROR]", err)
        return Response.json(
          { error: "Failed to delete task. Please try again." },
          { status: 500, headers }
        )
      }

      if (result.meta.changes === 0) {
        return Response.json(
          { error: "Task not found or access denied" },
          { status: 404, headers }
        );
      }

      return Response.json({ message: "Task deleted" }, { headers });
    }

    /* ================= PAYMENT MOCK (Schema Validation Demo) ================= */

    // INITIATE PAYMENT
    if (url.pathname === "/api/payments" && method === "POST") {
      let body;
      try {
        body = await req.json();
      } catch {
        return Response.json(
          { error: "Invalid JSON body" },
          { status: 400, headers }
        );
      }

      const { amount, currency, orderId, customerEmail } = body;

      if (!amount || !currency || !orderId) {
        return Response.json(
          { error: "Amount, currency, and orderId are required" },
          { status: 400, headers }
        );
      }

      const paymentId = "PAY-" + crypto.randomUUID();
      const payment = {
        paymentId,
        status: "PENDING",
        amount: Number(amount),
        currency,
        orderId,
        customerEmail: customerEmail || null,
        createdAt: new Date().toISOString(),
        confirmedAt: null
      };

      try {
        await env.TF_SESSIONS.put(
          `payment:${paymentId}`,
          JSON.stringify(payment),
          { expirationTtl: 86400 }
        );
      } catch (err) {
        console.error("[PAYMENT MOCK STORE ERROR]", err);
        return Response.json(
          { error: "Failed to store mock payment" },
          { status: 500, headers }
        );
      }

      return Response.json(payment, { headers });
    }

    // GET PAYMENT STATUS
    if (url.pathname.startsWith("/api/payments/") && method === "GET") {
      const segments = url.pathname.split("/");
      const paymentId = segments[3];

      if (!paymentId || !paymentId.startsWith("PAY-")) {
        return Response.json(
          { error: "Invalid payment ID" },
          { status: 400, headers }
        );
      }

      const paymentRaw = await env.TF_SESSIONS.get(`payment:${paymentId}`);
      if (!paymentRaw) {
        return Response.json(
          { error: "Payment not found" },
          { status: 404, headers }
        );
      }

      return Response.json(JSON.parse(paymentRaw), { headers });
    }

    // CONFIRM PAYMENT
    if (
      url.pathname.startsWith("/api/payments/") &&
      method === "POST" &&
      url.pathname.endsWith("/confirm")
    ) {
      const segments = url.pathname.split("/");
      const paymentId = segments[3];

      if (!paymentId || !paymentId.startsWith("PAY-")) {
        return Response.json(
          { error: "Invalid payment ID" },
          { status: 400, headers }
        );
      }

      const paymentRaw = await env.TF_SESSIONS.get(`payment:${paymentId}`);
      if (!paymentRaw) {
        return Response.json(
          { error: "Payment not found" },
          { status: 404, headers }
        );
      }

      const payment = JSON.parse(paymentRaw);
      if (payment.status === "CONFIRMED") {
        return Response.json(
          { error: "Payment already confirmed" },
          { status: 409, headers }
        );
      }

      payment.status = "CONFIRMED";
      payment.confirmedAt = new Date().toISOString();

      try {
        await env.TF_SESSIONS.put(
          `payment:${paymentId}`,
          JSON.stringify(payment),
          { expirationTtl: 86400 }
        );
      } catch (err) {
        console.error("[PAYMENT CONFIRM ERROR]", err);
        return Response.json(
          { error: "Failed to confirm payment" },
          { status: 500, headers }
        );
      }

      return Response.json(payment, { headers });
    }

    return new Response("Not Found", { status: 404 });
  }
};
