const { Telegraf, Markup } = require("telegraf");
const OpenAI = require("openai");
const { PrismaClient } = require("@prisma/client");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || "";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const prisma = new PrismaClient();

const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;
const userState = new Map();

let bot = null;
let botStarted = false;

const STYLE_PROMPTS = {
    mermaid: "as a magical mermaid in an underwater fantasy world",
    king: "as a royal king with a golden crown and noble outfit",
    queen: "as a royal queen with elegant dress and crown",
    mage: "as a powerful wizard with arcane energy and spell effects",
    knight: "as a brave medieval knight in armor",
    mythical: "as a mythic legendary creature in epic fantasy style",
    astronaut: "as an astronaut in a cinematic space scene",
    cupcake: "as a cute cupcake-themed fantasy character in playful style",
};

function isIgnorableCallbackError(err) {
    const msg = String(err?.description || err?.response?.description || err?.message || "").toLowerCase();
    return msg.includes("query is too old") || msg.includes("query id is invalid") || msg.includes("response timeout expired");
}

async function safeAnswerCbQuery(ctx, text) {
    try {
        await ctx.answerCbQuery(text);
    } catch (err) {
        if (!isIgnorableCallbackError(err)) throw err;
        console.warn("[BOT] Ignored stale callback query.");
    }
}

async function safeEditMessageText(ctx, text) {
    try {
        await ctx.editMessageText(text);
    } catch (err) {
        if (!isIgnorableCallbackError(err)) throw err;
        console.warn("[BOT] Ignored stale edit callback query.");
    }
}

function styleKeyboard() {
    return Markup.inlineKeyboard(
        [
            [Markup.button.callback("Mermaid", "style_mermaid"), Markup.button.callback("King", "style_king")],
            [Markup.button.callback("Queen", "style_queen"), Markup.button.callback("Mage", "style_mage")],
            [Markup.button.callback("Knight", "style_knight"), Markup.button.callback("Mythical", "style_mythical")],
            [Markup.button.callback("Astronaut", "style_astronaut"), Markup.button.callback("Cupcake", "style_cupcake")],
            [Markup.button.callback("Cancel", "cancel")],
        ],
        { columns: 2 }
    );
}

async function generateAvatarWithOpenAI(photoBuffer, mimeType, style) {
    if (!openai) {
        throw new Error("OPENAI_API_KEY is not configured");
    }

    const stylePrompt = STYLE_PROMPTS[style] || `in ${style} style`;
    const prompt = `Create a high-quality stylized avatar of this pet ${stylePrompt}.
Preserve the pet's identity and recognizable facial features from the source image.
Do not add text, logos, watermark, or frame.
Single subject, centered composition, detailed clean background, vibrant cinematic lighting.`;

    const inputFile = await OpenAI.toFile(photoBuffer, "pet.jpg", { type: mimeType || "image/jpeg" });
    const result = await openai.images.edit({
        model: "gpt-image-1",
        image: inputFile,
        prompt,
        size: "1024x1024",
        output_format: "png",
    });

    const generated = result?.data?.[0];
    if (generated?.b64_json) {
        return Buffer.from(generated.b64_json, "base64");
    }
    if (generated?.url) {
        const resp = await fetch(generated.url);
        if (!resp.ok) throw new Error("Failed to download generated image");
        const arr = await resp.arrayBuffer();
        return Buffer.from(arr);
    }
    throw new Error("Image model returned empty payload");
}

