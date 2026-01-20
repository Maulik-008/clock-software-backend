# 📁 Prisma Schema Organization

This directory contains modular Prisma schema files organized by domain for better maintainability and scalability.

## 📂 File Structure

```
prisma/schema/
├── schema.prisma      # Main schema (generator & datasource config)
├── user.prisma        # User domain models and enums
├── auth.prisma        # Authentication related models
├── study.prisma       # Study session and goal models
├── merged.prisma      # Auto-generated merged schema (DO NOT EDIT)
└── README.md          # This documentation
```

## 🔧 How It Works

### 1. **Modular Schema Files**
Each `.prisma` file contains models related to a specific domain:

- **`schema.prisma`** - Contains only the `generator` and `datasource` configuration
- **`user.prisma`** - User model, roles, and user-related enums
- **`auth.prisma`** - Authentication models (RefreshToken, UserSession)
- **`study.prisma`** - Study-related models (StudySession, Subject, StudyGoal)

### 2. **Automatic Schema Merging**
The `scripts/merge-schema.js` script automatically combines all schema files into a single `merged.prisma` file that Prisma CLI uses.

### 3. **Updated NPM Scripts**
All Prisma commands now automatically merge schemas before execution:

```json
{
  "prisma:merge": "node scripts/merge-schema.js",
  "prisma:generate": "npm run prisma:merge && prisma generate --schema=prisma/schema/merged.prisma",
  "prisma:migrate": "npm run prisma:merge && prisma migrate dev --schema=prisma/schema/merged.prisma",
  "prisma:studio": "npm run prisma:merge && prisma studio --schema=prisma/schema/merged.prisma",
  "prisma:push": "npm run prisma:merge && prisma db push --schema=prisma/schema/merged.prisma"
}
```

## 🚀 Usage

### Adding New Models

1. **Create a new schema file** (e.g., `notification.prisma`):
```prisma
// Notification domain models

model Notification {
  id        String   @id @default(uuid())
  userId    Int
  title     String
  message   String
  isRead    Boolean  @default(false)
  createdAt DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("notifications")
}
```

2. **Update User model** if needed (add relations):
```prisma
// In user.prisma
model User {
  // ... existing fields
  
  // Add new relation
  notifications Notification[]
  
  @@map("users")
}
```

3. **Run Prisma commands** (merging happens automatically):
```bash
npm run prisma:generate
npm run prisma:push
```

### Development Workflow

```bash
# 1. Edit individual schema files
# 2. Generate client (auto-merges)
npm run prisma:generate

# 3. Push to database (auto-merges)
npm run prisma:push

# 4. Create migration (auto-merges)
npm run prisma:migrate

# 5. Open Prisma Studio (auto-merges)
npm run prisma:studio
```

## 📋 Current Schema Organization

### User Domain (`user.prisma`)
- `User` model with authentication and profile fields
- `Role` enum (STUDENT, SUPER_ADMIN)
- Relations to auth and study models

### Authentication Domain (`auth.prisma`)
- `RefreshToken` model for JWT refresh token management
- `UserSession` model for device/session tracking

### Study Domain (`study.prisma`)
- `StudySession` model for tracking study sessions
- `Subject` model for study subjects/topics
- `StudyGoal` model for user study goals
- `GoalPeriod` enum (DAILY, WEEKLY, MONTHLY)

## ⚠️ Important Notes

1. **Never edit `merged.prisma`** - It's auto-generated and will be overwritten
2. **Always use npm scripts** - They handle merging automatically
3. **Keep relations consistent** - Ensure foreign key relationships are properly defined across files
4. **Use meaningful file names** - Group related models by domain/feature

## 🔍 Benefits

✅ **Better Organization** - Models grouped by domain/feature
✅ **Easier Maintenance** - Smaller, focused files
✅ **Team Collaboration** - Reduced merge conflicts
✅ **Scalability** - Easy to add new domains
✅ **Clear Separation** - Authentication, user, and business logic separated
✅ **Automatic Merging** - No manual schema management needed

## 🛠 Troubleshooting

### Schema Merge Issues
If you encounter merge issues:

1. Check for syntax errors in individual schema files
2. Ensure all relations are properly defined
3. Run `npm run prisma:merge` manually to see merge output
4. Verify `merged.prisma` contains all expected models

### Missing Relations
If relations are missing:

1. Ensure both sides of the relation are defined
2. Check that foreign key fields match
3. Verify model names are consistent across files

### Build Errors
If TypeScript build fails:

1. Run `npm run prisma:generate` to update client
2. Check that all model imports are correct
3. Verify enum values are properly exported