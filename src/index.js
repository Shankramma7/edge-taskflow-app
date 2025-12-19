async function hashPassword(password) {
  const data = new TextEncoder().encode(password);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const method = req.method;

    /* ROOT REDIRECT */
    if (url.pathname === "/" && method === "GET") {
      return Response.redirect(new URL("/login.html", req.url), 302);
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
      const { email, password } = await req.json();
      const hashed = await hashPassword(password);

      try {
        await env.edge_taskflow_db
          .prepare("INSERT INTO users (email, password) VALUES (?, ?)")
          .bind(email, hashed)
          .run();
      } catch {
        return Response.json(
          { error: "User already exists. Please login." },
          { status: 409, headers }
        );
      }

      return Response.json({ message: "Registered" }, { headers });
    }

    // LOGIN
    if (url.pathname === "/api/auth/login" && method === "POST") {
      const { email, password } = await req.json();
      const hashed = await hashPassword(password);

      const user = await env.edge_taskflow_db
        .prepare("SELECT id FROM users WHERE email=? AND password=?")
        .bind(email, hashed)
        .first();

      if (!user) {
        return Response.json({ error: "Invalid credentials" }, { status: 401, headers });
      }

      const token = crypto.randomUUID();
      await env.TF_SESSIONS.put(token, String(user.id), { expirationTtl: 3600 });

      return Response.json({ token }, { headers });
    }

    // LOGOUT
    if (url.pathname === "/api/auth/logout" && method === "POST") {
      const token = req.headers.get("Authorization");
      if (token) await env.TF_SESSIONS.delete(token);
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

      userId = await env.TF_SESSIONS.get(token);

      if (!userId) {
        return Response.json(
          { error: "Session expired or invalid" },
          { status: 401, headers }
        );
      }
    }
	// AI SUGGESTION (LIVE PREVIEW)
if (url.pathname === "/api/ai/suggest" && method === "POST") {
  const { description } = await req.json();

  if (!description) {
    return Response.json({ suggestion: "" }, { headers });
  }

  let suggestion = "General Task";

  if (env.AI) {
    const aiResult = await env.AI.run(
      "@cf/meta/llama-3-8b-instruct",
      {
        messages: [
          {
            role: "user",
           content: `
From this task description:
"${description}"

Return ONLY one short tag (1–3 words).
No explanation.
`
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

  }

  return Response.json({ suggestion }, { headers });
}
// AI DESCRIPTION SUGGESTION (FROM TITLE)
if (url.pathname === "/api/ai/describe" && method === "POST") {
  const { title, language } = await req.json();

  if (!title) {
    return Response.json({ description: "" }, { headers });
  }

  let description = "";

  if (env.AI) {
  const aiResult = await env.AI.run(
  "@cf/meta/llama-3-8b-instruct",
  {
    messages: [
      {
        role: "system",
        content: `You are a multilingual assistant. You MUST respond ONLY in ${language}.`
      },
      {
        role: "user",
        content: `
Generate a detailed task description based on the title below.

Title:
"${title}"

Rules:
- Write ONLY in ${language}
- Do NOT use English words if ${language} is not English
- Minimum 3 paragraphs
- Maximum 10000 characters
- Professional tone
- Do NOT repeat the title
`
      }
    ]
  }
);

description = aiResult.response
  .replace(/\n{3,}/g, "\n\n")
  .trim()
  .slice(0, 10000);

  }

  return Response.json({ description }, { headers });
}



    /* ================= TASK CRUD ================= */

    // CREATE (WITH WORKERS AI)
    if (url.pathname === "/api/tasks" && method === "POST") {
      const { title, description } = await req.json();

      if (!title || !description) {
        return Response.json(
          { error: "Title and description required" },
          { status: 400, headers }
        );
      }

      // Workers AI tagging
     let tag = "General";

if (env.AI) {
  const aiResult = await env.AI.run(
    "@cf/meta/llama-3-8b-instruct",
    {
      messages: [
        {
          role: "user",
          content: `
From the task description below:
"${description}"

Return ONLY ONE short tag (1–3 words).
No explanation. No sentence. No punctuation.
          `
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
}



      await env.edge_taskflow_db
        .prepare(
          "INSERT INTO tasks (user_id, title, description, tag) VALUES (?, ?, ?, ?)"
        )
        .bind(userId, title, description, tag)
        .run();

      return Response.json({ message: "Task created", tag }, { headers });
    }

    // READ
    if (url.pathname === "/api/tasks" && method === "GET") {
      const tasks = await env.edge_taskflow_db
        .prepare("SELECT * FROM tasks WHERE user_id=? ORDER BY created_at DESC")
        .bind(userId)
        .all();

      return Response.json(tasks.results, { headers });
    }

    // UPDATE
    if (url.pathname.startsWith("/api/tasks/") && method === "PUT") {
      const id = url.pathname.split("/").pop();
      const { title, description } = await req.json();

      await env.edge_taskflow_db
        .prepare(
          "UPDATE tasks SET title=?, description=? WHERE id=? AND user_id=?"
        )
        .bind(title, description, id, userId)
        .run();

      return Response.json({ message: "Task updated" }, { headers });
    }

    // DELETE
    if (url.pathname.startsWith("/api/tasks/") && method === "DELETE") {
      const id = url.pathname.split("/").pop();

      await env.edge_taskflow_db
        .prepare("DELETE FROM tasks WHERE id=? AND user_id=?")
        .bind(id, userId)
        .run();

      return Response.json({ message: "Task deleted" }, { headers });
    }

    return new Response("Not Found", { status: 404 });
  }
};
