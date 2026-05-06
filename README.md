# Edge TaskFlow App

Edge TaskFlow is a full-stack, serverless task management application built using **Cloudflare Workers**, **D1**, **KV**, and **Workers AI**. The application demonstrates edge computing principles, secure API design, and AI-powered task assistance.

---

## 🚀 Features

- User authentication (Register / Login / Logout)
- Task CRUD operations (Create, Read, Update, Delete)
- Session management using stateless JWT (HS256)
- AI-powered task description generation
- Multilingual AI support (English, Hindi, Kannada, French, Spanish)
- Secure backend APIs with authorization
- Fully serverless deployment on Cloudflare Workers

---

## 🏗️ Architecture

| Layer | Technology |
|------|-----------|
Frontend | HTML, CSS, JavaScript (Workers Assets)
Backend | Cloudflare Workers (Node.js compatibility)
Database | Cloudflare D1 (SQLite)
Sessions | JWT (HS256) |
AI | Workers AI (`@cf/meta/llama-3-8b-instruct`)

---

## 🛠️ Setup & Run Locally

### Prerequisites
- Node.js (v18+)
- Cloudflare account
- Wrangler CLI

```bash
npm install -g wrangler
wrangler login

Clone Repository
git clone https://github.com/Shankramma7/edge-taskflow-app.git
cd edge-taskflow-app

Install Dependencies
npm install

Create D1 Database
wrangler d1 create edge_taskflow_db
wrangler d1 execute edge_taskflow_db --file schema.sql --remote

Create KV Namespace
wrangler kv namespace create TF_SESSIONS


Update the generated IDs in wrangler.json.

Run Locally
wrangler dev

🚀 Deploy to Cloudflare
wrangler deploy

🌍 Live Demo
👉 https://edge-taskflow-app.shankrammalingadahalli.workers.dev

