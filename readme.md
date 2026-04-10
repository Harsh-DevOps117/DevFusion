# 🚀 PrepGrid — AI-Powered Interview & Practice Platform

**PrepGrid** is a comprehensive placement preparation ecosystem designed for engineering students. It leverages AI to provide realistic mock interviews, adaptive coding challenges, and detailed performance analytics to bridge the gap between academic learning and technical recruitment.

---

## 🛠️ Tech Stack

- **Backend:** Node.js, Express.js (TypeScript)
- **Database:** PostgreSQL
- **ORM:** Prisma (v6/v7 compatible)
- **DevOps:** Docker (Multi-stage builds), Prometheus (Monitoring)
- **Security:** JWT, Bcrypt + Secret Pepper Hashing, Helmet.js
- **Utilities:** Winston (Industry-standard logging), Nodemailer (OTP System)
- **External APIs:** Judge0 (Code Execution)

---

## ✨ Core Features

### 1. 💻 Practice Module

- **Question Bank:** Topic-wise filtering (Arrays, DP, Graphs, SQL) across Easy, Medium, and Hard difficulties.
- **In-Browser IDE:** Integrated with Judge0 API for real-time code execution and syntax highlighting.
- **Tracking:** Bookmark questions and track your solved/unsolved status.

### 2. 🤖 AI Interview Module

- **Mock Interviews:** Voice or text-based sessions for roles like Frontend, Backend, or Full Stack.
- **Adaptive Difficulty:** AI adjusts the next question's complexity based on your previous answers.
- **Instant Feedback:** Get a score and qualitative improvement suggestions after every session.

### 3. 📝 AI Test/Quiz Module

- **Timed MCQs:** Dynamic generation of quizzes on topics like "React Hooks" or "OS Scheduling."
- **Leaderboards:** Compete with peers globally for top scores in specific domains.

### 4. 📊 User Analytics & Dashboard

- **Streak Tracker:** Visualizing daily activity to encourage consistent practice.
- **Weak Area Analysis:** AI-driven insights into which topics need more focus based on performance data.

### 5. 💳 Payment & Admin

- **Tiered Access:** Free tier limits vs. Pro tier (Razorpay/Stripe sandbox integration).
- **Admin Panel:** Full CRUD capabilities for question management and user activity analytics.

---

## 🔒 Security Architecture

PrepGrid implements a multi-layered security approach:

- **Password Peppering:** A server-side secret (`PEPPER`) is combined with passwords before hashing to protect against rainbow table attacks even in the event of a database leak.
- **Stateless Auth:** Secure JWTs signed with a 24-hour expiration.
- **Logging:** Winston-powered audit logs capturing security events, errors, and system health.

---

## 🚀 Getting Started

### Prerequisites

- Docker & Docker Compose
- Node.js (v20+)

### Installation

1.  **Clone the repository:**

    ```bash
    git clone https://github.com/your-username/prepgrid.git
    cd prepgrid
    ```

2.  **Configure Environment Variables:**
    Create a `.env` file in the root directory:

    ```env
    PORT=3001
    DATABASE_URL="postgresql://user:pass@localhost:5432/prepgrid"
    JWT_SECRET="your_jwt_secret"
    PEPPER="your_secret_pepper_string"
    EMAIL_USER="your-email@gmail.com"
    EMAIL_PASS="your-app-password"
    ```

3.  **Run with Docker:**
    ```bash
    docker-compose up --build
    ```

---

## 🧪 API Documentation (Testing via Postman)

### Auth Endpoints

| Method | Endpoint         | Description                  |
| :----- | :--------------- | :--------------------------- |
| `POST` | `/api/v1/signup` | Register a new user          |
| `POST` | `/api/v1/login`  | Authenticate & update streak |

**Sample Signup Payload:**

```json
{
  "name": "Harsh Kharwar",
  "email": "harsh@iiitbh.ac.in",
  "password": "SecurePassword123!"
}
```

### System Endpoints

- **Health Check:** `GET /health`
- **Metrics (Prometheus):** `GET /metrics`

---

## 📁 Project Structure

```text
├── prisma/               # Database schema & migrations
├── src/
│   ├── controllers/      # Business logic
│   ├── routes/           # API Endpoints
│   ├── lib/              # Database & Third-party clients
│   ├── utils/            # Logger & Helpers
│   └── index.ts          # Server entry point
├── logs/                 # Combined & Error logs
├── Dockerfile            # Multi-stage production build
└── docker-compose.yml    # Orchestration
```

---

## 📈 Monitoring

PrepGrid includes a built-in monitoring middleware that tracks:

- Total HTTP requests
- Request duration (latency)
- Status code distribution
  All metrics are exposed at `/metrics` for Prometheus scraping.

---

_Developed by Harsh Kharwar for DevFusion: The Developer Hackathon._
