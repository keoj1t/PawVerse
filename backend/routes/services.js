const express = require("express");
const { PrismaClient } = require("@prisma/client");
const { authMiddleware, requireRole } = require("../middleware/auth");

const router = express.Router();
const prisma = new PrismaClient();

// ================= CREATE SERVICE =================
router.post("/", authMiddleware, requireRole("PARTNER"), async (req, res) => {
    const { title, category, price, city, description } = req.body;

    try {
        const service = await prisma.service.create({
            data: {
                title,
                category,
                price,
                city,
                description,
                ownerId: req.user.userId,
            },
        });

        res.json(service);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ================= GET SERVICES =================
router.get("/", async (req, res) => {
    const { city } = req.query;

    try {
        const services = await prisma.service.findMany({
            where: city ? { city } : {},
        });

        res.json(services);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
