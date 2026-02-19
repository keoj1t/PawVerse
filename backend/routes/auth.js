const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { PrismaClient } = require("@prisma/client");
const { authMiddleware, JWT_SECRET } = require("../middleware/auth");

const router = express.Router();
const prisma = new PrismaClient();

// ================= REGISTER =================
router.post("/register", async (req, res) => {
    const { phone, password, name, role } = req.body;

    try {
        const existingUser = await prisma.user.findUnique({
            where: { phone },
        });

        if (existingUser) {
            return res.status(400).json({ error: "User already exists" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const user = await prisma.user.create({
            data: {
                phone,
                password: hashedPassword,
                name,
                role: role === "PARTNER" ? "PARTNER" : "OWNER",
            },
        });

        res.json({ message: "User created", userId: user.id });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ================= LOGIN =================
router.post("/login", async (req, res) => {
    const { phone, password } = req.body;

    try {
        const user = await prisma.user.findUnique({
            where: { phone },
        });

        if (!user) {
            return res.status(400).json({ error: "Invalid credentials" });
        }

        const validPassword = await bcrypt.compare(password, user.password);

        if (!validPassword) {
            return res.status(400).json({ error: "Invalid credentials" });
        }

        const token = jwt.sign(
            { userId: user.id, role: user.role },
            JWT_SECRET,
            { expiresIn: "1d" }
        );

        res.json({ token, role: user.role });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ================= GOOGLE AUTH =================
router.post("/google", async (req, res) => {
    const { credential } = req.body;
    if (!credential) return res.status(400).json({ error: "No credential" });

    try {
        // Decode Google JWT (in production, verify with Google's public keys)
        const payload = JSON.parse(
            Buffer.from(credential.split('.')[1], 'base64').toString()
        );

        const { sub: googleId, email, name, picture } = payload;

        // Find or create user
        let user = await prisma.user.findUnique({ where: { googleId } });

        if (!user) {
            // Check if user exists with similar email/phone
            user = await prisma.user.create({
                data: {
                    googleId,
                    name: name || email,
                    phone: email, // Use email as phone for Google users
                    role: "OWNER",
                },
            });
        }

        const token = jwt.sign(
            { userId: user.id, role: user.role },
            JWT_SECRET,
            { expiresIn: "1d" }
        );

        res.json({ token, role: user.role });
    } catch (error) {
        console.error("Google auth error:", error);
        res.status(500).json({ error: "Google auth failed" });
    }
});

// ================= UPDATE CITY =================
router.patch("/city", authMiddleware, async (req, res) => {
    const { city } = req.body;
    if (!city) return res.status(400).json({ error: "City required" });

    try {
        await prisma.user.update({
            where: { id: req.user.userId },
            data: { city },
        });
        res.json({ message: "City updated" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ================= GET ME =================
router.get("/me", authMiddleware, async (req, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.user.userId },
            select: {
                id: true,
                phone: true,
                name: true,
                role: true,
                city: true,
            },
        });

        res.json(user);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
