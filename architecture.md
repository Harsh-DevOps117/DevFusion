# Architecture: Practice (LeetCode-like) Feature

This document describes the backend architecture for the **Practice/Coding** feature set implemented in:

- `src/controller/executeCodeController.ts`
- `src/controller/problemController.ts`
- `src/controller/submisisonController.ts`
- `src/controller/playlistController.ts`
- `src/routes/executeCodeRoutes.ts`
- `src/routes/problemRoutes.ts`
- `src/routes/submissionRoutes.ts`
- `src/routes/playlistRoutes.ts`
- `src/utils/judge0.ts`

The service is an Express API that persists data with **Prisma + PostgreSQL** and executes code using **Judge0 via RapidAPI**.

## High-level overview

### Responsibilities

- **Problems**
  - Create coding problems (validated by running reference solutions against testcases via Judge0).
  - Fetch all problems / problem by id.
  - Fetch problems solved by the authenticated user.
- **Code execution + submissions**
  - Execute user code against multiple testcases (batch submission to Judge0).
  - Persist a `Submission` and per-testcase `TestCaseResult`.
  - If all tests pass, mark `(userId, problemId)` as solved via `ProblemSolved`.
- **Playlists**
  - Create playlists.
  - Add/remove problems to/from playlists.
  - Fetch playlist details with included problems.
- **Submissions querying**
  - Fetch all submissions for a user.
  - Fetch submissions for a user+problem.
  - Fetch total submission count for a given problem (all users).

### Runtime boundaries

- **API boundary**: Express routes under `/v1` and `/v1/playlist` (`src/app.ts`).
- **Auth boundary**: Most endpoints require `isAuthenticated` which populates `req.user` (user id is consumed heavily by controllers).
- **External boundary**: Judge0 batch endpoints accessed via Axios client configured by environment variables.
- **Persistence boundary**: Prisma models in `prisma/schema.prisma`.

## Module map (layers)

### Routing layer (Express)

- `src/routes/problemRoutes.ts`: problem CRUD + solved-problems list
- `src/routes/executeCodeRoutes.ts`: execute code (creates submission + testcase results)
- `src/routes/submissionRoutes.ts`: submission listing / counts
- `src/routes/playlistRoutes.ts`: playlist CRUD + playlist membership changes

### Controller layer (request handlers)

- `src/controller/problemController.ts`
  - `createProblem`: validates reference solutions by running them on Judge0 for each testcase and language.
  - `getAllProblems`, `getProblemById`
  - `getAllProblemSolvedByUser`: reads solved problems through the `ProblemSolved` relation.
- `src/controller/executeCodeController.ts`
  - `executeCode`: runs user code on multiple inputs, compares outputs, writes submission + testcase results, upserts solve state.
- `src/controller/submisisonController.ts`
  - `getAllSubmission`, `getSubmissionForProblem`, `getAllSubmissionForProblem` (count).
- `src/controller/playlistController.ts`
  - `createPlaylist`, `deletePlaylist`
  - `addProblemToPlaylist` (bulk add, skip duplicates)
  - `removeProblemFromPlayList` (bulk remove)
  - `getPlaylistDetails` (includes problems + problem details)

### Integration layer (Judge0)

- `src/utils/judge0.ts`
  - Axios client `judge0` configured via env:
    - `JUDGE0_API_URL`
    - `RAPIDAPI_KEY`
    - `RAPIDAPI_HOST`
  - `submitBatch(submissions)`: POST `/submissions/batch`
  - `pollBatchResults(tokens)`: GET `/submissions/batch` until statuses are terminal (not 1/2), or timeout.
  - `getJudge0LanguageId(language)` + `getLanguageName(languageId)` mapping helpers

### Persistence layer (Prisma)

Prisma client is used via `prisma` (from `src/utils/prismaAdapter`, referenced by controllers).

Core models for this feature (from `prisma/schema.prisma`):

- `Problem`
- `Submission`
- `TestCaseResult`
- `ProblemSolved`
- `Playlist`
- `ProblemInPlaylist`

