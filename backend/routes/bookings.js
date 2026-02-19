const express = require("express");
const { PrismaClient } = require("@prisma/client");
const { authMiddleware, requireRole } = require("../middleware/auth");

const router = express.Router();
const prisma = new PrismaClient();

// ================= CREATE BOOKING =================
router.post("/", authMiddleware, async (req, res) => {
    const { petId, serviceId, bookingDate, localServiceName, localServiceType, city } = req.body;

    try {
        // Security: verify the pet belongs to the current user
        const pet = await prisma.pet.findUnique({ where: { id: petId } });

        if (!pet || pet.ownerId !== req.user.userId) {
            return res.status(403).json({ error: "This pet does not belong to you" });
        }

        let resolvedServiceId = serviceId;
        if (typeof serviceId === "string" && serviceId.startsWith("local_")) {
            const categoryMap = {
                vet: "VET",
                grooming: "GROOMING",
                hotel: "HOTEL",
                training: "TRAINING"
            };
            const serviceTitle = localServiceName || serviceId.replace("local_", "");
            const serviceCategory = categoryMap[String(localServiceType || "vet").toLowerCase()] || "VET";
            const serviceCity = city || "Astana";

            let localService = await prisma.service.findFirst({
                where: {
                    title: serviceTitle,
                    city: serviceCity,
                    category: serviceCategory
                }
            });

            if (!localService) {
                localService = await prisma.service.create({
                    data: {
                        title: serviceTitle,
                        category: serviceCategory,
                        city: serviceCity,
                        price: 0,
                        description: "Local clinic directory service"
                    }
                });
            }
            resolvedServiceId = localService.id;
        }

        const booking = await prisma.booking.create({
            data: {
                petId,
                serviceId: resolvedServiceId,
                bookingDate: new Date(bookingDate),
            },
            include: {
                pet: true,
                service: true,
            },
        });

        res.json(booking);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ================= GET MY BOOKINGS (OWNER) =================
router.get("/", authMiddleware, async (req, res) => {
    try {
        const bookings = await prisma.booking.findMany({
            where: {
                pet: {
                    ownerId: req.user.userId,
                },
            },
            include: {
                pet: true,
                service: true,
            },
            orderBy: { createdAt: "desc" },
        });

        res.json(bookings);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ================= GET PARTNER BOOKINGS =================
router.get("/partner", authMiddleware, requireRole("PARTNER"), async (req, res) => {
    try {
        // Find all services owned by this partner
        const services = await prisma.service.findMany({
            where: { ownerId: req.user.userId },
            select: { id: true },
        });

        const serviceIds = services.map((s) => s.id);

        // Find all bookings for those services
        const bookings = await prisma.booking.findMany({
            where: {
                serviceId: { in: serviceIds },
            },
            include: {
                pet: {
                    include: {
                        owner: {
                            select: { name: true, phone: true },
                        },
                    },
                },
                service: true,
            },
            orderBy: { createdAt: "desc" },
        });

        res.json(bookings);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ================= UPDATE BOOKING STATUS =================
router.patch("/:id/status", authMiddleware, requireRole("PARTNER"), async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ["PENDING", "CONFIRMED", "CANCELLED", "COMPLETED"];
    if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
    }

    try {
        // Security: verify partner owns the service linked to this booking
        const booking = await prisma.booking.findUnique({
            where: { id },
            include: { service: true },
        });

        if (!booking) {
            return res.status(404).json({ error: "Booking not found" });
        }

        if (booking.service.ownerId !== req.user.userId) {
            return res.status(403).json({ error: "You can only manage bookings for your own services" });
        }

        const updated = await prisma.booking.update({
            where: { id },
            data: { status },
            include: {
                pet: true,
                service: true,
            },
        });

        res.json(updated);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
