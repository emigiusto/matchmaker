
# MatchMaker Backend

## Overview
Backend for MatchMaker, a modular matchmaker app built with Node.js, Express, TypeScript, and Prisma (MySQL).

## Architecture
- Node.js + Express + TypeScript
- Prisma ORM (MySQL)
- Zod for validation
- Modular structure: users, players, availability, invites, matches, friendships, jobs, etc.
- Centralized error handling

## Setup Instructions

### 1. Install Dependencies
```bash
cd backend
npm install
```

### 2. Create a MySQL Database

#### Using MySQL Workbench
- Open MySQL Workbench and connect to your server.
- Run:
	```sql
	CREATE DATABASE matchmaker CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
	```

#### Using MySQL CLI
```bash
mysql -u root -p
CREATE DATABASE matchmaker CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
exit
```

### 3. Configure Environment
- Copy `.env.example` to `.env` and set your `DATABASE_URL`:
	```
	DATABASE_URL="mysql://USER:PASSWORD@localhost:3306/matchmaker"
	```

### 4. Run Prisma Migrations
```bash
npx prisma migrate dev --name init
npx prisma generate
```

### 5. Seed the Database (Development Only)
The project includes a robust, relational seeder for development and testing. This will generate hundreds of users, players, availabilities, venues, groups, invites, matches, and results with realistic relationships.

**Warning:** Seeding is only allowed when `ENVIRONMENT=DEVELOPMENT` in your `.env` file. The seeder will wipe all existing data in the database.

To run the seeder:
```bash
npm run seed
# or
npx tsx prisma/seeders/seed.ts
```

If you see connection errors, ensure your MySQL server allows enough connections, or reduce the batch size in `prisma/seeders/batchInsert.util.ts`.

---

### 6. Start the Server
```bash
npm run dev
```
Server runs on `http://localhost:3000`
- **users**: Registration, guest invites, user management
- **players**: Tennis-specific player profiles
- **availability**: Player availability slots
- **invites**: Secure, time-limited match invites
- **matches**: Immutable match records
- **friendships**: Social graph (user and guest contacts)
- **groups**: Group creation, membership, and management
- **venues**: Tennis venue and court management
- **results**: Match results and set tracking
- **notifications**: User notifications (in-app, email, etc.)
- **messages**: Chat and conversation support
- **jobs**: Scheduled tasks (cleanup, reminders)

## API Usage
- See the main repository README for example API requests and Postman collection.

## Troubleshooting
- Ensure MySQL is running and accessible.
- Check `.env` for correct database credentials.
- For migration errors, check your Prisma schema and database connection.

## TODO (Future Phases)
- Authentication & authorization
- Admin dashboard & analytics