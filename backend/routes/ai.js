const express = require("express");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");
const { authMiddleware } = require("../middleware/auth");

const router = express.Router();

function decodeDataUrl(dataUrl) {
    if (typeof dataUrl !== "string") return null;
    const match = dataUrl.match(/^data:(.+);base64,(.+)$/);
    if (!match) return null;
    return { mime: match[1], buffer: Buffer.from(match[2], "base64") };
}

router.post("/analyze-media", authMiddleware, async (req, res) => {
    const { mediaType, dataUrl, fileName } = req.body || {};
    if (!dataUrl) return res.status(400).json({ error: "Missing media payload" });
    const decoded = decodeDataUrl(dataUrl);
    if (!decoded) return res.status(400).json({ error: "Invalid dataUrl format" });

    const extByMime = {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
        "video/mp4": ".mp4",
        "video/quicktime": ".mov",
        "video/x-matroska": ".mkv",
    };
    const ext = path.extname(fileName || "") || extByMime[decoded.mime] || (mediaType === "video" ? ".mp4" : ".jpg");

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "paw-ai-"));
    const tempFile = path.join(tempDir, `input${ext}`);

    try {
        fs.writeFileSync(tempFile, decoded.buffer);

        const scriptPath = path.resolve(__dirname, "../../paw_pal_clean/paw_pal/analyze_media.py");
        const modelPath = process.env.PAW_AI_MODEL_PATH || "";
        const pythonCandidates = [process.env.PAW_AI_PYTHON, "python", "py"].filter(Boolean);

        let lastError = null;
        for (const py of pythonCandidates) {
            try {
                const args = [scriptPath, tempFile];
                if (modelPath) args.push(modelPath);
                const output = await new Promise((resolve, reject) => {
                    execFile(py, args, { timeout: 45000 }, (err, stdout, stderr) => {
                        if (err) return reject(new Error(stderr || err.message));
                        resolve(stdout);
                    });
                });

                const parsed = JSON.parse(output);
                if (!parsed || parsed.ok === false) {
                    throw new Error(parsed?.error || "YOLO inference error");
                }

                return res.json({
                    diagnosisName: parsed.diagnosis || "undetected",
                    confidence: parsed.confidence || 0,
                    summary: `PawAI (YOLO): обнаружено вероятное состояние "${parsed.diagnosis || "не определено"}" (confidence ${(parsed.confidence || 0).toFixed(2)}).`,
                    source: "yolo-pt",
                });
            } catch (err) {
                lastError = err;
            }
        }

        return res.status(503).json({
            error: "YOLO model unavailable or not fine-tuned",
            details: String(lastError?.message || "No Python runtime available"),
            hint: "Set PAW_AI_MODEL_PATH to your trained best.pt and restart server",
        });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    } finally {
        try {
            fs.rmSync(tempDir, { recursive: true, force: true });
        } catch {
            // ignore cleanup errors
        }
    }
});

module.exports = router;
