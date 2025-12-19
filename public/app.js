const API = "/api";
let cachedTasks = [];


/* ================= AUTH GUARD ================= */

if (!localStorage.getItem("token") && location.pathname.includes("dashboard")) {
  location.href = "/login.html";
}

/* ================= AUTH ================= */

async function register() {
  await fetch(API + "/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: email.value,
      password: password.value
    })
  });
  location.href = "/login.html";
}

async function login() {
  const res = await fetch(API + "/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: email.value,
      password: password.value
    })
  });

  if (!res.ok) {
    alert("User not registered. Please register.");
    location.href = "/register.html";
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

  await fetch(API + "/tasks", {
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

  const tasks = await res.json();
  const task = tasks.find(t => t.id === id);

  modalTitle.value = task.title;
  modalDesc.value = task.description;
  editModal.style.display = "flex";
}


function closeModal() {
  editModal.style.display = "none";
}

async function saveEdit() {
  await fetch(API + "/tasks/" + editId, {
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

  closeModal();
  loadTasks();
}

async function deleteTask(id) {
  if (!confirm("Delete this task?")) return;

  await fetch(API + "/tasks/" + id, {
    method: "DELETE",
    headers: {
      Authorization: localStorage.getItem("token")
    }
  });

  loadTasks();
}
