// server.js – Render-ready TikTok downloader + simple UI

const express = require("express");
const cors = require("cors");
const axios = require("axios");
const Tiktok = require("@tobyg74/tiktok-api-dl");

const app = express();
app.use(cors());
app.use(express.json());

// OPTIONAL: Discord webhook
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || "";

// TikTok Resolver
async function resolveTikTok(url) {
    console.log("\n🎯 Resolving TikTok:", url);

    const versions = ["v3", "v2", "v1"];
    const candidates = [];

    for (const version of versions) {
        try {
            console.log(`Trying tiktok-api-dl ${version}...`);

            const apiResponse = await Tiktok.Downloader(url, { version });
            console.log(`${version} status:`, apiResponse?.status);

            if (!apiResponse || apiResponse.status !== "success" || !apiResponse.result)
                continue;

            const res = apiResponse.result;
            let directUrl = null;
            let quality = "Unknown";

            if (typeof res.videoHD === "string") {
                directUrl = res.videoHD;
                quality = "HD (videoHD)";
            }
            else if (res.video && typeof res.video.noWatermark === "string") {
                directUrl = res.video.noWatermark;
                quality = "HD No Watermark";
            }
            else if (typeof res.videoWatermark === "string") {
                directUrl = res.videoWatermark;
                quality = "Watermark";
            }
            else if (res.video && typeof res.video.downloadAddr === "string") {
                directUrl = res.video.downloadAddr;
                quality = "Watermark (downloadAddr)";
            }

            if (!directUrl) continue;

            candidates.push({ url: directUrl, quality, version });

        } catch (err) {
            console.log(`${version} error:`, err.message);
        }
    }

    if (!candidates.length) return null;

    // pick best
    candidates.sort((a, b) => {
        const score = (c) => {
            let s = 0;
            if (c.quality.toLowerCase().includes("no watermark")) s += 50;
            if (c.quality.toLowerCase().includes("hd")) s += 20;
            if (c.quality.toLowerCase().includes("watermark")) s -= 20;
            return s;
        };
        return score(b) - score(a);
    });

    return candidates[0];
}

// API route
app.get("/api/tiktok", async (req, res) => {
    const url = req.query.url;
    if (!url || !url.includes("tiktok.com"))
        return res.status(400).json({ ok: false, error: "Invalid TikTok URL" });

    const result = await resolveTikTok(url);
    if (!result)
        return res.status(500).json({ ok: false, error: "Failed to fetch video" });

    return res.json({ ok: true, ...result });
});

// Optional Discord send
app.post("/send-to-discord", async (req, res) => {
    if (!DISCORD_WEBHOOK_URL)
        return res.status(400).json({ ok: false, error: "Webhook not configured" });

    const url = req.query.url;
    if (!url)
        return res.status(400).json({ ok: false, error: "Missing TikTok URL" });

    const result = await resolveTikTok(url);
    if (!result)
        return res.status(500).json({ ok: false, error: "Failed to resolve video" });

    await axios.post(DISCORD_WEBHOOK_URL, {
        content: `🎬 **TikTok HD link:**\n${result.url}`
    });

    return res.json({ ok: true });
});

// /download?url=<tiktok-url>
// Resolve to HD link, then redirect browser to the actual MP4
app.get("/download", async (req, res) => {
    const tiktokUrl = req.query.url;
    if (!tiktokUrl || !tiktokUrl.includes("tiktok.com")) {
        return res.status(400).send("Invalid TikTok URL");
    }

    try {
        const result = await resolveTikTok(tiktokUrl);
        if (!result) {
            return res.status(500).send("Failed to resolve video");
        }

        return res.redirect(result.url);
    } catch (err) {
        console.error("Download error:", err.message);
        return res.status(500).send("Error: " + err.message);
    }
});

// Simple UI
app.get("/", (req, res) => {
    res.send(`
<html>
<head><title>My TikTok Downloader</title></head>
<body style="font-family:sans-serif;text-align:center;margin-top:50px;">
<h1>My TikTok Downloader</h1>
<input id="url" style="width:300px;padding:10px" placeholder="TikTok URL here..." />
<button onclick="go()">Get HD</button>
<button onclick="download()">Download</button>
<div id="result" style="margin-top:20px;"></div>
<script>
async function go(){
  const url = document.getElementById("url").value;
  document.getElementById("result").innerHTML="Loading...";
  const res = await fetch("/api/tiktok?url="+encodeURIComponent(url));
  const data = await res.json();
  if(!data.ok){ document.getElementById("result").innerHTML="Error: "+data.error; return; }
  document.getElementById("result").innerHTML='<a href="'+data.url+'" target="_blank">'+data.url+'</a><br>'+data.quality;
}

async function download(){
  const url = document.getElementById("url").value;
  if(!url) return;
  window.location.href = "/download?url=" + encodeURIComponent(url);
}
</script>
</body></html>
    `);
});

// Render uses PORT from env
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("🚀 Server running on port", PORT));
