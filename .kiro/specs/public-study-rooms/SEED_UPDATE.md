# Database Seed Update for Public Study Rooms

## Overview

The Public Study Rooms feature requires 10 rooms to exist in the database for testing. This document provides the code to add to your seed file.

## Update Instructions

### Option 1: Update seed.ts (Recommended)

Add this code to `prisma/seed.ts` after the user creation:

```typescript
import { PrismaClient } from "../prisma/src/generated/client";

const prisma = new PrismaClient();

async function main() {
    // Create a sample user
    const user = await prisma.user.upsert({
        where: { email: "admin@example.com" },
        update: {},
        create: {
            email: "admin@example.com",
            firstName: "Admin",
            lastName: "User",
            password: "hashedpassword123",
            role: "SUPER_ADMIN",
        },
    });

    console.log("Created user:", user);

    // ========================================
    // ADD THIS SECTION FOR PUBLIC STUDY ROOMS
    // ========================================
    
    // Create 10 public study rooms
    console.log("Creating public study rooms...");
    
    for (let i = 1; i <= 10; i++) {
        const room = await prisma.room.upsert({
            where: { name: `Study Room ${i}` },
            update: {},
            create: {
                name: `Study Room ${i}`,
                capacity: 10,
                currentOccupancy: 0,
            },
        });
        console.log(`Created room: ${room.name}`);
    }
    
    console.log("✅ Successfully created 10 public study rooms");
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
```

### Run the Seed

```bash
npm run db:seed
```

### Verify

```bash
npm run prisma:studio
```

Navigate to the `Room` table and verify you have 10 rooms named "Study Room 1" through "Study Room 10".

---

## Option 2: Manual Creation via Prisma Studio

If you prefer not to modify the seed file:

1. Open Prisma Studio:
   ```bash
   npm run prisma:studio
   ```

2. Navigate to the `Room` model

3. Click "Add record" and create 10 rooms with:
   - **name**: "Study Room 1", "Study Room 2", etc.
   - **capacity**: 10
   - **currentOccupancy**: 0

4. Save each room

---

## Option 3: SQL Script

If you prefer SQL, run this in your database:

```sql
INSERT INTO rooms (id, name, capacity, current_occupancy, created_at, updated_at)
VALUES 
  (gen_random_uuid(), 'Study Room 1', 10, 0, NOW(), NOW()),
  (gen_random_uuid(), 'Study Room 2', 10, 0, NOW(), NOW()),
  (gen_random_uuid(), 'Study Room 3', 10, 0, NOW(), NOW()),
  (gen_random_uuid(), 'Study Room 4', 10, 0, NOW(), NOW()),
  (gen_random_uuid(), 'Study Room 5', 10, 0, NOW(), NOW()),
  (gen_random_uuid(), 'Study Room 6', 10, 0, NOW(), NOW()),
  (gen_random_uuid(), 'Study Room 7', 10, 0, NOW(), NOW()),
  (gen_random_uuid(), 'Study Room 8', 10, 0, NOW(), NOW()),
  (gen_random_uuid(), 'Study Room 9', 10, 0, NOW(), NOW()),
  (gen_random_uuid(), 'Study Room 10', 10, 0, NOW(), NOW());
```

**Note:** Adjust column names if your schema uses different naming conventions (e.g., `current_occupancy` vs `currentOccupancy`).

---

## Verification Query

To verify rooms were created:

```sql
SELECT id, name, capacity, current_occupancy 
FROM rooms 
ORDER BY name 
LIMIT 10;
```

Expected output: 10 rows with Study Room 1-10.

---

## Next Steps

Once rooms are created:
1. Start the server: `npm run dev`
2. Follow the testing guide: `MANUAL_TESTING_GUIDE.md`
3. Test the GET /api/public/rooms endpoint