function createBot() {
    if (!TELEGRAM_TOKEN) return null;
    const tg = new Telegraf(TELEGRAM_TOKEN);

    tg.start(async (ctx) => {
        const petId = ctx.payload;
        if (!petId) {
            return ctx.reply('Open PawVerse and click "AI Avatar" for a pet.');
        }
        try {
            const pet = await prisma.pet.findUnique({ where: { id: petId } });
            if (!pet) return ctx.reply("Pet not found. Please start again from app.");

            userState.set(ctx.from.id, { petId, petName: pet.name, step: "photo", timestamp: Date.now() });
            await ctx.reply(`Send a photo for ${pet.name}. Then choose a style.`);
        } catch (err) {
            console.error("[BOT] start error:", err);
            await ctx.reply("Technical error. Try again later.");
        }
    });

    tg.on("photo", async (ctx) => {
        const state = userState.get(ctx.from.id);
        if (!state) return ctx.reply("Start from PawVerse first.");

        const photo = ctx.message.photo[ctx.message.photo.length - 1];
        state.fileId = photo.file_id;
        state.step = "style";
        state.timestamp = Date.now();
        await ctx.reply("Choose avatar style:", styleKeyboard());
    });

    tg.on("callback_query", async (ctx) => {
        const data = ctx.callbackQuery.data;
        const state = userState.get(ctx.from.id);

        if (data === "cancel") {
            userState.delete(ctx.from.id);
            return safeEditMessageText(ctx, "Cancelled.");
        }

        if (!state || !state.fileId) {
            return safeAnswerCbQuery(ctx, "Session expired. Start again from app.");
        }

        if (data.startsWith("style_")) {
            const style = data.split("_")[1];
            await safeAnswerCbQuery(ctx, "Generating...");
            await ctx.reply("Generating avatar, wait 10-20 seconds.");

            try {
                const fileLink = await ctx.telegram.getFileLink(state.fileId);
                const photoRes = await fetch(fileLink.href);
                if (!photoRes.ok) throw new Error("Failed to download Telegram photo");
                const photoBuffer = Buffer.from(await photoRes.arrayBuffer());
                const mimeType = photoRes.headers.get("content-type") || "image/jpeg";

                const buffer = await generateAvatarWithOpenAI(photoBuffer, mimeType, style);

                const avatarsDir = path.join(__dirname, "../front/assets/avatars");
                fs.mkdirSync(avatarsDir, { recursive: true });
                const fileName = `pet_${state.petId}_${Date.now()}.png`;
                const filePath = path.join(avatarsDir, fileName);
                fs.writeFileSync(filePath, buffer);

                state.tempAvatarUrl = `assets/avatars/${fileName}`;
                state.timestamp = Date.now();

                await ctx.replyWithPhoto({ source: buffer }, {
                    caption: `Avatar style "${style}" is ready. Set it?`,
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback("Set Avatar", "set_avatar"), Markup.button.callback("Another Style", "reselect_style")]
                    ])
                });
            } catch (err) {
                console.error("[BOT] generation error:", err);
                if (String(err.message || "").includes("OPENAI_API_KEY")) {
                    await ctx.reply("OPENAI_API_KEY is missing in backend/.env. Add it and restart server.");
                } else {
                    await ctx.reply("Generation failed. Please try again later.");
                }
            }
            return;
        }

        if (data === "reselect_style") {
            state.timestamp = Date.now();
            return ctx.reply("Choose another style:", styleKeyboard());
        }

        if (data === "set_avatar") {
            if (!state.tempAvatarUrl) {
                return safeAnswerCbQuery(ctx, "No generated avatar found.");
            }
            try {
                await prisma.pet.update({
                    where: { id: state.petId },
                    data: { avatarUrl: state.tempAvatarUrl },
                });
                await safeAnswerCbQuery(ctx, "Avatar saved.");
                await ctx.reply(`Done. Avatar for ${state.petName} updated.`);
                userState.delete(ctx.from.id);
            } catch (err) {
                console.error("[BOT] save avatar error:", err);
                await ctx.reply("Failed to save avatar.");
            }
        }
    });

    tg.catch((err, ctx) => {
        if (isIgnorableCallbackError(err)) {
            console.warn("[BOT] Ignored stale callback update.");
            return;
        }
        console.error("[BOT] unhandled error:", err, "update:", ctx?.updateType);
    });

    return tg;
}

async function startBot() {
    if (botStarted) return;
    if (!TELEGRAM_TOKEN) {
        console.warn("[BOT] TELEGRAM_TOKEN missing, bot launch skipped.");
        return;
    }
    bot = createBot();
    if (!bot) return;
    try {
        await bot.launch();
        botStarted = true;
        console.log("[BOT] Started successfully");
    } catch (err) {
        console.error("[BOT] Failed to launch:", err);
    }
}

function stopBot(signal = "SIGTERM") {
    if (bot && botStarted) {
        bot.stop(signal);
        botStarted = false;
    }
}

setInterval(() => {
    const now = Date.now();
    for (const [id, state] of userState.entries()) {
        if (now - (state.timestamp || now) > 30 * 60 * 1000) {
            userState.delete(id);
        }
    }
}, 5 * 60 * 1000);

process.once("SIGINT", () => stopBot("SIGINT"));
process.once("SIGTERM", () => stopBot("SIGTERM"));

if (require.main === module) {
    startBot();
}

module.exports = { startBot, stopBot };
