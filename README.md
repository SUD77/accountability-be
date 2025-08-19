# Accountability (Backend)

A lean Node.js + TypeScript + Express API with Prisma/PostgreSQL for tracking **users → streaks → goals → log entries**.

- **Stack:** Node.js, TypeScript, Express, Prisma, PostgreSQL  
- **Style:** minimal, modular (routers + controllers)  
- **DB:** UUID keys, snake_case in DB, Prisma models mapped

---

## Quick start

```bash
# 1) Install dependencies (lockfile for reproducible installs)
# First time (no lockfile yet): here, lock means package-lock.json
npm install

# Next times (lockfile exists):
# npm ci

# 2) Create your .env
# macOS/Linux:
cp .env.example .env
# Windows PowerShell:
# copy .env.example .env

# 3) Update DATABASE_URL inside .env to your local Postgres

# 4) Create the database if it doesn't exist (example)
# psql -U postgres -h localhost -p 5434 -c "CREATE DATABASE accountability;"

# 5) Apply Prisma migrations & generate client
npx prisma migrate dev

# 6) Run the API (dev mode)
npm run dev
# -> API running on http://localhost:3000




-----------------

#Overall Scripts    - (Remove this particular thing from readMe, if it feels redundant)

npm ci                 # install deps from package-lock.json
npm run dev            # start in dev (ts-node-dev)
npm run build          # compile TS to dist/
npm start              # run compiled dist/server.js
npm run prisma:studio  # open Prisma Studio
npm run prisma:generate # regenerate Prisma client

