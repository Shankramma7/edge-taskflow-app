const API = "/api";
let cachedTasks = [];


/* ================= AUTH GUARD ================= */

if (!localStorage.getItem("token") && location.pathname.includes("dashboard")) {
  location.href = "/login.html";
}

/* ================= AUTH ================= */

async function register() {
  const token = document.querySelector('[name="cf-turnstile-response"]').value;

  if (!token) {
    alert("Please complete verification");
    return;
  }

  const res = await fetch(API + "/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: email.value,
      password: password.value,
      token: token
    })
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    alert(data.error || "Registration failed. Please try again.");
    if (typeof turnstile !== "undefined") turnstile.reset();
    return;
  }

  location.href = "/login.html";
}

async function login() {
  const token = document.querySelector('[name="cf-turnstile-response"]').value;

  if (!token) {
    alert("Please complete verification");
    return;
  }

  const res = await fetch(API + "/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: email.value,
      password: password.value,
      token: token
    })
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    alert(data.error || "Login failed. Please try again.");
    if (typeof turnstile !== "undefined") turnstile.reset();
    return;
  }

  const data = await res.json();
  localStorage.setItem("token", data.token);
  location.href = "/dashboard.html";
}

async function logout() {
  await fetch(API + "/auth/logout", {
    method: "POST",
    headers: {
      Authorization: localStorage.getItem("token")
    }
  });
  localStorage.clear();
  location.href = "/login.html";
}

/* ================= AI DESCRIPTION FROM TITLE ================= */

let aiTimeout;
let lastTitle = "";
let aiInProgress = false;

async function getAIDescription(force = false) {
  if (!aiToggle.checked) return;

  clearTimeout(aiTimeout);

  aiTimeout = setTimeout(async () => {
    const titleText = title.value.trim();
    const language = langSelect.value;

    if (!titleText) return;
if (!force && titleText === lastTitle) return;
if (aiInProgress) return;

aiInProgress = true;

    lastTitle = titleText;
    aiSuggestion.innerHTML = "🤖 Generating description...";
    aiControls.style.display = "block";

    const res = await fetch("/api/ai/describe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: titleText,
        language
      })
    });

    if (!res.ok) {
      aiSuggestion.innerHTML = "⚠️ AI service unavailable";
      aiInProgress = false;
      return;
    }

    const data = await res.json();

    desc.value = data.description || "";
    aiSuggestion.innerHTML = "🤖 AI-generated description (editable)";

    aiInProgress = false;
  }, 400);
}

function acceptAIDescription() {
  aiSuggestion.innerHTML = "✅ AI description accepted";
  aiControls.style.display = "none";
}

function regenerateAIDescription() {
  getAIDescription(true);
}

aiToggle?.addEventListener("change", () => {
  if (!aiToggle.checked) {
    aiSuggestion.innerHTML = "AI assistance disabled";
    aiControls.style.display = "none";
  }
});

/* ================= TASK CRUD ================= */

async function addTask() {
  if (!title.value || !desc.value) {
    alert("Title and description required");
    return;
  }

  const res = await fetch(API + "/tasks", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: localStorage.getItem("token")
    },
    body: JSON.stringify({
      title: title.value,
      description: desc.value
    })
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    alert(data.error || "Failed to create task.");
    return;
  }

  title.value = "";
  desc.value = "";
  aiSuggestion.innerHTML = "";
  aiControls.style.display = "none";

  loadTasks();
}

async function loadTasks() {
  const token = localStorage.getItem("token");

  if (!token) {
    location.href = "/login.html";
    return;
  }

  const res = await fetch(API + "/tasks", {
    headers: {
      Authorization: token
    }
  });

  if (res.status === 401) {
    localStorage.clear();
    location.href = "/login.html";
    return;
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    tasksEl.innerHTML = `<li style="color:#ef4444;">${data.error || "Failed to load tasks."}</li>`;
    return;
  }

  const tasks = await res.json();

  tasksEl.innerHTML = tasks
    .map(
      t => `
      <li>
        <strong>${t.title}</strong><br>
        <small>${t.description}</small><br>
        <span style="color:#4f46e5;font-size:12px;">
          🤖 AI Tag: ${t.tag ? t.tag : "General"}
        </span><br>

        <button onclick="openEditModal(${t.id})">Edit</button>
        <button onclick="deleteTask(${t.id})" style="background:#ef4444;">
          Delete
        </button>
      </li>
    `
    )
    .join("");
}

/* ================= EDIT MODAL ================= */

let editId = null;

async function openEditModal(id) {
  editId = id;

  const res = await fetch(API + "/tasks", {
    headers: {
      Authorization: localStorage.getItem("token")
    }
  });

  if (res.status === 401) {
    localStorage.clear();
    location.href = "/login.html";
    return;
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    alert(data.error || "Failed to load task data.");
    return;
  }

  const tasks = await res.json();
  const task = tasks.find(t => t.id === id);

  if (!task) {
    alert("Task not found.");
    return;
  }

  modalTitle.value = task.title;
  modalDesc.value = task.description;
  editModal.style.display = "flex";
}


function closeModal() {
  editModal.style.display = "none";
}

async function saveEdit() {
  const res = await fetch(API + "/tasks/" + editId, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: localStorage.getItem("token")
    },
    body: JSON.stringify({
      title: modalTitle.value,
      description: modalDesc.value
    })
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    alert(data.error || "Failed to update task.");
    return;
  }

  closeModal();
  loadTasks();
}

async function deleteTask(id) {
  if (!confirm("Delete this task?")) return;

  const res = await fetch(API + "/tasks/" + id, {
    method: "DELETE",
    headers: {
      Authorization: localStorage.getItem("token")
    }
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    alert(data.error || "Failed to delete task.");
    return;
  }

  loadTasks();
}
