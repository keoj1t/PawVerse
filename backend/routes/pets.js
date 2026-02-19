const express = require("express");
const { PrismaClient } = require("@prisma/client");
const { authMiddleware } = require("../middleware/auth");

const router = express.Router();
const prisma = new PrismaClient();

async function getOwnerPetWithAvatar(petId, ownerId) {
    const rows = await prisma.$queryRaw`
        SELECT
            "id", "name", "breed", "age", "weight", "ownerId",
            "createdAt", "deviceId", "hasGps", "isLost", "lat", "lng", "avatarUrl"
        FROM "Pet"
        WHERE "id" = ${petId} AND "ownerId" = ${ownerId}
        LIMIT 1
    `;
    return rows[0] || null;
}

// ================= CREATE PET =================
router.post("/", authMiddleware, async (req, res) => {
    const { name, breed, age, weight, hasGps, deviceId, avatarUrl } = req.body;

    try {
        // If hasGps is true, we stub random coordinates in Astana
        const lat = hasGps ? (51.12 + (Math.random() - 0.5) * 0.05) : null;
        const lng = hasGps ? (71.43 + (Math.random() - 0.5) * 0.05) : null;

        const pet = await prisma.pet.create({
            data: {
                name,
                breed,
                age,
                weight: parseFloat(weight),
                hasGps: hasGps === true || hasGps === "true",
                deviceId: deviceId || null,
                lat,
                lng,
                ownerId: req.user.userId,
            },
        });

        const normalizedAvatar = typeof avatarUrl === "string" ? avatarUrl.trim() : "";
        if (normalizedAvatar) {
            await prisma.$executeRaw`
                UPDATE "Pet"
                SET "avatarUrl" = ${normalizedAvatar}
                WHERE "id" = ${pet.id} AND "ownerId" = ${req.user.userId}
            `;
        }

        const petWithAvatar = await getOwnerPetWithAvatar(pet.id, req.user.userId);
        res.json(petWithAvatar || pet);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ================= GET MY PETS =================
router.get("/", authMiddleware, async (req, res) => {
    try {
        const pets = await prisma.$queryRaw`
            SELECT
                "id", "name", "breed", "age", "weight", "ownerId",
                "createdAt", "deviceId", "hasGps", "isLost", "lat", "lng", "avatarUrl"
            FROM "Pet"
            WHERE "ownerId" = ${req.user.userId}
            ORDER BY "createdAt" DESC
        `;

        res.json(pets);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ================= UPDATE GPS / LOST STATUS =================
router.patch("/:id/gps", authMiddleware, async (req, res) => {
    const { id } = req.params;
    const { hasGps, deviceId } = req.body;

    try {
        const lat = hasGps ? (51.12 + (Math.random() - 0.5) * 0.05) : null;
        const lng = hasGps ? (71.43 + (Math.random() - 0.5) * 0.05) : null;

        const pet = await prisma.pet.update({
            where: { id },
            data: {
                hasGps,
                deviceId,
                lat,
                lng
            }
        });
        res.json(pet);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.patch("/:id/lost", authMiddleware, async (req, res) => {
    const { id } = req.params;
    const { isLost } = req.body;

    try {
        const pet = await prisma.pet.update({
            where: { id },
            data: { isLost }
        });
        res.json(pet);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.patch("/:id/avatar", authMiddleware, async (req, res) => {
    const { id } = req.params;
    const { avatarUrl } = req.body;

    try {
        const existingPet = await getOwnerPetWithAvatar(id, req.user.userId);
        if (!existingPet) {
            return res.status(403).json({ error: "This pet does not belong to you" });
        }

        const normalizedAvatar = typeof avatarUrl === "string" ? avatarUrl.trim() : null;
        await prisma.$executeRaw`
            UPDATE "Pet"
            SET "avatarUrl" = ${normalizedAvatar || null}
            WHERE "id" = ${id} AND "ownerId" = ${req.user.userId}
        `;
        const pet = await getOwnerPetWithAvatar(id, req.user.userId);
        res.json(pet);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ================= LINK GPS (MOCK) =================
router.patch("/:id/link-gps", authMiddleware, async (req, res) => {
    const { id } = req.params;
    const { deviceId } = req.body;

    try {
        // MOCK: Always success, generate random coords around Astana
        // random offset: +/- 0.05 deg is roughly +/- 5km
        const lat = 51.12 + (Math.random() - 0.5) * 0.05;
        const lng = 71.43 + (Math.random() - 0.5) * 0.05;

        const pet = await prisma.pet.update({
            where: { id },
            data: {
                hasGps: true,
                deviceId: deviceId || `GPS-${Math.floor(Math.random() * 10000)}`,
                lat,
                lng
            }
        });
        res.json(pet);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
