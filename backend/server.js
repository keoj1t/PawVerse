const express = require("express");
const cors = require("cors");
const path = require("path");

const authRoutes = require("./routes/auth");
const petRoutes = require("./routes/pets");
const serviceRoutes = require("./routes/services");
const bookingRoutes = require("./routes/bookings");
const nutritionRoutes = require("./routes/nutrition");
const chatRoutes = require("./routes/chat");
const aiRoutes = require("./routes/ai");
const { startBot } = require("./bot");

const app = express();

app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.static(path.join(__dirname, "../front")));

app.use((req, res, next) => {
    console.log(`-> ${req.method} ${req.url}`);
    next();
});

app.use("/auth", authRoutes);
app.use("/pets", petRoutes);
app.use("/services", serviceRoutes);
app.use("/bookings", bookingRoutes);
app.use("/nutrition", nutritionRoutes);
app.use("/chat", chatRoutes);
app.use("/ai", aiRoutes);
app.use("/", authRoutes);

app.use((err, req, res, next) => {
    console.error("ERROR:", err);
    res.status(500).json({ error: err.message });
});

app.listen(3000, async () => {
    console.log("PawVerse API running on http://localhost:3000");
    await startBot();
});
