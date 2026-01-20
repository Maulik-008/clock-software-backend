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
            password: "hashedpassword123", // In real app, this should be properly hashed
            role: "SUPER_ADMIN",
        },
    });

    console.log("Created user:", user);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });