You are a senior backend engineer tasked with building a production-ready “GitHub Fork Intelligence Engine”.

The goal is to analyze all forks of a given GitHub repository and identify which forks contain meaningful, non-trivial changes compared to the upstream repository.

You must implement a complete system, not a prototype.

I. INPUT

The system takes:
- a GitHub repository (owner/repo)
- optional keyword(s) to search inside fork changes

II. CORE OBJECTIVE

For each fork:
- determine how far ahead it is from upstream
- extract the actual code differences
- identify what has been implemented or modified
- rank forks by relevance and innovation

III. DATA SOURCES (MANDATORY)

You must use the GitHub API:
- GET /repos/{owner}/{repo}/forks
- GET /repos/{owner}/{repo}/compare/{base}...{head}
- GET /repos/{owner}/{repo}/commits
- GET /repos/{owner}/{repo}/contents

You may use GraphQL if more efficient.

IV. ARCHITECTURE

You must build a scalable architecture with the following components:

1. Fork Discovery Worker
- fetch all forks (handle pagination)
- store fork metadata (stars, updated_at, default branch)

2. Diff Extraction Worker
- for each fork:
  - compare upstream default branch with fork default branch
  - extract:
    - commits ahead
    - files changed
    - patch diffs
- persist raw diffs

3. Feature Extraction Layer
- process diffs to extract:
  - modified modules
  - added files
  - commit intent (from messages)
- normalize into structured JSON

4. Semantic Layer (CRITICAL)
- embed:
  - commit messages
  - diff chunks
- use a vector database (Qdrant preferred)
- enable semantic search:
  “find forks that implemented feature X”

5. Ranking Engine
Compute a score for each fork:
- commits ahead (weight)
- lines changed (weight)
- recency (weight)
- stars (weight)
- semantic relevance (if query provided)

6. API Layer
Expose:
- GET /forks/top
- GET /forks/search?q=
- GET /forks/{fork}/diff-summary

7. CLI Interface
Allow:
- scanning a repo
- querying results
- exporting reports

V. TECH STACK (STRICT)

- Language: Go or Python (prefer Go for concurrency)
- Workers: goroutines or async workers
- Queue: Redis or in-memory channel
- Storage:
  - metadata → PostgreSQL or SQLite
  - diffs → object storage or flat files
  - vectors → Qdrant
- HTTP client must support rate limiting and retries

VI. PERFORMANCE CONSTRAINTS

- Must handle repos with 1000+ forks
- Must parallelize fork analysis
- Must respect GitHub rate limits
- Must cache results to avoid recomputation

VII. OUTPUT FORMAT

For each fork:
{
  "fork": "owner/repo",
  "ahead_by": int,
  "files_changed": int,
  "top_modified_files": [],
  "summary": "short natural language summary of changes",
  "score": float
}

VIII. DEVELOPMENT STRATEGY

You must:
1. Build incrementally but keep final architecture in mind
2. Start with fork discovery + compare
3. Then add persistence
4. Then semantic layer
5. Then ranking + API

IX. CONSTRAINTS

- Do NOT build a toy script
- Do NOT skip diff analysis
- Do NOT skip semantic indexing
- Do NOT assume forks are identical structure
- Handle edge cases:
  - deleted branches
  - empty forks
  - large diffs

X. DELIVERABLE

A working system that can answer:
“Which forks of this repo implemented feature X and how?”

Start by designing the project structure and implementing the fork discovery + compare pipeline.