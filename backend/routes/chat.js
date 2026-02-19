const express = require("express");
const { authMiddleware } = require("../middleware/auth");
const { PrismaClient } = require("@prisma/client");

const router = express.Router();
const prisma = new PrismaClient();

// ================= PAWBOT AI CHAT =================
router.post("/", authMiddleware, async (req, res) => {
    const { message, context } = req.body;
    const userId = req.user.userId;

    if (!message) return res.status(400).json({ error: "Message is required" });

    try {
        // Fetch real data for context if needed
        const pets = await prisma.pet.findMany({ where: { ownerId: userId } });

        // Intelligent response logic (simulated AI)
        const response = generateIntelligentResponse(message, { pets, ...context });

        res.json({ response });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

function generateIntelligentResponse(msg, ctx) {
    const lc = msg.toLowerCase();
    const { pets = [], city = "Astana", coins = 0 } = ctx;

    // Greetings & Name
    if (lc.includes("привет") || lc.includes("здравст") || lc.includes("hi") || lc.includes("hello")) {
        return `Привет! 👋 Я твой персональный ИИ-помощник PawBot. Я знаю, что ты из города ${city}, и у тебя ${pets.length} питомцев. Чем могу помочь сегодня? 🐾`;
    }

    // Pet specifics
    if (pets.length > 0 && (lc.includes("мой") || lc.includes("питом") || lc.includes("живот"))) {
        const petNames = pets.map(p => p.name).join(", ");
        return `У тебя отличные друзья: ${petNames}! Ты можешь спросить меня о рационе любого из них или о здоровье в целом. Например: "Как кормить ${pets[0].name}?"`;
    }

    // Nutrition advice
    if (lc.includes("корм") || lc.includes("питан") || lc.includes("еда")) {
        if (pets.length === 0) return "Сначала добавь питомца в личном кабинете, чтобы я мог дать рекомендации по питанию! 🍽️";
        const p = pets[0];
        const cal = (p.weight || 5) * 30 + 70;
        return `Для ${p.name} (${p.breed}) при весе ${p.weight} кг рекомендуемая норма — около ${cal.toFixed(0)} ккал в день. Это примерно ${(cal / 4).toFixed(0)}г сухого корма премиум-класса. Не забывай про свежую воду! 🍖`;
    }

    // PawCoins
    if (lc.includes("коин") || lc.includes("монет") || lc.includes("баланс")) {
        return `Твой текущий баланс: 🪙 **${coins} PawCoins**. Зарабатывай их в викторинах и трать на эксклюзивные видео-уроки в разделе «Дрессировка»!`;
    }

    // Locations
    if (lc.includes("клиник") || lc.includes("врач") || lc.includes("больниц")) {
        return `В городе ${city} я нашел несколько отличных клиник. Зайди в раздел «Услуги клиник», там есть карта и отзывы! Если питомец вялый — лучше не медлить и записаться на осмотр. 🏥`;
    }

    // Default "AI" response (fallback)
    return `Интересный вопрос! 🤔 Как твой ИИ-ассистент, я постоянно учусь. Пока я лучше всего разбираюсь в питании, дрессировке и здоровье питомцев. Можешь уточнить свой вопрос или спросить про своих любимцев: ${pets.map(p => p.name).join(", ") || "собак и кошек"}! 🐾`;
}

module.exports = router;
