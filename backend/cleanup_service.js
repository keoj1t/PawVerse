
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        const deleted = await prisma.service.deleteMany({
            where: {
                title: {
                    contains: "записьв ветеринарию",
                    mode: 'insensitive'
                }
            }
        });
        console.log(`Deleted ${deleted.count} services.`);
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