## API surface (routes)

Base registration in `src/app.ts`:

- `/v1` (general)
- `/v1/playlist` (playlist-specific base path)

### Problem APIs (`/v1`)

- `POST /v1/create-problem` (auth)
  - Controller: `createProblem`
  - Purpose: create a problem after verifying reference solutions pass all testcases.
- `GET /v1/get-all-problems` (auth)
  - Controller: `getAllProblems`
- `GET /v1/get-problem/:id` (auth)
  - Controller: `getProblemById`
- `GET /v1/get-solved-problems` (auth)
  - Controller: `getAllProblemSolvedByUser`

### Execute code API (`/v1`)

- `POST /v1/execute-code` (auth)
  - Controller: `executeCode`
  - Purpose: execute user submission against multiple testcases, store results, and return persisted submission with `testResults`.

### Submission APIs (`/v1`)

- `GET /v1/get-all-submission` (auth)
  - Controller: `getAllSubmission`
- `GET /v1/get-submission/:problemId` (auth)
  - Controller: `getSubmissionForProblem`
- `GET /v1/get-submission-count/:problemId` (auth)
  - Controller: `getAllSubmissionForProblem`

### Playlist APIs (`/v1/playlist`)

- `POST /v1/playlist/create-playlist` (auth)
  - Controller: `createPlaylist`
  - Validation: `createPlaylistSchema` (`src/utils/validations.ts`)
- `GET /v1/playlist/:playlistId` (auth)
  - Controller: `getPlaylistDetails`
- `POST /v1/playlist/:playlistId/add-problem` (auth)
  - Controller: `addProblemToPlaylist`
  - Body: `{ "problemIds": ["..."] }`
- `DELETE /v1/playlist/:playlistId/remove-problem` (auth)
  - Controller: `removeProblemFromPlayList`
  - Body: `{ "problemIds": ["..."] }`
- `DELETE /v1/playlist/:playlistId` (auth)
  - Controller: `deletePlaylist`

> Note: `src/routes/playlistRoutes.ts` also defines `GET /v1/playlist/` mapped to `getPlaylistDetails`, but without auth and without a `playlistId`. This likely won’t work as intended because the controller expects `req.params.playlistId`.

## Core flows

### Flow A: Create problem (reference-solution validation)

**Goal**: Ensure `referenceSolutions` actually solve all `testcases` before persisting the problem.

Steps (per `src/controller/problemController.ts`):

1. Validate required fields:
   - `referenceSolutions` must be non-empty.
   - `testcases` must be non-empty.
2. For each `(language, solutionCode)` in `referenceSolutions`:
   - Convert language → Judge0 language id via `getJudge0LanguageId`.
   - Build a batch of submissions: one submission per testcase.
   - `submitBatch` → receive tokens.
   - `pollBatchResults` until all are complete.
   - Require each result `status.id === 3` (Accepted). Otherwise reject creation.
3. Persist `Problem` with JSON fields (`examples`, `testcases`, `codeSnippets`, `referenceSolutions`) and `userId = req.user.id`.

### Flow B: Execute user code (create submission + testcase results + solved status)

**Goal**: Run the user’s code against multiple testcases, provide detailed per-case results, and persist them.

Steps (per `src/controller/executeCodeController.ts`):

1. Inputs (body):
   - `source_code`, `language_id`, `stdin[]`, `expected_outputs[]`, `problemId`
2. Validate:
   - `stdin` is a non-empty array.
   - `expected_outputs` is an array with same length as `stdin`.
3. Build Judge0 submissions: one per `stdin[i]`.
4. Call Judge0:
   - `submitBatch(submissions)` → tokens
   - `pollBatchResults(tokens)` → results
5. Compare each testcase output:
   - `stdout.trim()` equals `expected_outputs[i].trim()` ⇒ passed
   - Set `allPassed` accordingly
6. Persist:
   - Create `Submission` with:
     - `language` from `getLanguageName(language_id)`
     - `status` = `"Accepted"` or `"Wrong Answer"`
     - `stdin` stored as joined string
     - `stdout`/`stderr`/`compileOutput` stored as JSON strings (arrays per testcase) or `null`
     - `memory`/`time` stored as JSON strings (arrays) or `null`
   - If `allPassed`, upsert `ProblemSolved` on composite `(userId, problemId)`
   - Create many `TestCaseResult` rows (one per testcase)
7. Return `Submission` including `testResults`.

### Flow C: Playlist management

**Goal**: Allow users to group problems into playlists.

- Create playlist:
  - Validates body via Zod schema (`name`, `description` required and non-empty).
  - Persists `Playlist` with `userId = req.user.id`.
- Add problems:
  - Bulk insert into `ProblemInPlaylist` via `createMany`.
  - `skipDuplicates: true` prevents violation of `@@unique([playlistId, problemId])`.
- Remove problems:
  - Bulk delete `ProblemInPlaylist` by `playlistId` + `problemId in [...]`.
- Get playlist details:
  - Loads `Playlist` and includes `problems` relation with nested `problem`.

## Data model touchpoints

### Problem (`Problem`)

- Written by: `createProblem`
- Read by: `getAllProblems`, `getProblemById`, `getAllProblemSolvedByUser`, playlist include.
- Key fields:
  - `difficulty` is an enum (`Easy | Medium | Hard`)
  - JSON-heavy fields: `examples`, `testcases`, `codeSnippets`, `referenceSolutions`

### Submission (`Submission`)

- Written by: `executeCode`
- Read by: `getAllSubmission`, `getSubmissionForProblem`, `executeCode` (read-back with include)
- Related to:
  - `TestCaseResult[]` via `testResults`
  - `User`, `Problem`

### TestCaseResult (`TestCaseResult`)

- Written by: `executeCode` (bulk insert)
- Read by: `executeCode` include (`testResults`)

### ProblemSolved (`ProblemSolved`)

- Written by: `executeCode` (upsert only when all passed)
- Read by: `getAllProblemSolvedByUser` (via `Problem.solvedBy`)

### Playlist (`Playlist`) and membership (`ProblemInPlaylist`)

- Written by: `createPlaylist`, `addProblemToPlaylist`, `removeProblemFromPlayList`, `deletePlaylist`
- Read by: `getPlaylistDetails`

## External dependency: Judge0 (RapidAPI)

### Contract assumptions

- Batch submit returns an array with `{ token }` entries.
- Batch poll returns `{ submissions: [...] }` with each submission containing:
  - `status.id` and `status.description`
  - optional `stdout`, `stderr`, `compile_output`
  - optional `memory`, `time` (used by `executeCodeController`)

### Polling strategy

- `pollBatchResults(tokens, maxAttempts=20)` checks if all statuses are terminal:
  - Non-terminal ids: `1` (In Queue), `2` (Processing)
  - Stops when all are not 1/2, else waits 1s and retries.
- Throws `"Polling timeout exceeded"` after max attempts.

## Observability & logging

- App uses `prom-client` counters/histograms exposed at `GET /metrics`.
- Controllers use `logger` for error logging; some raw `console.log` output exists in execute/problem flows.

## Security & access control

- `isAuthenticated` is applied on most routes and provides `req.user.id`.
- Many queries are scoped by `userId`:
  - Playlists: `getPlaylistDetails` uses `{ id: playlistId, userId: req.user?.id }`
  - Submissions list: scoped to `req.user?.id`
- Some endpoints currently do not enforce ownership checks (e.g., `deletePlaylist` deletes by id only).

## Known edge cases (from current implementation)

- **Playlist root GET**: `GET /v1/playlist/` maps to `getPlaylistDetails` but does not provide `playlistId`. This likely returns `400`.
- **`removeProblemFromPlayList` response**: deletion is performed but the handler does not send a success response on the happy path.
- **Output comparison**: `executeCode` compares `stdout.trim()` strictly to `expected.trim()`; formatting differences (extra spaces/newlines) cause Wrong Answer.

