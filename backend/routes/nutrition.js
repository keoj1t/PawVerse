const express = require("express");
const { PrismaClient } = require("@prisma/client");
const { authMiddleware } = require("../middleware/auth");
const { searchFood, getFoodDetails } = require("../services/fatsecret");
const { searchPopularFeeds } = require("../data/popular_feeds");

const router = express.Router();
const prisma = new PrismaClient();

// ================= GET NUTRITION ENTRIES =================
router.get("/", authMiddleware, async (req, res) => {
    const { petId } = req.query;
    if (!petId) return res.status(400).json({ error: "petId is required" });

    try {
        const entries = await prisma.nutritionEntry.findMany({
            where: { petId },
            orderBy: { date: "desc" },
        });
        res.json(entries);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ================= CREATE NUTRITION ENTRY =================
router.post("/", authMiddleware, async (req, res) => {
    const { petId, foodName, grams, calories, protein, fat, carbs } = req.body;

    if (!petId || !foodName) {
        return res.status(400).json({ error: "petId and foodName are required" });
    }

    try {
        const entry = await prisma.nutritionEntry.create({
            data: {
                petId,
                foodName,
                grams: parseFloat(grams) || 0,
                calories: parseFloat(calories) || 0,
                protein: parseFloat(protein) || 0,
                fat: parseFloat(fat) || 0,
                carbs: parseFloat(carbs) || 0,
            },
        });
        res.json(entry);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ================= DELETE NUTRITION ENTRY =================
router.delete("/:id", authMiddleware, async (req, res) => {
    try {
        await prisma.nutritionEntry.delete({ where: { id: req.params.id } });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ================= SEARCH FOOD (FATSECRET) =================
router.get("/search", authMiddleware, async (req, res) => {
    const { q } = req.query;
    if (!q) return res.json([]);

    try {
        const localResults = searchPopularFeeds(q, 8);
        const fsResults = await searchFood(q);

        const normalizedLocalNames = new Set(localResults.map(x => String(x.food_name || "").toLowerCase()));
        const fsNormalized = (Array.isArray(fsResults) ? fsResults : [])
            .filter(item => !normalizedLocalNames.has(String(item.food_name || "").toLowerCase()))
            .map(item => ({ ...item, source: "fatsecret" }));

        res.json([...localResults, ...fsNormalized].slice(0, 12));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ================= GET FOOD DETAILS (FATSECRET) =================
router.get("/food/:id", authMiddleware, async (req, res) => {
    try {
        const food = await getFoodDetails(req.params.id);
        res.json(food);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
