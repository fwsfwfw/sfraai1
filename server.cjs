var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_express = __toESM(require("express"), 1);
var import_path = __toESM(require("path"), 1);
var import_vite = require("vite");
var import_genai = require("@google/genai");
var import_dotenv = __toESM(require("dotenv"), 1);
var import_supabase_js = require("@supabase/supabase-js");
import_dotenv.default.config();
var _origConsoleLog = console.log;
console.log = (...args) => {
  if (args.length > 0 && typeof args[0] === "string" && args[0].includes("non-text parts") && args[0].includes("returning concatenation")) {
    return;
  }
  _origConsoleLog(...args);
};
async function startServer() {
  const app = (0, import_express.default)();
  const PORT = 3e3;
  app.use(import_express.default.json({ limit: "50mb" }));
  let aiClient = null;
  function getGeminiClient(userApiKey) {
    if (userApiKey) {
      return new import_genai.GoogleGenAI({
        apiKey: userApiKey,
        httpOptions: {
          timeout: 3e5,
          headers: { "User-Agent": "aistudio-build" }
        }
      });
    }
    if (!aiClient) {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error("\u05D2\u05D9\u05DC\u05D5\u05D9 \u05E9\u05D2\u05D9\u05D0\u05D4: \u05DE\u05E4\u05EA\u05D7 \u05D4-API \u05E9\u05DC Gemini \u05D7\u05E1\u05E8 \u05D1\u05DE\u05E2\u05E8\u05DB\u05EA. \u05D9\u05E9 \u05DC\u05D4\u05D2\u05D3\u05D9\u05E8 \u05D0\u05D5\u05EA\u05D5 \u05D1\u05D4\u05D2\u05D3\u05E8\u05D5\u05EA \u05D4\u05E1\u05D5\u05D3\u05D5\u05EA.");
      }
      aiClient = new import_genai.GoogleGenAI({
        apiKey,
        httpOptions: {
          timeout: 3e5,
          // Increase timeout to 300s (5 minutes) for deep research/grounding
          headers: {
            "User-Agent": "aistudio-build"
          }
        }
      });
    }
    return aiClient;
  }
  function mapErrorToStatus(error) {
    const errStr = (error.toString() + " " + JSON.stringify(error)).toLowerCase();
    if (errStr.includes("deadline") || errStr.includes("timeout") || errStr.includes("504") || error.status === "DEADLINE_EXCEEDED") {
      return 504;
    }
    if (errStr.includes("resource_exhausted") || errStr.includes("429") || error.status === "RESOURCE_EXHAUSTED") {
      return 429;
    }
    return 500;
  }
  app.post("/api/chat", async (req, res) => {
    try {
      const { message, history = [], model = "gemini-3.5-flash", sourceRef, sourceContent, isGemara, apiKey } = req.body;
      const ai = getGeminiClient(apiKey);
      let contextInfo = `\u05D4\u05DE\u05E7\u05D5\u05E8 \u05D4\u05E0\u05DC\u05DE\u05D3: ${sourceRef || "\u05DC\u05D0 \u05E6\u05D5\u05D9\u05DF"}
\u05EA\u05D5\u05DB\u05DF \u05D4\u05DE\u05E7\u05D5\u05E8:
${sourceContent || "\u05DC\u05D0 \u05E6\u05D5\u05D9\u05DF"}`;
      if (isGemara || sourceRef && (sourceRef.includes(".") || sourceRef.match(/[א-ת]+\s[א-ת][\"״׳]\s[א-ב]/))) {
        try {
          const normalizedRef = String(sourceRef).replace(/\s+/g, "_").replace(/,/g, ".");
          const rashiRef = `Rashi_on_${normalizedRef}`;
          const rashiUrl = `https://www.sefaria.org/api/texts/${encodeURIComponent(rashiRef)}?context=0`;
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 8e3);
          try {
            const rashiRes = await fetch(rashiUrl, { signal: controller.signal });
            if (rashiRes.ok) {
              const rashiData = await rashiRes.json();
              if (rashiData && rashiData.he && (!Array.isArray(rashiData.he) || rashiData.he.length > 0)) {
                const rashiText = Array.isArray(rashiData.he) ? rashiData.he.flat(Infinity).join("\n") : rashiData.he;
                if (rashiText.trim().length > 0) {
                  contextInfo += `

\u05E4\u05D9\u05E8\u05D5\u05E9 \u05E8\u05E9"\u05D9 \u05E2\u05DC \u05D4\u05E7\u05D8\u05E2:
${rashiText}`;
                  console.log("Integrated Rashi context for sidebar chat:", sourceRef);
                }
              }
            }
          } finally {
            clearTimeout(timeoutId);
          }
        } catch (e) {
          console.log("Rashi fetch skipped or failed for sidebar chat.");
        }
      }
      const systemInstruction = `\u05D0\u05EA\u05D4 '\u05E1\u05E4\u05E8\u05D0' (Sefra), \u05E2\u05D5\u05D6\u05E8 \u05DE\u05D7\u05E7\u05E8 \u05EA\u05D5\u05E8\u05E0\u05D9 \u05DE\u05D4\u05D9\u05E8 \u05D5\u05DE\u05D3\u05D5\u05D9\u05E7. 
\u05EA\u05E4\u05E7\u05D9\u05D3\u05DA \u05DC\u05D4\u05E1\u05D1\u05D9\u05E8 \u05D0\u05EA \u05D4\u05DE\u05E7\u05D5\u05E8 \u05E9\u05D4\u05DE\u05E9\u05EA\u05DE\u05E9 \u05DE\u05E2\u05D9\u05D9\u05DF \u05D1\u05D5 \u05DB\u05E8\u05D2\u05E2 \u05D1\u05E6\u05D5\u05E8\u05D4 \u05D1\u05D4\u05D9\u05E8\u05D4 \u05D5\u05EA\u05DE\u05E6\u05D9\u05EA\u05D9\u05EA.

\u05D7\u05D5\u05E7\u05D9 \u05D4\u05DE\u05E2\u05E0\u05D4:
1. \u05E2\u05E0\u05D4 \u05DE\u05D4\u05E8 \u05D5\u05DC\u05E2\u05E0\u05D9\u05D9\u05DF. \u05D0\u05DC \u05EA\u05D0\u05E8\u05D9\u05DA \u05D1\u05D4\u05E7\u05D3\u05DE\u05D5\u05EA \u05D0\u05D5 \u05D1\u05E1\u05D9\u05D5\u05DE\u05D5\u05EA \u05DE\u05D9\u05D5\u05EA\u05E8\u05D5\u05EA.
2. \u05D0\u05DD \u05DE\u05D3\u05D5\u05D1\u05E8 \u05D1\u05D2\u05DE\u05E8\u05D0, \u05E2\u05DC\u05D9\u05DA \u05DC\u05D4\u05EA\u05D1\u05E1\u05E1 \u05D1\u05E8\u05D0\u05E9 \u05D5\u05D1\u05E8\u05D0\u05E9\u05D5\u05E0\u05D4 \u05E2\u05DC \u05E4\u05D9\u05E8\u05D5\u05E9 \u05E8\u05E9"\u05D9 (\u05D0\u05DD \u05E6\u05D5\u05E8\u05E3 \u05DC\u05E7\u05D5\u05E0\u05D8\u05E7\u05E1\u05D8) \u05D5\u05DC\u05D4\u05E1\u05D1\u05D9\u05E8 \u05D0\u05EA \u05D4\u05DE\u05D4\u05DC\u05DA \u05DC\u05E4\u05D9\u05D5.
3. \u05D3\u05D9\u05D9\u05E7 \u05D1\u05DC\u05E9\u05D5\u05E0\u05DA. \u05D4\u05E9\u05EA\u05DE\u05E9 \u05D1\u05DE\u05D5\u05E9\u05D2\u05D9\u05DD \u05D9\u05E9\u05D9\u05D1\u05EA\u05D9\u05D9\u05DD \u05E7\u05E6\u05E8\u05DE"\u05D9\u05DD (\u05DC\u05DE\u05E9\u05DC: '\u05D1\u05D9\u05D0\u05D5\u05E8 \u05D4\u05D3\u05D1\u05E8\u05D9\u05DD', '\u05D3\u05D0\u05D9\u05EA\u05D0', '\u05D5\u05E4\u05D9\u05E8\u05E9 \u05E8\u05E9"\u05D9').
4. \u05D0\u05DC \u05EA\u05DE\u05E6\u05D9\u05D0 \u05DE\u05E7\u05D5\u05E8\u05D5\u05EA \u05D0\u05D5 \u05DE\u05D9\u05DC\u05D9\u05DD \u05E9\u05DC\u05D0 \u05E7\u05D9\u05D9\u05DE\u05D9\u05DD.

${contextInfo}`;
      const formattedContents = history.map((msg) => ({
        role: msg.role === "user" ? "user" : "model",
        parts: [{ text: msg.content || "" }]
      }));
      formattedContents.push({ role: "user", parts: [{ text: message }] });
      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: formattedContents,
        config: {
          systemInstruction,
          temperature: 0.2,
          maxOutputTokens: 8192
        }
      });
      const usageMetadata = response.usageMetadata;
      const promptTokens = usageMetadata?.promptTokenCount || 0;
      const candidatesTokens = usageMetadata?.candidatesTokenCount || 0;
      const totalTokens = usageMetadata?.totalTokenCount || 0;
      const usdToIls = 3.7;
      const costUsd = promptTokens * 0.075 / 1e6 + candidatesTokens * 0.3 / 1e6;
      const costIls = costUsd * usdToIls;
      let responseText = "";
      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.text) responseText += part.text;
      }
      if (!responseText) responseText = response.text || "\u05DC\u05D0 \u05D4\u05E6\u05DC\u05D7\u05EA\u05D9 \u05DC\u05D2\u05D1\u05E9 \u05D4\u05E1\u05D1\u05E8 \u05DB\u05E8\u05D2\u05E2.";
      res.json({
        text: responseText,
        usage: {
          promptTokens,
          candidatesTokens,
          totalTokens,
          costUsd,
          costIls
        }
      });
    } catch (error) {
      console.error("Chat API error:", error);
      res.status(500).json({ error: error.message || "\u05E9\u05D2\u05D9\u05D0\u05D4 \u05D1\u05E2\u05D9\u05D1\u05D5\u05D3 \u05D4\u05D1\u05E7\u05E9\u05D4" });
    }
  });
  app.post("/api/generate-image", async (req, res) => {
    try {
      const { prompt, apiKey } = req.body;
      if (!prompt) return res.status(400).json({ error: "Prompt is required" });
      const ai = getGeminiClient(apiKey);
      const researchSystemInstruction = `\u05D0\u05EA\u05D4 '\u05D7\u05D5\u05E7\u05E8 \u05D5\u05D9\u05D6\u05D5\u05D0\u05DC\u05D9 \u05EA\u05D5\u05E8\u05E0\u05D9'. \u05EA\u05E4\u05E7\u05D9\u05D3\u05DA \u05DC\u05D7\u05E7\u05D5\u05E8 \u05DC\u05E2\u05D5\u05DE\u05E7 \u05DB\u05D9\u05E6\u05D3 \u05DE\u05D5\u05E9\u05D2 \u05EA\u05D5\u05E8\u05E0\u05D9 \u05D0\u05DE\u05D5\u05E8 \u05DC\u05D4\u05D9\u05E8\u05D0\u05D5\u05EA \u05D1\u05DE\u05D3\u05D5\u05D9\u05E7 \u05E2\u05DC \u05E4\u05D9 \u05D4\u05EA\u05D5\u05E8\u05D4, \u05D7\u05D6"\u05DC, \u05D5\u05D4\u05DE\u05E4\u05E8\u05E9\u05D9\u05DD. 
\u05D7\u05D5\u05D1\u05D4 \u05E2\u05DC\u05D9\u05DA \u05DC\u05E2\u05E8\u05D5\u05DA \u05EA\u05D7\u05E7\u05D9\u05E8 \u05DE\u05E2\u05DE\u05D9\u05E7 \u05D1\u05D9\u05D5\u05EA\u05E8: \u05E2\u05DC\u05D9\u05DA \u05DC\u05DC\u05DE\u05D5\u05D3 \u05D5\u05DC\u05D7\u05E7\u05D5\u05E8 \u05D0\u05EA \u05DB\u05DC \u05E4\u05E8\u05D8\u05D9 \u05D4\u05D3\u05D9\u05E0\u05D9\u05DD \u05E9\u05DC \u05D4\u05DE\u05D5\u05E9\u05D2 \u05DE\u05D4\u05D9\u05E1\u05D5\u05D3\u05D5\u05EA \u05D4\u05D1\u05E1\u05D9\u05E1\u05D9\u05D9\u05DD \u05D1\u05D9\u05D5\u05EA\u05E8 \u05D5\u05E2\u05D3 \u05DC\u05E4\u05E8\u05D8\u05D9\u05DD \u05D4\u05E7\u05D8\u05E0\u05D9\u05DD \u05D1\u05D9\u05D5\u05EA\u05E8!
\u05DC\u05D3\u05D5\u05D2\u05DE\u05D0: \u05D0\u05DD \u05D4\u05EA\u05D1\u05E7\u05E9\u05EA \u05DC\u05D9\u05E6\u05D5\u05E8 \u05EA\u05DE\u05D5\u05E0\u05D4 \u05E9\u05DC \u05DE\u05E0\u05D5\u05E8\u05EA \u05D4\u05DE\u05E7\u05D3\u05E9, \u05E2\u05DC\u05D9\u05DA \u05DC\u05DC\u05DE\u05D5\u05D3 \u05E2\u05DC\u05D9\u05D4 \u05DE\u05E9\u05DC\u05D1 \u05D4\u05D1\u05E1\u05D9\u05E1 \u05D5\u05E2\u05D3 \u05DC\u05E2\u05E0\u05E4\u05D9 \u05E2\u05E0\u05E4\u05D9\u05DD \u05D5\u05DB\u05DC \u05D3\u05D9\u05E0\u05D9\u05D4 \u05D4\u05D5\u05D5\u05D9\u05D6\u05D5\u05D0\u05DC\u05D9\u05D9\u05DD. \u05D0\u05DD \u05D4\u05EA\u05D1\u05E7\u05E9\u05EA \u05DC\u05D9\u05E6\u05D5\u05E8 \u05EA\u05DE\u05D5\u05E0\u05D4 \u05E9\u05DC \u05D1\u05D2\u05D3\u05D9 \u05D4\u05DB\u05D4\u05DF \u05D4\u05D2\u05D3\u05D5\u05DC, \u05E2\u05DC\u05D9\u05DA \u05DC\u05DC\u05DE\u05D5\u05D3 \u05D0\u05D9\u05DA \u05D4\u05DE\u05E6\u05E0\u05E4\u05EA \u05E0\u05E8\u05D0\u05D9\u05EA, \u05D0\u05D9\u05DA \u05D4\u05E6\u05D9\u05E5 \u05E0\u05E8\u05D0\u05D4 \u05DE\u05D3\u05D5\u05D9\u05D9\u05E7 \u05D5\u05DB\u05DF \u05DB\u05DC \u05E9\u05D0\u05E8 \u05D4\u05D1\u05D2\u05D3\u05D9\u05DD, \u05DB\u05DC \u05E4\u05E8\u05D8 \u05D4\u05DB\u05D9 \u05E7\u05D8\u05DF! \u05E8\u05E7 \u05DC\u05D0\u05D7\u05E8 \u05E9\u05D7\u05E7\u05E8\u05EA \u05DC\u05E2\u05D5\u05DE\u05E7, \u05E4\u05EA\u05D7\u05EA \u05DE\u05E7\u05D5\u05E8\u05D5\u05EA \u05D5\u05D9\u05E9 \u05DC\u05DA \u05EA\u05DE\u05D5\u05E0\u05D4 \u05D1\u05E8\u05D5\u05E8\u05D4, \u05EA\u05D2\u05D1\u05E9 \u05D4\u05D7\u05DC\u05D8\u05D4. \u05E2\u05DC\u05D9\u05DA \u05DC\u05D4\u05E9\u05EA\u05DE\u05E9 \u05D1-Google Search \u05DE\u05E8\u05D5\u05D1\u05D4 \u05E4\u05E2\u05DE\u05D9\u05DD \u05DB\u05D3\u05D9 \u05DC\u05D1\u05E1\u05E1 \u05D4\u05D9\u05D8\u05D1 \u05D0\u05EA \u05EA\u05D9\u05D0\u05D5\u05E8\u05DA.
\u05D1\u05E1\u05D9\u05D5\u05DD \u05D4\u05DE\u05D7\u05E7\u05E8 \u05D4\u05DE\u05E2\u05DE\u05D9\u05E7, \u05E2\u05DC\u05D9\u05DA \u05DC\u05E1\u05E4\u05E7 \u05E9\u05E0\u05D9 \u05D3\u05D1\u05E8\u05D9\u05DD:
1. "visualPrompt": \u05EA\u05D9\u05D0\u05D5\u05E8 \u05D5\u05D9\u05D6\u05D5\u05D0\u05DC\u05D9 \u05DE\u05E4\u05D5\u05E8\u05D8 \u05DE\u05D0\u05D5\u05D3 \u05D1\u05D0\u05E0\u05D2\u05DC\u05D9\u05EA \u05E2\u05D1\u05D5\u05E8 \u05DE\u05D5\u05D3\u05DC \u05D9\u05E6\u05D9\u05E8\u05EA \u05EA\u05DE\u05D5\u05E0\u05D4, \u05D4\u05DE\u05DB\u05D9\u05DC \u05D0\u05EA \u05DB\u05DC \u05D4\u05DE\u05E1\u05E7\u05E0\u05D5\u05EA \u05DE\u05D4\u05DE\u05D7\u05E7\u05E8 \u05D4\u05DE\u05D3\u05D5\u05E7\u05D3\u05E7 \u05E9\u05E2\u05E9\u05D9\u05EA, \u05E9\u05D5\u05DD \u05E4\u05E8\u05D8 \u05E9\u05D5\u05DC\u05D9 \u05DC\u05D0 \u05D9\u05D9\u05D7\u05E1\u05E8 (\u05DC\u05DC\u05D0 \u05E0\u05E9\u05D9\u05DD, \u05DC\u05DC\u05D0 \u05E2\u05D1\u05D5\u05D3\u05D4 \u05D6\u05E8\u05D4, \u05DC\u05DC\u05D0 \u05E4\u05E1\u05DC\u05D9 \u05D0\u05D3\u05DD, \u05D5\u05DC\u05DC\u05D0 4 \u05D3\u05DE\u05D5\u05D9\u05D5\u05EA \u05D4\u05DE\u05E8\u05DB\u05D1\u05D4 \u05D9\u05D7\u05D3).
2. "explanation": \u05D4\u05E1\u05D1\u05E8 \u05D1\u05E2\u05D1\u05E8\u05D9\u05EA \u05D4\u05DE\u05E4\u05E8\u05D8 \u05D0\u05EA \u05D4\u05DE\u05DE\u05E6\u05D0\u05D9\u05DD \u05E9\u05DC\u05DA \u05E2\u05DC\u05D9\u05D4\u05DD \u05DE\u05D1\u05D5\u05E1\u05E1 \u05D4\u05E6\u05D9\u05D5\u05E8 \u05D5\u05DE\u05D4\u05DD \u05D4\u05DE\u05E7\u05D5\u05E8\u05D5\u05EA \u05DC\u05D7\u05D6\u05D5\u05EA \u05D4\u05E1\u05E4\u05E6\u05D9\u05E4\u05D9\u05EA \u05D4\u05D6\u05D5.

\u05D7\u05D5\u05E7\u05D9 \u05D1\u05E8\u05D6\u05DC:
- \u05D0\u05D9\u05DF \u05E0\u05E9\u05D9\u05DD.
- \u05D0\u05D9\u05DF \u05E2\u05D1\u05D5\u05D3\u05D4 \u05D6\u05E8\u05D4/\u05E4\u05E1\u05DC\u05D9\u05DD.
- \u05D0\u05D9\u05DF 4 \u05D3\u05DE\u05D5\u05D9\u05D5\u05EA \u05D4\u05DE\u05E8\u05DB\u05D1\u05D4 (\u05D0\u05D3\u05DD, \u05D0\u05E8\u05D9\u05D4, \u05E9\u05D5\u05E8, \u05E0\u05E9\u05E8) \u05D1\u05E4\u05E8\u05D9\u05D9\u05DD \u05D0\u05D7\u05D3.
- \u05D4\u05E4\u05E8\u05D5\u05DE\u05E4\u05D8 \u05D1\u05D0\u05E0\u05D2\u05DC\u05D9\u05EA \u05D7\u05D9\u05D9\u05D1 \u05DC\u05D4\u05D9\u05D5\u05EA \u05E2\u05E9\u05D9\u05E8 \u05D1\u05E4\u05E8\u05D8\u05D9\u05DD (\u05E1\u05D2\u05E0\u05D5\u05DF: photorealistic, 4k, cinematic lighting).

\u05D4\u05D7\u05D6\u05E8 \u05D0\u05EA \u05D4\u05EA\u05E9\u05D5\u05D1\u05D4 \u05D1\u05DE\u05D1\u05E0\u05D4 JSON \u05D1\u05DC\u05D1\u05D3.`;
      const researchResponse = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: [{ role: "user", parts: [{ text: `\u05D7\u05E7\u05D5\u05E8 \u05D5\u05D0\u05D9\u05D9\u05E8 \u05D0\u05EA \u05D4\u05DE\u05D5\u05E9\u05D2: ${prompt}` }] }],
        config: {
          systemInstruction: researchSystemInstruction,
          tools: [{ googleSearch: {} }],
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              visualPrompt: { type: "STRING" },
              explanation: { type: "STRING" }
            },
            required: ["visualPrompt", "explanation"]
          }
        }
      });
      const researchUsage = researchResponse.usageMetadata;
      let researchData;
      try {
        researchData = JSON.parse(researchResponse.text || "{}");
      } catch (e) {
        console.error("Failed to parse research JSON:", researchResponse.text);
        throw new Error("\u05E0\u05DB\u05E9\u05DC\u05D4 \u05DE\u05DC\u05D0\u05DB\u05EA \u05D4\u05DE\u05D7\u05E7\u05E8 \u05D4\u05D5\u05D5\u05D9\u05D6\u05D5\u05D0\u05DC\u05D9.");
      }
      const { visualPrompt, explanation } = researchData;
      if (!visualPrompt) throw new Error("\u05DC\u05D0 \u05D4\u05E6\u05DC\u05D7\u05EA\u05D9 \u05DC\u05D2\u05D1\u05E9 \u05EA\u05D9\u05D0\u05D5\u05E8 \u05D5\u05D9\u05D6\u05D5\u05D0\u05DC\u05D9 \u05EA\u05E7\u05D9\u05DF.");
      const drawSystemInstruction = `\u05D0\u05EA\u05D4 '\u05D4\u05DE\u05D0\u05D9\u05D9\u05E8 \u05D4\u05EA\u05D5\u05E8\u05E0\u05D9'. \u05EA\u05E4\u05E7\u05D9\u05D3\u05DA \u05DC\u05E6\u05D9\u05D9\u05E8 \u05D0\u05EA \u05D4\u05E4\u05E8\u05D5\u05DE\u05E4\u05D8 \u05E9\u05E7\u05D9\u05D1\u05DC\u05EA \u05D1\u05D3\u05D9\u05D5\u05E7 \u05E8\u05D1.
\u05D7\u05D5\u05E7\u05D9 \u05D1\u05E8\u05D6\u05DC (\u05D0\u05DC \u05EA\u05E1\u05D8\u05D4 \u05DE\u05D4\u05DD):
1. \u05D0\u05D9\u05DF \u05E0\u05E9\u05D9\u05DD.
2. \u05D0\u05D9\u05DF \u05E2\u05D1\u05D5\u05D3\u05D4 \u05D6\u05E8\u05D4 \u05D0\u05D5 \u05E4\u05E1\u05DC\u05D9 \u05D0\u05D3\u05DD.
3. \u05D0\u05D9\u05DF 4 \u05D3\u05DE\u05D5\u05D9\u05D5\u05EA \u05D4\u05DE\u05E8\u05DB\u05D1\u05D4 \u05D9\u05D7\u05D3.
\u05E1\u05D2\u05E0\u05D5\u05DF: \u05E6\u05D9\u05DC\u05D5\u05DD \u05D4\u05D9\u05E1\u05D8\u05D5\u05E8\u05D9 \u05E8\u05D9\u05D0\u05DC\u05D9\u05E1\u05D8\u05D9, \u05D0\u05D9\u05DB\u05D5\u05EA \u05D2\u05D1\u05D5\u05D4\u05D4.`;
      const imageResponse = await ai.models.generateContent({
        model: "gemini-3.1-flash-image-preview",
        contents: [{ role: "user", parts: [{ text: visualPrompt }] }],
        config: {
          systemInstruction: drawSystemInstruction,
          imageConfig: {
            aspectRatio: "1:1",
            imageSize: "1K"
          }
        }
      });
      const drawUsage = imageResponse.usageMetadata;
      const totalPromptTokens = (researchUsage?.promptTokenCount || 0) + (drawUsage?.promptTokenCount || 0);
      const totalCandidatesTokens = (researchUsage?.candidatesTokenCount || 0) + (drawUsage?.candidatesTokenCount || 0);
      const totalTokens = (researchUsage?.totalTokenCount || 0) + (drawUsage?.totalTokenCount || 0);
      const usdToIls = 3.7;
      const imageCostUsd = 0.03;
      const researchCostUsd = (researchUsage?.promptTokenCount || 0) * 0.075 / 1e6 + (researchUsage?.candidatesTokenCount || 0) * 0.3 / 1e6;
      const costUsd = imageCostUsd + researchCostUsd;
      const costIls = costUsd * usdToIls;
      let imageData = null;
      if (imageResponse.candidates?.[0]?.content?.parts) {
        for (const part of imageResponse.candidates[0].content.parts) {
          if (part.inlineData) {
            imageData = part.inlineData.data;
            break;
          }
        }
      }
      if (!imageData) {
        throw new Error("\u05DC\u05D0 \u05D4\u05E6\u05DC\u05D7\u05EA\u05D9 \u05DC\u05D9\u05E6\u05D5\u05E8 \u05D0\u05EA \u05D4\u05EA\u05DE\u05D5\u05E0\u05D4. \u05D9\u05D9\u05EA\u05DB\u05DF \u05E9\u05D4\u05E4\u05E8\u05D5\u05DE\u05E4\u05D8 \u05D7\u05E8\u05D2 \u05DE\u05DE\u05D3\u05D9\u05E0\u05D9\u05D5\u05EA \u05D4\u05D1\u05D8\u05D9\u05D7\u05D5\u05EA \u05D0\u05D5 \u05D4\u05DE\u05D2\u05D1\u05DC\u05D5\u05EA \u05D4\u05D4\u05DC\u05DB\u05EA\u05D9\u05D5\u05EA.");
      }
      res.json({
        image: `data:image/png;base64,${imageData}`,
        explanation: (explanation || "\u05D4\u05E0\u05D4 \u05D4\u05DE\u05D7\u05E9\u05D4 \u05D5\u05D9\u05D6\u05D5\u05D0\u05DC\u05D9\u05EA \u05DC\u05DE\u05D4 \u05E9\u05D1\u05D9\u05E7\u05E9\u05EA.").trim(),
        usage: {
          promptTokens: totalPromptTokens,
          candidatesTokens: totalCandidatesTokens,
          totalTokens,
          costUsd,
          costIls
        }
      });
    } catch (error) {
      console.error("Image generation error:", error);
      res.status(500).json({ error: error.message || "\u05E9\u05D2\u05D9\u05D0\u05D4 \u05D1\u05D9\u05E6\u05D9\u05E8\u05EA \u05D4\u05EA\u05DE\u05D5\u05E0\u05D4" });
    }
  });
  app.get("/api/youtube-info", async (req, res) => {
    try {
      const { url } = req.query;
      if (!url || typeof url !== "string") {
        return res.status(400).json({ error: "No url provided" });
      }
      const fetchRes = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(url)}`);
      if (!fetchRes.ok) {
        return res.status(fetchRes.status).json({ error: "Failed to fetch from noembed" });
      }
      const data = await fetchRes.json();
      res.json(data);
    } catch (e) {
      console.error("/api/youtube-info error:", e);
      res.status(500).json({ error: e.message || "Failed to fetch youtube details" });
    }
  });
  app.get("/ext/v1/load", async (req, res) => {
    try {
      const { ref, context, translation } = req.query;
      if (!ref || typeof ref !== "string") {
        return res.status(400).json({ error: "No ref provided" });
      }
      const queryParams = new URLSearchParams();
      if (context) queryParams.set("context", String(context));
      if (translation) queryParams.set("translation", String(translation));
      const refStr = String(ref).trim();
      let data = null;
      let response = null;
      const fetchHeaders = {
        "User-Agent": "SefraTorahResearch/1.0 (https://ai.studio/build; ikarpel100@gmail.com) Mozilla/5.0",
        "Accept": "application/json"
      };
      const trySefaria = async (r) => {
        let normalized = r.replace(/\s+/g, "_").replace(/_+/g, "_").replace(/,_+/g, ",_").replace(/,([^_])/g, ",_$1");
        const encodedRef = normalized.split("").map(
          (c) => c === "," || c === "." || c === "_" || c >= "a" && c <= "z" || c >= "A" && c <= "Z" || c >= "0" && c <= "9" || c === "-" ? c : encodeURIComponent(c)
        ).join("");
        let url = `https://www.sefaria.org/api/texts/${encodedRef}?${queryParams.toString()}`;
        console.log("Backend proxying Sefaria:", url);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15e3);
        try {
          const res2 = await fetch(url, { headers: fetchHeaders, signal: controller.signal });
          if (res2.ok) {
            const textData = await res2.text();
            try {
              const parsed = JSON.parse(textData);
              if (parsed && parsed.he && (!Array.isArray(parsed.he) || parsed.he.length > 0)) {
                return { ok: true, data: parsed, response: res2 };
              }
            } catch (e) {
            }
          }
          return { ok: false, status: res2.status };
        } finally {
          clearTimeout(timeoutId);
        }
      };
      try {
        let result = await trySefaria(refStr);
        if (result.ok) {
          data = result.data;
          response = result.response;
        } else {
          if (refStr.includes("Chaim")) {
            console.log("Sefaria 'Chaim' failed, trying 'Chayim' variation...");
            const altResult = await trySefaria(refStr.replace(/Chaim/g, "Chayim"));
            if (altResult.ok) {
              data = altResult.data;
              response = altResult.response;
            }
          }
          if (!data) {
            const dottedResult = await trySefaria(refStr.replace(/,/g, "."));
            if (dottedResult.ok) {
              data = dottedResult.data;
              response = dottedResult.response;
            }
          }
          if (!data && refStr.toLowerCase().includes("rav")) {
            const ravFix = refStr.replace(/Rav[,.]\s*/i, "HaRav, ");
            const ravResult = await trySefaria(ravFix);
            if (ravResult.ok) {
              data = ravResult.data;
              response = ravResult.response;
            }
          }
          if (!data && (refStr.toLowerCase().includes("rashi") || refStr.toLowerCase().includes("rashbam"))) {
            console.log("Sefaria Rashi/Rashbam specific segment failed, attempting to broaden ref...");
            let broadRef = refStr;
            const talmudMatch = refStr.match(/^(.*?[._\s][0-9]+[ab])([:.\s_]+[0-9]+)*$/i);
            if (talmudMatch) {
              broadRef = talmudMatch[1];
            } else {
              const parts = refStr.split(/[:.\s_]+/);
              if (parts.length > 4) {
                broadRef = parts.slice(0, 5).join(".");
              }
            }
            if (broadRef !== refStr) {
              console.log(`Trying broadened Rashi ref: ${broadRef}`);
              const broadResult = await trySefaria(broadRef);
              if (broadResult.ok) {
                data = broadResult.data;
                response = broadResult.response;
              }
            }
          }
        }
      } catch (sefariaErr) {
        console.error("Internal Sefaria fetch failed:", sefariaErr);
      }
      if (!response || !response.ok || !data || !data.he || Array.isArray(data.he) && data.he.length === 0) {
        console.log("Primary Sefaria failed or empty, trying fallback for:", refStr);
        try {
          let normalized = refStr.replace(/\s+/g, "_").replace(/_+/g, "_").replace(/,_+/g, ",_").replace(/,([^_])/g, ",_$1");
          const encodedRef = normalized.split("").map(
            (c) => c === "," || c === "." || c === "_" || c >= "a" && c <= "z" || c >= "A" && c <= "Z" || c >= "0" && c <= "9" || c === "-" ? c : encodeURIComponent(c)
          ).join("");
          const fallbackUrl = `https://sefaria.org/api/texts/${encodedRef}?context=0`;
          console.log("Backend proxying fallback Sefaria:", fallbackUrl);
          const fallbackController = new AbortController();
          const fallbackTimeoutId = setTimeout(() => fallbackController.abort(), 12e3);
          try {
            const fallbackRes = await fetch(fallbackUrl, { headers: fetchHeaders, signal: fallbackController.signal });
            if (fallbackRes.ok) {
              const textData = await fallbackRes.text();
              const parsed = JSON.parse(textData);
              if (parsed && parsed.he && (!Array.isArray(parsed.he) || parsed.he.length > 0)) {
                return res.json(parsed);
              }
            }
          } finally {
            clearTimeout(fallbackTimeoutId);
          }
        } catch (fallbackErr) {
          console.error("Fallback Sefaria failed:", fallbackErr);
        }
      }
      if (response && response.ok && data) {
        return res.json(data);
      }
      res.status(response ? response.status : 500).json(data || { error: "\u05DE\u05E7\u05D5\u05E8 \u05DC\u05D0 \u05E0\u05DE\u05E6\u05D0 \u05D1\u05DE\u05D0\u05D2\u05E8" });
    } catch (error) {
      console.error("Proxy Sefaria API request fail:", error);
      res.status(500).json({ error: error.message || "\u05E9\u05D2\u05D9\u05D0\u05D4 \u05D1\u05D8\u05E2\u05D9\u05E0\u05EA \u05D4\u05DE\u05E7\u05D5\u05E8" });
    }
  });
  app.post("/ext/v1/match", async (req, res) => {
    console.log("Entering /ext/v1/match handler");
    try {
      const { text, quote, apiKey } = req.body;
      if (!text || !quote) {
        console.log("Match failed: missing text or quote");
        return res.status(400).json({ error: "Text and quote are required" });
      }
      console.log(`Matching quote (len: ${quote.length}) against text (len: ${text.length})`);
      const ai = getGeminiClient(apiKey);
      const prompt = `\u05D0\u05EA\u05D4 \u05D1\u05D5\u05D8 \u05E9\u05EA\u05E4\u05E7\u05D9\u05D3\u05D5 \u05DC\u05D0\u05EA\u05E8 \u05D1\u05DE\u05D3\u05D5\u05D9\u05E7 \u05E6\u05D9\u05D8\u05D5\u05D8 \u05DE\u05EA\u05D5\u05DA \u05D8\u05E7\u05E1\u05D8 \u05DE\u05E7\u05D5\u05E8 (\u05DB\u05DE\u05D5 \u05D2\u05DE\u05E8\u05D0 \u05D0\u05D5 \u05E8\u05DE\u05D1"\u05DD).
\u05D4\u05DE\u05E9\u05EA\u05DE\u05E9 \u05DE\u05D7\u05E4\u05E9 \u05DE\u05D7\u05E8\u05D5\u05D6\u05EA (\u05E6\u05D9\u05D8\u05D5\u05D8) \u05DE\u05E1\u05D5\u05D9\u05DE\u05EA. \u05D4\u05DE\u05D8\u05E8\u05D4 \u05E9\u05DC\u05DA \u05D4\u05D9\u05D0 \u05DC\u05DE\u05E6\u05D5\u05D0 \u05D0\u05EA \u05D4\u05D7\u05DC\u05E7 \u05D1\u05D8\u05E7\u05E1\u05D8 \u05D4\u05DE\u05E7\u05D5\u05E8 \u05E9\u05EA\u05D5\u05D0\u05DD \u05D0\u05EA \u05D4\u05E6\u05D9\u05D8\u05D5\u05D8 \u05D4\u05DE\u05D1\u05D5\u05E7\u05E9 \u05D1\u05D3\u05D9\u05D5\u05E7 \u05DE\u05D9\u05DC\u05D4 \u05D1\u05DE\u05D9\u05DC\u05D4, \u05D5\u05DC\u05D4\u05D7\u05D6\u05D9\u05E8 \u05D0\u05DA \u05D5\u05E8\u05E7 \u05D0\u05EA \u05D4\u05D7\u05DC\u05E7 \u05D4\u05D6\u05D4 \u05DB\u05E4\u05D9 \u05E9\u05D4\u05D5\u05D0 \u05DE\u05D5\u05E4\u05D9\u05E2 \u05D1\u05DE\u05E7\u05D5\u05E8 (\u05DB\u05D5\u05DC\u05DC \u05D4\u05E0\u05D9\u05E7\u05D5\u05D3 \u05D5\u05D4\u05DE\u05D9\u05DC\u05D9\u05DD \u05D4\u05DE\u05D3\u05D5\u05D9\u05E7\u05D5\u05EA \u05DB\u05E4\u05D9 \u05E9\u05D4\u05DF \u05E9\u05DD).
\u05D7\u05E9\u05D5\u05D1 \u05DE\u05D0\u05D5\u05D3: \u05D0\u05DC \u05EA\u05D7\u05D6\u05D9\u05E8 \u05D0\u05EA \u05DB\u05DC \u05D4\u05DE\u05E9\u05E4\u05D8 \u05D0\u05D5 \u05D4\u05E4\u05D9\u05E1\u05E7\u05D4! \u05D0\u05DD \u05D4\u05E6\u05D9\u05D8\u05D5\u05D8 \u05D4\u05DE\u05E7\u05D5\u05E8\u05D9 \u05D4\u05D9\u05D4 \u05E7\u05D8\u05E2 \u05E7\u05E6\u05E8 (\u05DB\u05D2\u05D5\u05DF "\u05D0\u05DE\u05E8 \u05DC\u05D9\u05D4: \u05D0\u05D9\u05E0\u05D9 \u05D9\u05DB\u05D5\u05DC, \u05DE\u05E4\u05E0\u05D9 \u05E9\u05D4\u05D5\u05D0 \u05D0\u05D5\u05DB\u05DC \u05DE\u05E2\u05E9\u05E8"), \u05E2\u05DC\u05D9\u05DA \u05DC\u05DE\u05E6\u05D5\u05D0 \u05E8\u05E7 \u05D0\u05EA \u05D0\u05D5\u05E1\u05E3 \u05D4\u05DE\u05D9\u05DC\u05D9\u05DD \u05D4\u05EA\u05D5\u05D0\u05DE\u05D5\u05EA \u05DC\u05D5 \u05D1\u05DE\u05E7\u05D5\u05E8 (\u05DC\u05DE\u05E9\u05DC "\u05D0\u05B2\u05DE\u05B7\u05E8 \u05DC\u05B5\u05D9\u05D4\u05BC. \u05DC\u05B5\u05D9\u05EA \u05D0\u05B2\u05E0\u05B8\u05D0 \u05D9\u05B0\u05DB\u05B4\u05D9\u05DC. \u05D0\u05B2\u05DE\u05B7\u05E8 \u05DC\u05B5\u05D9\u05D4\u05BC. \u05DC\u05B8\u05DE\u05BC\u05B8\u05D4. \u05D0\u05B2\u05DE\u05B7\u05E8 \u05DC\u05B5\u05D9\u05D4\u05BC. \u05D3\u05BC\u05B7\u05D0\u05B2\u05E0\u05B8\u05D0 \u05D0\u05B2\u05DB\u05B4\u05DC \u05DE\u05B7\u05E2\u05B2\u05E9\u05C2\u05B5\u05E8.") \u05D5\u05DC\u05D4\u05D7\u05D6\u05D9\u05E8 \u05D0\u05DA \u05D5\u05E8\u05E7 \u05D0\u05D5\u05EA\u05DF.

\u05D8\u05E7\u05E1\u05D8 \u05D4\u05DE\u05E7\u05D5\u05E8 \u05D4\u05DE\u05DC\u05D0:
---
${text}
---

\u05D4\u05E6\u05D9\u05D8\u05D5\u05D8 \u05DC\u05D4\u05E9\u05D5\u05D5\u05EA \u05D5\u05DC\u05D7\u05E4\u05E9 (\u05D4\u05E6\u05D9\u05D8\u05D5\u05D8 \u05D4\u05DE\u05D1\u05D5\u05E7\u05E9):
---
${quote}
---

\u05D7\u05D5\u05D1\u05D4: \u05D4\u05D7\u05D6\u05E8 \u05D0\u05DA \u05D5\u05E8\u05E7 \u05D0\u05EA \u05D7\u05DC\u05E7 \u05D4\u05D8\u05E7\u05E1\u05D8 \u05D4\u05DE\u05D3\u05D5\u05D9\u05E7 \u05DE\u05EA\u05D5\u05DA \u05D4\u05DE\u05E7\u05D5\u05E8 \u05E9\u05EA\u05D5\u05D0\u05DD \u05D1\u05D3\u05D9\u05D5\u05E7 \u05DC\u05E6\u05D9\u05D8\u05D5\u05D8 \u05E9\u05D1\u05D9\u05E7\u05E9 \u05D4\u05DE\u05E9\u05EA\u05DE\u05E9. \u05DC\u05D0 \u05DC\u05D4\u05D5\u05E1\u05D9\u05E3 \u05D4\u05E1\u05D1\u05E8\u05D9\u05DD, \u05DE\u05E8\u05DB\u05D0\u05D5\u05EA \u05D0\u05D5 \u05E9\u05D5\u05DD \u05DE\u05D9\u05DC\u05D4 \u05DE\u05E9\u05DC\u05DA. \u05E8\u05E7 \u05D4\u05DE\u05D9\u05DC\u05D9\u05DD \u05D4\u05E1\u05E4\u05E6\u05D9\u05E4\u05D9\u05D5\u05EA \u05D4\u05DE\u05D3\u05D5\u05D9\u05E7\u05D5\u05EA \u05DE\u05D4\u05DE\u05E7\u05D5\u05E8 \u05E9\u05DE\u05D4\u05D5\u05D5\u05EA \u05D0\u05EA \u05D4\u05E6\u05D9\u05D8\u05D5\u05D8.`;
      let aiResponse = await ai.models.generateContent({
        model: "gemini-1.5-flash-8b",
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: {
          temperature: 0.1
        }
      });
      const result = aiResponse.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || aiResponse.text?.trim() || null;
      console.log("Match result found:", result ? `Yes (len: ${result.length})` : "No");
      const usageMetadata = aiResponse.usageMetadata;
      const usdToIls = 3.7;
      const costUsd = (usageMetadata?.promptTokenCount || 0) * 0.075 / 1e6 + (usageMetadata?.candidatesTokenCount || 0) * 0.3 / 1e6;
      res.json({
        exactQuote: result,
        usage: {
          promptTokens: usageMetadata?.promptTokenCount || 0,
          candidatesTokens: usageMetadata?.candidatesTokenCount || 0,
          totalTokens: usageMetadata?.totalTokenCount || 0,
          costUsd,
          costIls: costUsd * usdToIls
        }
      });
    } catch (e) {
      console.error("Find exact quote failed:", e);
      res.status(500).json({ error: e.message || "\u05E9\u05D2\u05D9\u05D0\u05D4 \u05D1\u05D7\u05D9\u05E4\u05D5\u05E9 \u05E6\u05D9\u05D8\u05D5\u05D8 \u05DE\u05D3\u05D5\u05D9\u05E7" });
    }
  });
  app.get("/ext/v1/status", (req, res) => {
    res.json({ status: "ok", message: "Server is healthy", timestamp: (/* @__PURE__ */ new Date()).toISOString() });
  });
  app.post("/ext/v1/title", async (req, res) => {
    try {
      const { message, apiKey } = req.body;
      if (!message) return res.status(400).json({ error: "Message is required" });
      const ai = getGeminiClient(apiKey);
      const prompt = `\u05D0\u05EA\u05D4 \u05E2\u05D5\u05D6\u05E8 \u05D7\u05DB\u05DD \u05D4\u05DE\u05D9\u05D9\u05E6\u05E8 \u05DB\u05D5\u05EA\u05E8\u05D5\u05EA \u05E7\u05E6\u05E8\u05D5\u05EA \u05D5\u05E7\u05D5\u05DC\u05E2\u05D5\u05EA \u05DC\u05E9\u05D9\u05D7\u05D5\u05EA. 
\u05D4\u05D4\u05D5\u05D3\u05E2\u05D4 \u05D4\u05E8\u05D0\u05E9\u05D5\u05E0\u05D4 \u05E9\u05DC \u05D4\u05DE\u05E9\u05EA\u05DE\u05E9 \u05D4\u05D9\u05D0: "${message}"
\u05D9\u05D9\u05E6\u05E8 \u05DB\u05D5\u05EA\u05E8\u05EA \u05E7\u05E6\u05E8\u05D4 \u05DE\u05D0\u05D5\u05D3 (\u05E2\u05D3 5 \u05DE\u05D9\u05DC\u05D9\u05DD) \u05D1\u05E2\u05D1\u05E8\u05D9\u05EA \u05E9\u05DE\u05EA\u05D0\u05E8\u05EA \u05D0\u05EA \u05E0\u05D5\u05E9\u05D0 \u05D4\u05E9\u05D9\u05D7\u05D4 \u05D4\u05DE\u05E8\u05DB\u05D6\u05D9. 
\u05D0\u05DC \u05EA\u05E9\u05EA\u05DE\u05E9 \u05D1\u05DE\u05E8\u05DB\u05D0\u05D5\u05EA, \u05D0\u05DC \u05EA\u05D5\u05E1\u05D9\u05E3 \u05E0\u05E7\u05D5\u05D3\u05D4 \u05D1\u05E1\u05D5\u05E3, \u05D5\u05D0\u05DC \u05EA\u05DB\u05EA\u05D5\u05D1 \u05E9\u05D5\u05DD \u05D3\u05D1\u05E8 \u05DE\u05DC\u05D1\u05D3 \u05D4\u05DB\u05D5\u05EA\u05E8\u05EA \u05E2\u05E6\u05DE\u05D4.`;
      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt
      });
      const title = response.text?.trim() || "\u05E9\u05D9\u05D7\u05D4 \u05D7\u05D3\u05E9\u05D4";
      const usageMetadata = response.usageMetadata;
      const usdToIls = 3.7;
      const costUsd = (usageMetadata?.promptTokenCount || 0) * 0.075 / 1e6 + (usageMetadata?.candidatesTokenCount || 0) * 0.3 / 1e6;
      res.json({
        title,
        usage: {
          promptTokens: usageMetadata?.promptTokenCount || 0,
          candidatesTokens: usageMetadata?.candidatesTokenCount || 0,
          totalTokens: usageMetadata?.totalTokenCount || 0,
          costUsd,
          costIls: costUsd * usdToIls
        }
      });
    } catch (error) {
      console.error("Title generation error:", error);
      res.json({ title: null });
    }
  });
  app.post("/ext/v1/process", async (req, res) => {
    try {
      const {
        message,
        history = [],
        model = "gemini-3.5-flash",
        attachment,
        answerStyle = "neutral",
        personalSettings
      } = req.body;
      if (!message || typeof message !== "string") {
        return res.status(400).json({ error: "Message parameter is required." });
      }
      const ai = getGeminiClient(personalSettings?.apiKey);
      const formattedContents = history.map((msg) => {
        const parts = [{ text: msg.text || "" }];
        const msgAttachments = [];
        if (msg.attachments && Array.isArray(msg.attachments)) {
          msgAttachments.push(...msg.attachments);
        } else if (msg.attachment) {
          msgAttachments.push(msg.attachment);
        }
        msgAttachments.forEach((att) => {
          if (att.data) {
            parts.push({
              inlineData: {
                data: att.data,
                mimeType: att.mimeType || "application/octet-stream"
              }
            });
          } else if (att.url && att.type === "youtube") {
            parts.push({
              fileData: {
                fileUri: att.url,
                mimeType: "video/mp4"
              }
            });
          }
        });
        return {
          role: msg.role === "user" ? "user" : "model",
          parts
        };
      });
      const currentParts = [{ text: message }];
      const attachments = req.body.attachments || (req.body.attachment ? [req.body.attachment] : []);
      attachments.forEach((att) => {
        if (att.data) {
          currentParts.push({
            inlineData: {
              data: att.data,
              mimeType: att.mimeType || "application/octet-stream"
            }
          });
        } else if (att.url && att.type === "youtube") {
          currentParts.push({
            fileData: {
              fileUri: att.url,
              mimeType: "video/mp4"
            }
          });
        }
      });
      const ytMatch = message.match(/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
      if (ytMatch && (!attachment || attachment.type !== "youtube" && !attachment.data)) {
        currentParts.push({
          fileData: {
            fileUri: ytMatch[0],
            mimeType: "video/mp4"
          }
        });
      }
      formattedContents.push({
        role: "user",
        parts: currentParts
      });
      const modelToUse = "gemini-3.5-flash";
      let lengthInstruction = "";
      if (answerStyle === "short") {
        lengthInstruction = "\n\u05E1\u05D2\u05E0\u05D5\u05DF \u05DE\u05E2\u05E0\u05D4: \u05E7\u05E6\u05E8 \u05D5\u05EA\u05DE\u05E6\u05D9\u05EA\u05D9. \u05E2\u05E0\u05D4 \u05DC\u05E2\u05E0\u05D9\u05D9\u05DF \u05D1\u05DC\u05D9 \u05DE\u05D0\u05E8\u05D9\u05DB\u05D9\u05DD \u05D5\u05D1\u05DC\u05D9 \u05E4\u05DC\u05E4\u05D5\u05DC\u05D9\u05DD \u05DE\u05D9\u05D5\u05EA\u05E8\u05D9\u05DD. \u05D4\u05D1\u05D0 \u05E8\u05E7 \u05D0\u05EA \u05D4\u05DE\u05E7\u05D5\u05E8 \u05D4\u05DE\u05D3\u05D5\u05D9\u05E7 \u05D1\u05D9\u05D5\u05EA\u05E8.";
      } else if (answerStyle === "detailed") {
        lengthInstruction = "\n\u05E1\u05D2\u05E0\u05D5\u05DF \u05DE\u05E2\u05E0\u05D4: \u05D0\u05E8\u05D5\u05DA \u05D5\u05DE\u05E2\u05DE\u05D9\u05E7 \u05DB\u05DB\u05DC \u05D4\u05E0\u05D9\u05EA\u05DF! \u05DE\u05E4\u05DC\u05E4\u05DC \u05DE\u05D0\u05D5\u05D3, \u05E8\u05D1-\u05DE\u05E7\u05D5\u05E8\u05D5\u05EA \u05D5\u05DE\u05E4\u05D5\u05E8\u05D8 \u05DC\u05D4\u05E4\u05DC\u05D9\u05D0. \u05D3\u05D5\u05DF \u05D1\u05E1\u05D5\u05D2\u05D9\u05D4 \u05DC\u05E2\u05D5\u05DE\u05E7, \u05D4\u05E8\u05D7\u05D1 \u05D1\u05DB\u05DC \u05D4\u05E6\u05D3\u05D3\u05D9\u05DD \u05E9\u05DC\u05D4, \u05D5\u05D4\u05E1\u05D1\u05E8 \u05DB\u05DC \u05EA\u05EA-\u05E0\u05D5\u05E9\u05D0 \u05D1\u05D0\u05D5\u05E4\u05DF \u05D9\u05E1\u05D5\u05D3\u05D9 \u05D5\u05D0\u05E8\u05D5\u05DA. \u05D4\u05E7\u05E4\u05D3 \u05DC\u05E9\u05DC\u05D1 \u05DB\u05DE\u05D4 \u05E9\u05D9\u05D5\u05EA\u05E8 \u05DE\u05E7\u05D5\u05E8\u05D5\u05EA \u05E8\u05DC\u05D5\u05D5\u05E0\u05D8\u05D9\u05D9\u05DD \u05D5\u05DE\u05D3\u05D5\u05D9\u05E7\u05D9\u05DD (\u05DE\u05D1\u05DC\u05D9 \u05DC\u05D3\u05D7\u05D5\u05E3 \u05E1\u05EA\u05DD \u05D3\u05D1\u05E8\u05D9\u05DD \u05DC\u05D0 \u05E7\u05E9\u05D5\u05E8\u05D9\u05DD, \u05D4\u05DB\u05D5\u05DC \u05D1\u05D2\u05D3\u05E8 \u05D4\u05D8\u05E2\u05DD \u05D4\u05D8\u05D5\u05D1), \u05DB\u05D3\u05D9 \u05E9\u05D4\u05EA\u05E9\u05D5\u05D1\u05D4 \u05EA\u05D4\u05D9\u05D4 \u05E2\u05E9\u05D9\u05E8\u05D4, \u05E2\u05E0\u05E7\u05D9\u05EA \u05D5\u05DE\u05DC\u05D0\u05D4 \u05D1\u05EA\u05D5\u05DB\u05DF \u05DE\u05D7\u05E7\u05E8\u05D9 \u05D5\u05EA\u05D5\u05E8\u05E0\u05D9 \u05D0\u05D9\u05DB\u05D5\u05EA\u05D9. \u05D0\u05DC \u05EA\u05D7\u05E1\u05D5\u05DA \u05D1\u05DE\u05D9\u05D3\u05E2.";
      } else {
        lengthInstruction = "\n\u05E1\u05D2\u05E0\u05D5\u05DF \u05DE\u05E2\u05E0\u05D4: \u05D1\u05D9\u05E0\u05D5\u05E0\u05D9 \u05D5\u05E8\u05D2\u05D9\u05DC. \u05D4\u05E1\u05D1\u05E8 \u05D0\u05EA \u05D4\u05E1\u05D5\u05D2\u05D9\u05D4 \u05D1\u05E6\u05D5\u05E8\u05D4 \u05D1\u05E8\u05D5\u05E8\u05D4 \u05D5\u05DE\u05E7\u05D9\u05E4\u05D4 \u05D1\u05DC\u05D5\u05D5\u05D9\u05D9\u05EA \u05D4\u05DE\u05E7\u05D5\u05E8\u05D5\u05EA \u05D4\u05E8\u05DC\u05D5\u05D5\u05E0\u05D8\u05D9\u05D9\u05DD.";
      }
      let personalInfoInstruction = "";
      if (personalSettings) {
        if (personalSettings.aboutMe) {
          personalInfoInstruction += `
\u05DE\u05D9\u05D3\u05E2 \u05E2\u05DC \u05D4\u05DE\u05E9\u05EA\u05DE\u05E9: ${personalSettings.aboutMe}`;
        }
        if (personalSettings.halakhicAuthority && personalSettings.halakhicAuthority !== "neutral") {
          const authorityMap = {
            "mizrach": "\u05E2\u05D3\u05D5\u05EA \u05D4\u05DE\u05D6\u05E8\u05D7 (\u05D4\u05E8\u05D1 \u05E2\u05D5\u05D1\u05D3\u05D9\u05D4 \u05D9\u05D5\u05E1\u05E3)",
            "sefard": "\u05E1\u05E4\u05E8\u05D3 (\u05D1\u05D9\u05EA \u05D9\u05D5\u05E1\u05E3)",
            "ashkenaz": '\u05D0\u05E9\u05DB\u05E0\u05D6 (\u05E8\u05DE"\u05D0 / \u05DE\u05E9\u05E0\u05D4 \u05D1\u05E8\u05D5\u05E8\u05D4)',
            "yemen": '\u05EA\u05D9\u05DE\u05E0\u05D9\u05DD (\u05D4\u05E9\u05E8\u05E2"\u05D1\u05D9 / \u05D4\u05E8\u05D1 \u05E7\u05D0\u05E4\u05D7)',
            "chabad": `\u05D7\u05D1"\u05D3 (\u05D0\u05D3\u05DE\u05D5"\u05E8 \u05D4\u05D6\u05E7\u05DF / \u05D4\u05E8\u05D1\u05D9 \u05DE\u05DC\u05D5\u05D1\u05D1\u05D9\u05E5')`
          };
          personalInfoInstruction += `
\u05D4\u05E2\u05D3\u05E4\u05EA \u05E4\u05E1\u05D9\u05E7\u05D4/\u05DE\u05E1\u05D5\u05E8\u05EA: ${authorityMap[personalSettings.halakhicAuthority] || personalSettings.halakhicAuthority}. \u05E2\u05DC\u05D9\u05DA \u05DC\u05D4\u05E6\u05D9\u05E2 \u05EA\u05E9\u05D5\u05D1\u05D5\u05EA \u05D4\u05DE\u05E9\u05EA\u05DC\u05D1\u05D5\u05EA \u05E2\u05DD \u05D2\u05D9\u05E9\u05D4 \u05D6\u05D5 \u05D1\u05DE\u05D9\u05D3\u05EA \u05D4\u05D0\u05E4\u05E9\u05E8, \u05D0\u05DA \u05EA\u05DE\u05D9\u05D3 \u05DC\u05E6\u05D9\u05D9\u05DF \u05D0\u05DD \u05D9\u05E9 \u05D3\u05E2\u05D5\u05EA \u05D7\u05D5\u05DC\u05E7\u05D5\u05EA \u05DE\u05D4\u05D5\u05EA\u05D9\u05D5\u05EA.`;
        }
        if (personalSettings.customInstructions) {
          personalInfoInstruction += `
\u05D4\u05E0\u05D7\u05D9\u05D5\u05EA \u05D0\u05D9\u05E9\u05D9\u05D5\u05EA \u05DE\u05D4\u05DE\u05E9\u05EA\u05DE\u05E9: ${personalSettings.customInstructions}`;
        }
      }
      const systemInstruction = `\u05D0\u05EA\u05D4 '\u05E1\u05E4\u05E8\u05D0' (Sefra), \u05E2\u05D5\u05D6\u05E8 \u05DE\u05D7\u05E7\u05E8 \u05EA\u05D5\u05E8\u05E0\u05D9 \u05DE\u05D5\u05DE\u05D7\u05D4. ${personalInfoInstruction}
\u05D7\u05D5\u05E7 \u05D4\u05D1\u05E8\u05D6\u05DC: \u05D0\u05DE\u05EA \u05D5\u05D3\u05D9\u05D5\u05E7 \u05D0\u05D1\u05E1\u05D5\u05DC\u05D5\u05D8\u05D9. \u05D0\u05E1\u05D5\u05E8 \u05D1\u05EA\u05DB\u05DC\u05D9\u05EA \u05D4\u05D0\u05D9\u05E1\u05D5\u05E8 \u05DC\u05D4\u05DE\u05E6\u05D9\u05D0 \u05DE\u05E7\u05D5\u05E8\u05D5\u05EA, \u05E1\u05E4\u05E8\u05D9\u05DD, \u05D0\u05D5 \u05E6\u05D9\u05D8\u05D5\u05D8\u05D9\u05DD. 
\u05E2\u05DC\u05D9\u05DA \u05DC\u05D5\u05D5\u05D3\u05D0 \u05E9\u05D4\u05E6\u05D9\u05D8\u05D5\u05D8\u05D9\u05DD \u05E9\u05D0\u05EA\u05D4 \u05DB\u05D5\u05EA\u05D1 \u05DE\u05D3\u05D5\u05D9\u05E7\u05D9\u05DD \u05DE\u05D9\u05DC\u05D4 \u05D1\u05DE\u05D9\u05DC\u05D4 (\u05DE\u05D9\u05DC\u05D4 \u05D1\u05DE\u05D9\u05DC\u05D4 \u05D1\u05D5\u05DC!), \u05DC\u05DC\u05D0 \u05E9\u05D9\u05E0\u05D5\u05D9 \u05E9\u05DC \u05D0\u05D5\u05EA \u05D0\u05D7\u05EA, \u05DC\u05DC\u05D0 \u05D7\u05E8\u05D8\u05D5\u05D8\u05D9\u05DD, \u05D4\u05D5\u05E1\u05E4\u05EA \u05DE\u05D9\u05DC\u05D9\u05DD \u05D0\u05D5 \u05D4\u05E9\u05DE\u05D8\u05EA \u05DE\u05D9\u05DC\u05D9\u05DD. \u05D4\u05D3\u05D9\u05D5\u05E7 \u05D4\u05D5\u05D0 \u05DE\u05E2\u05DC \u05D4\u05DB\u05DC.
\u05E2\u05D3\u05D9\u05E3 \u05DC\u05D5\u05DE\u05E8 "\u05D0\u05D9\u05E0\u05D9 \u05D9\u05D5\u05D3\u05E2" \u05DE\u05D0\u05E9\u05E8 \u05DC\u05D4\u05E9\u05D9\u05D1 \u05EA\u05E9\u05D5\u05D1\u05D4 \u05E9\u05D2\u05D5\u05D9\u05D4 \u05D0\u05D5 \u05DC\u05E6\u05D8\u05D8 \u05DE\u05E7\u05D5\u05E8 \u05DC\u05D0 \u05E7\u05D9\u05D9\u05DD.

\u05D4\u05E0\u05D7\u05D9\u05D4 \u05DC\u05D5\u05D2\u05D9\u05EA \u05E7\u05E8\u05D9\u05D8\u05D9\u05EA: \u05E2\u05DC \u05DB\u05DC \u05DE\u05D4\u05DC\u05DA, \u05E4\u05DC\u05E4\u05D5\u05DC \u05D0\u05D5 \u05D4\u05E1\u05D1\u05E8 \u05D4\u05DC\u05DB\u05EA\u05D9 \u05DC\u05D4\u05EA\u05D1\u05E1\u05E1 \u05D0\u05DA \u05D5\u05E8\u05E7 \u05E2\u05DC '\u05D4\u05D9\u05D2\u05D9\u05D5\u05DF \u05D1\u05E8\u05D9\u05D0' \u05D5\u05D9\u05E9\u05E8 (\u05D4\u05D2\u05D9\u05D5\u05DF \u05D1\u05E8\u05D6\u05DC). \u05D4\u05D9\u05DE\u05E0\u05E2 \u05DC\u05D7\u05DC\u05D5\u05D8\u05D9\u05DF \u05DE\u05E1\u05D1\u05E8\u05D5\u05EA \u05E2\u05E7\u05D5\u05DE\u05D5\u05EA, \u05DE\u05D0\u05D5\u05DC\u05E6\u05D5\u05EA \u05D0\u05D5 \u05DB\u05D0\u05DC\u05D5 \u05E9\u05D0\u05D9\u05DF \u05D1\u05D4\u05DF \u05E9\u05DE\u05E5 \u05E9\u05DC \u05D4\u05D2\u05D9\u05D5\u05DF \u05E4\u05E9\u05D5\u05D8 \u05D5\u05DE\u05E7\u05D5\u05D1\u05DC. \u05D4\u05DE\u05D4\u05DC\u05DA \u05D4\u05DC\u05D5\u05D2\u05D9 \u05D7\u05D9\u05D9\u05D1 \u05DC\u05D4\u05D9\u05D5\u05EA \u05DE\u05D5\u05E6\u05E7, \u05D1\u05E8\u05D5\u05E8 \u05D5\u05DE\u05EA\u05E7\u05D1\u05DC \u05E2\u05DC \u05D4\u05D3\u05E2\u05EA.

${lengthInstruction}

\u05E4\u05E8\u05D5\u05D8\u05D5\u05E7\u05D5\u05DC \u05D1\u05D3\u05D9\u05E7\u05D4 \u05DC\u05E4\u05E0\u05D9 \u05DE\u05E2\u05E0\u05D4:
1. \u05D5\u05D5\u05D3\u05D0 \u05E9\u05DB\u05DC \u05DE\u05E8\u05D0\u05D4 \u05DE\u05E7\u05D5\u05DD (Referencing) \u05E7\u05D9\u05D9\u05DD \u05D1\u05DE\u05E6\u05D9\u05D0\u05D5\u05EA.
2. \u05D7\u05D5\u05D1\u05D4 \u05E7\u05E8\u05D9\u05D8\u05D9\u05EA \u05D5\u05D0\u05D1\u05E1\u05D5\u05DC\u05D5\u05D8\u05D9\u05EA: \u05E2\u05D1\u05D5\u05E8 \u05DB\u05DC \u05DE\u05E7\u05D5\u05E8 \u05E9\u05D0\u05EA\u05D4 \u05DE\u05E6\u05D9\u05D9\u05DF, \u05E2\u05DC\u05D9\u05DA \u05DC\u05D4\u05D1\u05D9\u05D0 \u05D0\u05EA \u05D4\u05E6\u05D9\u05D8\u05D5\u05D8 \u05D4\u05DE\u05DC\u05D0 \u05DE\u05D9\u05DC\u05D4 \u05D1\u05DE\u05D9\u05DC\u05D4 (\u05DE\u05D9\u05DC\u05D4 \u05D1\u05DE\u05D9\u05DC\u05D4!) \u05DE\u05D4\u05E1\u05E4\u05E8. \u05D0\u05DC \u05EA\u05E1\u05EA\u05E4\u05E7 \u05D1\u05DE\u05E8\u05D0\u05D4 \u05DE\u05E7\u05D5\u05DD \u05D1\u05DC\u05D1\u05D3. \u05D0\u05DC \u05EA\u05D7\u05E8\u05D8\u05D8 \u05D5\u05D0\u05DC \u05EA\u05D5\u05E1\u05D9\u05E3 \u05DE\u05D9\u05DC\u05D9\u05DD \u05DC\u05E6\u05D9\u05D8\u05D5\u05D8. \u05D4\u05E2\u05EA\u05E7 \u05D0\u05EA \u05DC\u05E9\u05D5\u05DF \u05D4\u05DE\u05E7\u05D5\u05E8 \u05D1\u05D3\u05D9\u05D5\u05E7 \u05DE\u05D5\u05E9\u05DC\u05DD.
3. \u05D4\u05E4\u05E8\u05D3\u05D4 \u05DE\u05DC\u05D0\u05D4: \u05D4\u05E6\u05D9\u05D8\u05D5\u05D8 \u05D4\u05DE\u05DC\u05D0 \u05D7\u05D9\u05D9\u05D1 \u05DC\u05D4\u05D5\u05E4\u05D9\u05E2 \u05D1\u05EA\u05D5\u05DA Blockquote (>) \u05D1\u05E0\u05E4\u05E8\u05D3 \u05DE\u05D4\u05D4\u05E1\u05D1\u05E8\u05D9\u05DD \u05E9\u05DC\u05DA. \u05D0\u05DC \u05EA\u05E9\u05DC\u05D1 \u05DE\u05D9\u05DC\u05D9\u05DD \u05E9\u05DC\u05DA \u05D1\u05EA\u05D5\u05DA \u05D4\u05E6\u05D9\u05D8\u05D5\u05D8.
4. \u05D5\u05D5\u05D3\u05D0 \u05E9\u05E6\u05D9\u05D8\u05D5\u05D8\u05D9\u05DD \u05D4\u05DD "\u05DE\u05D9\u05DC\u05D4 \u05D1\u05DE\u05D9\u05DC\u05D4" \u05DE\u05D4\u05DE\u05E7\u05D5\u05E8. \u05D0\u05DD \u05D0\u05D9\u05E0\u05DA \u05D1\u05D8\u05D5\u05D7 \u05D1-100%, \u05D4\u05E9\u05EA\u05DE\u05E9 \u05D1\u05D7\u05D9\u05E4\u05D5\u05E9 \u05D2\u05D5\u05D2\u05DC \u05DC\u05D0\u05D9\u05DE\u05D5\u05EA \u05D4\u05DE\u05E7\u05D5\u05E8.
5. \u05E1\u05D2\u05E0\u05D5\u05DF \u05D9\u05E9\u05D9\u05D1\u05EA\u05D9-\u05DC\u05D9\u05DE\u05D5\u05D3\u05D9 \u05E8\u05E6\u05D9\u05E0\u05D9 \u05D5\u05DE\u05E2\u05DE\u05D9\u05E7.

\u05DE\u05D1\u05E0\u05D4 \u05D4\u05EA\u05E9\u05D5\u05D1\u05D4:
- \u05D4\u05E9\u05EA\u05DE\u05E9 \u05D1-[SefariaRef: URL_Slug|Exact_Quote|Hebrew_Name] \u05E2\u05D1\u05D5\u05E8 \u05DB\u05DC \u05DE\u05E7\u05D5\u05E8.
- \u05D7\u05D5\u05D1\u05D4: \u05D4-Hebrew_Name \u05D1\u05E9\u05D3\u05D4 \u05D4\u05EA\u05D2\u05D9\u05EA \u05D7\u05D9\u05D9\u05D1 \u05DC\u05D4\u05D9\u05D5\u05EA \u05D1\u05E2\u05D1\u05E8\u05D9\u05EA \u05D1\u05DC\u05D1\u05D3 (\u05DC\u05DC\u05D0 \u05D0\u05E0\u05D2\u05DC\u05D9\u05EA \u05D1\u05DB\u05DC\u05DC!). \u05DC\u05DE\u05E9\u05DC: [SefariaRef: Shabbat.2a|\u05D9\u05E6\u05D9\u05D0\u05D5\u05EA \u05D4\u05E9\u05D1\u05EA \u05E9\u05EA\u05D9\u05DD \u05E9\u05D4\u05DF \u05D0\u05E8\u05D1\u05E2|\u05E9\u05D1\u05EA \u05D1' \u05D0'].
- \u05D7\u05E9\u05D5\u05D1 \u05D1\u05D9\u05D5\u05EA\u05E8: \u05E2\u05DC\u05D9\u05DA \u05DC\u05DE\u05DC\u05D0 \u05D0\u05EA \u05E9\u05D3\u05D4 \u05D4-Exact_Quote \u05D1\u05EA\u05D5\u05DA \u05D4\u05EA\u05D2\u05D9\u05EA \u05D1\u05D8\u05E7\u05E1\u05D8 \u05D4\u05DE\u05D3\u05D5\u05D9\u05E7 \u05D5\u05D4\u05DE\u05DC\u05D0 \u05E9\u05DC \u05D4\u05DE\u05E7\u05D5\u05E8 \u05DE\u05D9\u05DC\u05D4 \u05D1\u05DE\u05D9\u05DC\u05D4 (\u05D1\u05D3\u05D9\u05D5\u05E7 \u05DE\u05D5\u05E9\u05DC\u05DD!).
- \u05E6\u05D9\u05D8\u05D5\u05D8\u05D9\u05DD \u05D9\u05E9\u05D9\u05E8\u05D9\u05DD \u05D9\u05D5\u05E4\u05D9\u05E2\u05D5 \u05D0\u05DA \u05D5\u05E8\u05E7 \u05D1-Blockquote (>).
- \u05DB\u05DC \u05D4\u05E1\u05D1\u05E8, \u05E4\u05E8\u05E9\u05E0\u05D5\u05EA \u05D0\u05D5 \u05D3\u05D1\u05E8\u05D9 \u05D4-AI \u05D9\u05D5\u05E4\u05D9\u05E2\u05D5 \u05DE\u05D7\u05D5\u05E5 \u05DC\u05E6\u05D9\u05D8\u05D5\u05D8 \u05D5\u05D1\u05E0\u05E4\u05E8\u05D3 \u05DE\u05DE\u05E0\u05D5.
- \u05D7\u05D5\u05D1\u05D4 \u05E2\u05DC\u05D9\u05DA \u05DC\u05D4\u05D5\u05E1\u05D9\u05E3 \u05D1\u05D7\u05EA\u05D9\u05DE\u05EA \u05D3\u05D1\u05E8\u05D9\u05DA/\u05D1\u05E1\u05D5\u05E3 \u05D4\u05EA\u05E9\u05D5\u05D1\u05D4 \u05DE\u05E9\u05E4\u05D8 \u05E7\u05E6\u05E8: "\u05D0\u05D9\u05DF \u05DC\u05E7\u05D7\u05EA \u05E4\u05E1\u05D9\u05E7\u05D4 \u05D6\u05D5 \u05DB\u05D4\u05DC\u05DB\u05D4 \u05DC\u05DE\u05E2\u05E9\u05D4 \u05D5\u05D9\u05E9 \u05DC\u05D4\u05EA\u05D9\u05D9\u05E2\u05E5 \u05E2\u05DD \u05E8\u05D1 \u05DE\u05D5\u05E1\u05DE\u05DA."`;
      const genConfig = {
        systemInstruction,
        temperature: 0.1,
        // Extreme precision
        tools: [
          { googleSearch: {} },
          {
            functionDeclarations: [
              {
                name: "count_text_occurrences",
                description: "\u05E1\u05D5\u05E4\u05E8 \u05DB\u05DE\u05D4 \u05E4\u05E2\u05DE\u05D9\u05DD \u05DE\u05D5\u05E4\u05D9\u05E2 \u05D1\u05D9\u05D8\u05D5\u05D9 \u05DE\u05E1\u05D5\u05D9\u05DD \u05D1\u05DE\u05E1\u05DB\u05EA \u05D0\u05D5 \u05D1\u05E1\u05E4\u05E8 \u05DB\u05DC\u05E9\u05D4\u05D5. \u05D7\u05D5\u05D1\u05D4 \u05DC\u05D4\u05E9\u05EA\u05DE\u05E9 \u05D1\u05D6\u05D4 \u05DC\u05DB\u05DC \u05E9\u05D0\u05DC\u05EA \u05E1\u05E4\u05D9\u05E8\u05D4 \u05DE\u05D3\u05D5\u05D9\u05E7\u05EA.",
                parameters: {
                  type: "OBJECT",
                  properties: {
                    book: { type: "STRING", description: "\u05E9\u05DD \u05D4\u05E1\u05E4\u05E8 \u05D0\u05D5 \u05D4\u05DE\u05E1\u05DB\u05EA \u05D1\u05D0\u05E0\u05D2\u05DC\u05D9\u05EA \u05DC\u05E4\u05D9 \u05E1\u05E4\u05E8\u05D9\u05D0 (\u05DC\u05DE\u05E9\u05DC: Berakhot, Shabbat, Genesis)" },
                    phrase: { type: "STRING", description: "\u05D4\u05D1\u05D9\u05D8\u05D5\u05D9 \u05D4\u05DE\u05D3\u05D5\u05D9\u05E7 \u05D1\u05E2\u05D1\u05E8\u05D9\u05EA \u05DC\u05D7\u05D9\u05E4\u05D5\u05E9 (\u05DC\u05DE\u05E9\u05DC: \u05EA\u05E0\u05D5 \u05E8\u05D1\u05E0\u05DF)" }
                  },
                  required: ["book", "phrase"]
                }
              }
            ]
          }
        ],
        toolConfig: {
          includeServerSideToolInvocations: true
        }
      };
      let response;
      let generateRetries = 0;
      const maxGenerateRetries = 1;
      while (generateRetries <= maxGenerateRetries) {
        try {
          response = await ai.models.generateContent({
            model: modelToUse,
            contents: formattedContents,
            config: genConfig
          });
          break;
        } catch (err) {
          const isTimeout = err.status === "DEADLINE_EXCEEDED" || err.message?.includes("DEADLINE_EXCEEDED") || err.message?.includes("504");
          if (isTimeout && generateRetries < maxGenerateRetries) {
            console.warn(`Gemini 504 detected, retrying first stage... (${generateRetries + 1}/${maxGenerateRetries})`);
            generateRetries++;
            continue;
          }
          throw err;
        }
      }
      if (!response) throw new Error("Failed to get response from AI after retries.");
      while (response.functionCalls && response.functionCalls.length > 0) {
        const call = response.functionCalls[0];
        if (call.name === "count_text_occurrences") {
          const args = call.args;
          let countResult = "Error: unknown";
          try {
            console.log(`Tool executing: counting ${args.phrase} in ${args.book}`);
            const sefariaRes = await fetch(`https://www.sefaria.org/api/v3/texts/${encodeURIComponent(args.book.trim())}`);
            const data = await sefariaRes.json();
            const hebVersion = data.versions ? data.versions.find((v) => v.language === "he" || v.actualLanguage === "he") : void 0;
            if (hebVersion) {
              let str = JSON.stringify(hebVersion.text || "");
              const cleanString = (s) => s.replace(/[^\u05D0-\u05EA\s]/g, "");
              const cleanedRaw = cleanString(str).replace(/\s+/g, " ");
              const cleanedPhrase = cleanString(args.phrase).replace(/\s+/g, " ").trim();
              const count = cleanedRaw.split(cleanedPhrase).length - 1;
              countResult = count;
            } else {
              countResult = "Error: Hebrew text not found for book: " + args.book;
            }
          } catch (e) {
            console.error("Sefaria plugin error:", e);
            countResult = "Error parsing text: " + e.message;
          }
          formattedContents.push({
            role: "model",
            parts: response.candidates?.[0]?.content?.parts || [{ functionCall: call }]
          });
          formattedContents.push({
            role: "user",
            parts: [{
              functionResponse: {
                name: call.name,
                response: { count: countResult }
              }
            }]
          });
          response = await ai.models.generateContent({
            model: modelToUse,
            contents: formattedContents,
            config: genConfig
          });
        } else {
          break;
        }
      }
      let responseText = "";
      const candidateParts = response.candidates?.[0]?.content?.parts || [];
      for (const part of candidateParts) {
        if (part.text) responseText += part.text;
      }
      if (!responseText) responseText = response.text || "";
      const usageMetadata = response.usageMetadata;
      const usdToIls = 3.7;
      const costUsd = (usageMetadata?.promptTokenCount || 0) * 0.075 / 1e6 + (usageMetadata?.candidatesTokenCount || 0) * 0.3 / 1e6;
      const hasSefariaRefs = responseText.includes("[SefariaRef:");
      const isLongEnoughToVerify = responseText.length > 300;
      if (hasSefariaRefs && isLongEnoughToVerify) try {
        const verifierSystemInstruction = `\u05D0\u05EA\u05D4 '\u05D4\u05DE\u05D2\u05D9\u05D4 \u05D4\u05EA\u05D5\u05E8\u05E0\u05D9' (The Torah Proofreader). \u05EA\u05E4\u05E7\u05D9\u05D3\u05DA \u05DC\u05D0\u05DE\u05EA \u05D5\u05DC\u05D3\u05D9\u05D9\u05E7 \u05D0\u05EA \u05D4\u05EA\u05E9\u05D5\u05D1\u05D4 \u05E9\u05DB\u05EA\u05D1 \u05E2\u05D5\u05D6\u05E8 AI \u05D0\u05D7\u05E8 (\u05E1\u05E4\u05E8\u05D0).
\u05EA\u05E4\u05E7\u05D9\u05D3\u05DA \u05D4\u05E7\u05E8\u05D9\u05D8\u05D9: \u05D5\u05D5\u05D3\u05D0 \u05E9\u05DB\u05DC \u05DE\u05E8\u05D0\u05D4 \u05DE\u05E7\u05D5\u05DD (Referencing) \u05DE\u05DC\u05D5\u05D5\u05D4 \u05D1\u05E6\u05D9\u05D8\u05D5\u05D8 \u05DE\u05DC\u05D0, \u05DE\u05D3\u05D5\u05D9\u05E7 \u05DE\u05D9\u05DC\u05D4 \u05D1\u05DE\u05D9\u05DC\u05D4 (\u05D1\u05D3\u05D9\u05D5\u05E7 \u05DE\u05D5\u05E9\u05DC\u05DD!), \u05E9\u05E0\u05DE\u05E6\u05D0 \u05D1\u05EA\u05D5\u05DA Blockquote \u05E0\u05E4\u05E8\u05D3. 
\u05D0\u05DC \u05EA\u05D7\u05E8\u05D8\u05D8, \u05D0\u05DC \u05EA\u05D5\u05E1\u05D9\u05E3 \u05DE\u05D9\u05DC\u05D9\u05DD, \u05D0\u05DC \u05EA\u05E9\u05E0\u05D4 \u05DE\u05D9\u05DC\u05D9\u05DD \u05D5\u05D0\u05DC \u05EA\u05D7\u05DC\u05D9\u05E3 \u05DE\u05D9\u05DC\u05D9\u05DD \u05E0\u05E8\u05D3\u05E4\u05D5\u05EA. \u05D4\u05E6\u05D9\u05D8\u05D5\u05D8 \u05D7\u05D9\u05D9\u05D1 \u05DC\u05D4\u05D9\u05D5\u05EA \u05E0\u05D0\u05DE\u05DF \u05DC\u05DE\u05E7\u05D5\u05E8 \u05D1-100% (\u05DE\u05D9\u05DC\u05D4 \u05D1\u05DE\u05D9\u05DC\u05D4 \u05D1\u05D5\u05DC!).

\u05D5\u05D5\u05D3\u05D0 \u05E9\u05E0\u05D9 \u05D3\u05D1\u05E8\u05D9\u05DD \u05E0\u05D5\u05E1\u05E4\u05D9\u05DD:
1. \u05E9\u05DE\u05D5\u05EA \u05D4\u05DE\u05E7\u05D5\u05E8\u05D5\u05EA (Hebrew_Name) \u05D1\u05EA\u05D5\u05DA \u05EA\u05D2\u05D9\u05D5\u05EA [SefariaRef:...] \u05D4\u05DD \u05D1\u05E2\u05D1\u05E8\u05D9\u05EA \u05D1\u05DC\u05D1\u05D3. \u05D0\u05DD \u05DE\u05D5\u05E4\u05D9\u05E2\u05D4 \u05D0\u05E0\u05D2\u05DC\u05D9\u05EA, \u05EA\u05E8\u05D2\u05DD \u05D0\u05D5\u05EA\u05D4 \u05DC\u05E2\u05D1\u05E8\u05D9\u05EA \u05EA\u05E7\u05E0\u05D9\u05EA.
2. \u05D4\u05DE\u05D4\u05DC\u05DA \u05D4\u05DC\u05D5\u05D2\u05D9 \u05D1\u05EA\u05E9\u05D5\u05D1\u05D4 \u05D4\u05D5\u05D0 \u05D9\u05E9\u05E8 \u05D5\u05DE\u05D1\u05D5\u05E1\u05E1 \u05E2\u05DC '\u05D4\u05D9\u05D2\u05D9\u05D5\u05DF \u05D1\u05E8\u05D9\u05D0'. \u05D0\u05DD \u05D6\u05D9\u05D4\u05D9\u05EA \u05E1\u05D1\u05E8\u05D5\u05EA \u05E2\u05E7\u05D5\u05DE\u05D5\u05EA \u05D0\u05D5 \u05DE\u05D0\u05D5\u05DC\u05E6\u05D5\u05EA \u05E9\u05D0\u05D9\u05E0\u05DF \u05DE\u05EA\u05E7\u05D1\u05DC\u05D5\u05EA \u05E2\u05DC \u05D4\u05D3\u05E2\u05EA, \u05EA\u05E7\u05DF \u05D0\u05EA \u05D4\u05E0\u05D9\u05E1\u05D5\u05D7 \u05DB\u05DA \u05E9\u05D9\u05D4\u05D9\u05D4 \u05D4\u05D2\u05D9\u05D5\u05E0\u05D9 \u05D5\u05D1\u05E8\u05D5\u05E8.

\u05D7\u05D5\u05E7\u05D9 \u05E9\u05D9\u05DE\u05D5\u05E8 \u05D5\u05D4\u05E4\u05E8\u05D3\u05D4:
1. \u05D4\u05E4\u05E8\u05D3\u05D4 \u05DE\u05D5\u05D7\u05DC\u05D8\u05EA: \u05D0\u05E1\u05D5\u05E8 \u05E9\u05D9\u05D4\u05D9\u05D4 \u05E2\u05E8\u05D1\u05D5\u05D1 \u05E9\u05DC \u05D3\u05D1\u05E8\u05D9 \u05D4-AI \u05D1\u05EA\u05D5\u05DA \u05D4\u05E6\u05D9\u05D8\u05D5\u05D8. \u05D4\u05E6\u05D9\u05D8\u05D5\u05D8 \u05D1-Blockquote \u05D7\u05D9\u05D9\u05D1 \u05DC\u05D4\u05DB\u05D9\u05DC \u05D0\u05DA \u05D5\u05E8\u05E7 \u05D0\u05EA \u05DC\u05E9\u05D5\u05DF \u05D4\u05DE\u05E7\u05D5\u05E8 \u05DB\u05E4\u05D9 \u05E9\u05D4\u05D9\u05D0.
2. \u05D5\u05D5\u05D3\u05D0 \u05E9\u05E4\u05D5\u05E8\u05DE\u05D8 \u05DE\u05E8\u05D0\u05D9 \u05D4\u05DE\u05E7\u05D5\u05DE\u05D5\u05EA \u05E0\u05E9\u05DE\u05E8 \u05D5\u05DE\u05D5\u05DC\u05D0 \u05DB\u05E8\u05D0\u05D5\u05D9: [SefariaRef: URL_Slug|Exact_Quote|Hebrew_Name]. \u05E9\u05D3\u05D4 \u05D4-Exact_Quote \u05D7\u05D9\u05D9\u05D1 \u05DC\u05E6\u05D8\u05D8 \u05D0\u05EA \u05D4\u05DE\u05E7\u05D5\u05E8 \u05D1\u05DE\u05D3\u05D5\u05D9\u05E7 \u05DE\u05D9\u05DC\u05D4 \u05D1\u05DE\u05D9\u05DC\u05D4 (\u05D1\u05D3\u05D9\u05D5\u05E7 \u05DE\u05D5\u05E9\u05DC\u05DD!).
3. \u05E9\u05DE\u05D5\u05E8 \u05E2\u05DC \u05D4\u05E1\u05D2\u05E0\u05D5\u05DF \u05D4\u05DE\u05E7\u05D5\u05E8\u05D9 \u05E9\u05DC \u05E1\u05E4\u05E8\u05D0, \u05D0\u05DA \u05D0\u05DC \u05EA\u05EA\u05E4\u05E9\u05E8 \u05E2\u05DC \u05D3\u05D9\u05D5\u05E7 \u05D4\u05E6\u05D9\u05D8\u05D5\u05D8\u05D9\u05DD.
4. \u05D4\u05E6\u05D9\u05D8\u05D5\u05D8 \u05D7\u05D9\u05D9\u05D1 \u05DC\u05D4\u05D9\u05D5\u05EA \u05E0\u05D0\u05DE\u05DF \u05DC\u05D8\u05E7\u05E1\u05D8 \u05D4\u05DE\u05E7\u05D5\u05E8\u05D9 \u05E9\u05DC \u05D4\u05E1\u05E4\u05E8.

\u05D0\u05DD \u05DE\u05E6\u05D0\u05EA \u05D8\u05E2\u05D5\u05D9\u05D5\u05EA \u05D0\u05D5 \u05E6\u05D9\u05D8\u05D5\u05D8\u05D9\u05DD \u05DC\u05D0 \u05DE\u05D3\u05D5\u05D9\u05E7\u05D9\u05DD:
- \u05EA\u05E7\u05DF \u05D0\u05EA \u05D4\u05D8\u05E2\u05D5\u05D9\u05D5\u05EA \u05D1\u05D2\u05D5\u05E3 \u05D4\u05D8\u05E7\u05E1\u05D8. \u05D5\u05D5\u05D3\u05D0 \u05E9\u05D4\u05E6\u05D9\u05D8\u05D5\u05D8\u05D9\u05DD \u05DE\u05DC\u05D0\u05D9\u05DD \u05D5\u05DE\u05D3\u05D5\u05D9\u05E7\u05D9\u05DD \u05DE\u05D9\u05DC\u05D4 \u05D1\u05DE\u05D9\u05DC\u05D4 \u05D1\u05D5\u05DC.
- \u05D4\u05D7\u05D6\u05E8 \u05D0\u05EA \u05D4\u05EA\u05E9\u05D5\u05D1\u05D4 \u05D4\u05DE\u05EA\u05D5\u05E7\u05E0\u05EA \u05D5\u05D4\u05DE\u05D3\u05D5\u05D9\u05E7\u05EA \u05D1\u05DC\u05D1\u05D3.

\u05D0\u05DD \u05D4\u05EA\u05E9\u05D5\u05D1\u05D4 \u05D4\u05DE\u05E7\u05D5\u05E8\u05D9\u05EA \u05DE\u05D3\u05D5\u05D9\u05E7\u05EA \u05D1-100% \u05D5\u05D0\u05D9\u05DF \u05D1\u05D4 \u05E9\u05D5\u05DD \u05D8\u05E2\u05D5\u05EA \u05E2\u05D5\u05D1\u05D3\u05EA\u05D9\u05EA \u05D0\u05D5 \u05E6\u05D9\u05D8\u05D5\u05D8\u05D9:
- \u05D4\u05D7\u05D6\u05E8 \u05D0\u05EA \u05D4\u05EA\u05E9\u05D5\u05D1\u05D4 \u05D4\u05DE\u05E7\u05D5\u05E8\u05D9\u05EA \u05D1\u05D3\u05D9\u05D5\u05E7 \u05DB\u05E4\u05D9 \u05E9\u05D4\u05D9\u05D0 (BUBBLE_COPY_OK).

\u05D7\u05E9\u05D5\u05D1: \u05D0\u05DC \u05EA\u05D5\u05E1\u05D9\u05E3 \u05D4\u05E7\u05D3\u05DE\u05D5\u05EA \u05DB\u05DE\u05D5 "\u05EA\u05D9\u05E7\u05E0\u05EA\u05D9 \u05D0\u05EA..." \u05D0\u05D5 "\u05D4\u05E0\u05D4 \u05D4\u05EA\u05E9\u05D5\u05D1\u05D4...". \u05E4\u05E9\u05D5\u05D8 \u05E4\u05DC\u05D8 \u05D0\u05EA \u05D4\u05EA\u05D5\u05DB\u05DF \u05D4\u05E1\u05D5\u05E4\u05D9.`;
        const verifierParts = [
          { text: `\u05D4\u05E0\u05D4 \u05D4\u05EA\u05E9\u05D5\u05D1\u05D4 \u05E9\u05E2\u05DC\u05D9\u05DA \u05DC\u05D4\u05D2\u05D9\u05D4 \u05D5\u05DC\u05D0\u05DE\u05EA \u05E2\u05D1\u05D5\u05E8 \u05D4\u05E9\u05D0\u05DC\u05D4: "${message}"

\u05D4\u05EA\u05E9\u05D5\u05D1\u05D4:
${responseText}` }
        ];
        attachments.forEach((att) => {
          if (att.data) {
            verifierParts.push({
              inlineData: {
                data: att.data,
                mimeType: att.mimeType || "application/octet-stream"
              }
            });
          }
        });
        const verificationResponse = await Promise.race([
          ai.models.generateContent({
            model: "gemini-3.5-flash",
            contents: [
              { role: "user", parts: verifierParts }
            ],
            config: {
              systemInstruction: verifierSystemInstruction,
              temperature: 0.1
              // Removed googleSearch from proofreader to prevent timeout cascades.
              // The proofreader verifies format/structure only; grounding is done in the main stage.
            }
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error("Proofreader timeout")), 9e4))
        ]);
        if (verificationResponse && verificationResponse.text) {
          const verifiedText = verificationResponse.text.trim();
          if (verifiedText && !verifiedText.includes("BUBBLE_COPY_OK") && verifiedText !== responseText) {
            responseText = verifiedText;
          }
          const vUsage = verificationResponse.usageMetadata;
          if (vUsage && usageMetadata) {
            usageMetadata.promptTokenCount = (usageMetadata.promptTokenCount || 0) + (vUsage.promptTokenCount || 0);
            usageMetadata.candidatesTokenCount = (usageMetadata.candidatesTokenCount || 0) + (vUsage.candidatesTokenCount || 0);
            usageMetadata.totalTokenCount = (usageMetadata.totalTokenCount || 0) + (vUsage.totalTokenCount || 0);
          }
        }
      } catch (verErr) {
        console.error("Proofreader stage failed:", verErr);
      }
      const groundingMetadata = response.candidates?.[0]?.groundingMetadata || null;
      const finalCostUsd = (usageMetadata?.promptTokenCount || 0) * 0.075 / 1e6 + (usageMetadata?.candidatesTokenCount || 0) * 0.3 / 1e6;
      return res.json({
        text: responseText,
        groundingMetadata,
        usage: {
          promptTokens: usageMetadata?.promptTokenCount || 0,
          candidatesTokens: usageMetadata?.candidatesTokenCount || 0,
          totalTokens: usageMetadata?.totalTokenCount || 0,
          costUsd: finalCostUsd,
          costIls: finalCostUsd * usdToIls
        }
      });
    } catch (error) {
      console.error("Gemini API Error details:", error);
      const isApiKeyMissing = error.message?.includes("GEMINI_API_KEY");
      const statusCode = mapErrorToStatus(error);
      if (statusCode === 429) {
        return res.status(429).json({
          status: "quota_exceeded",
          error: "\u05D7\u05E8\u05D9\u05D2\u05D4 \u05DE\u05DE\u05DB\u05E1\u05EA \u05D4\u05E9\u05D9\u05DE\u05D5\u05E9 \u05D1-Gemini API (\u05E9\u05D2\u05D9\u05D0\u05D4 429).",
          message: "\u05D7\u05E8\u05D2\u05EA \u05DE\u05DE\u05DB\u05E1\u05EA \u05D4\u05E9\u05D9\u05DE\u05D5\u05E9 \u05D4\u05D6\u05DE\u05D9\u05E0\u05D4 \u05D1\u05E0\u05D5\u05DB\u05D7\u05D9\u05EA \u05E9\u05DC \u05DE\u05E4\u05EA\u05D7 \u05D4-API \u05E9\u05DC\u05DA \u05D1-Gemini. \u05D0\u05E0\u05D0 \u05D4\u05DE\u05EA\u05DF \u05DE\u05E2\u05D8 \u05D0\u05D5 \u05D4\u05E9\u05EA\u05DE\u05E9 \u05D1\u05DE\u05D5\u05D3\u05DC Flash.",
          details: error.message || error.toString()
        });
      }
      if (statusCode === 504) {
        return res.status(504).json({
          status: "timeout",
          error: "\u05D6\u05DE\u05DF \u05D4\u05D4\u05DE\u05EA\u05E0\u05D4 \u05DC\u05EA\u05E9\u05D5\u05D1\u05D4 \u05DE\u05D4-AI \u05D7\u05E8\u05D2 \u05DE\u05D4\u05DE\u05D5\u05EA\u05E8 (504 DEADLINE_EXCEEDED).",
          message: "\u05EA\u05D4\u05DC\u05D9\u05DA \u05D4\u05DE\u05D7\u05E7\u05E8 \u05D5\u05D4\u05D1\u05D9\u05E1\u05D5\u05E1 \u05DC\u05E7\u05D7 \u05D6\u05DE\u05DF \u05E8\u05D1 \u05DE\u05D3\u05D9. \u05D9\u05D9\u05EA\u05DB\u05DF \u05E9\u05D4\u05E9\u05D0\u05DC\u05D4 \u05DE\u05D5\u05E8\u05DB\u05D1\u05EA \u05DE\u05D0\u05D5\u05D3 \u05D0\u05D5 \u05E9\u05E9\u05E8\u05EA\u05D9 \u05D2\u05D5\u05D2\u05DC \u05E2\u05DE\u05D5\u05E1\u05D9\u05DD.",
          details: error.message || error.toString()
        });
      }
      return res.status(500).json({
        error: isApiKeyMissing ? "GEMINI_API_KEY is not configured. Please add it to your secrets panel." : error.message || "An unexpected error occurred while communicating with Gemini.",
        code: error.status || error.statusCode || "UNKNOWN",
        details: error.stack || error.toString()
      });
    }
  });
  const SUPABASE_URL = "https://cyfjuytxqpjnntnvbblw.supabase.co";
  const SUPABASE_KEY = "sb_publishable_foKh65QDiTCPHw-nSRQC8w_9jet7mhf";
  const supabase = (0, import_supabase_js.createClient)(SUPABASE_URL, SUPABASE_KEY);
  app.post("/api/supabase/upsert", async (req, res) => {
    try {
      const { payload } = req.body;
      if (!payload) return res.status(400).json({ error: "No payload provided" });
      console.log("[Server-Supabase] Upserting for user:", payload.username);
      const { data, error } = await supabase.from("user_data").upsert(payload, { onConflict: "username" }).select();
      if (error) {
        console.error("[Server-Supabase] Upsert error:", error);
        return res.status(500).json({ error: error.message, details: error.details });
      }
      res.json({ success: true, data });
    } catch (err) {
      console.error("[Server-Supabase] Upsert exception:", err);
      res.status(500).json({ error: err.message || err });
    }
  });
  app.get("/api/supabase/fetch", async (req, res) => {
    try {
      const { username } = req.query;
      if (!username || typeof username !== "string") {
        return res.status(400).json({ error: "Username is required" });
      }
      console.log("[Server-Supabase] Fetching user:", username);
      const { data, error } = await supabase.from("user_data").select("*").eq("username", username.trim().toLowerCase()).single();
      if (error && error.code !== "PGRST116") {
        console.error("[Server-Supabase] Fetch error:", error);
        return res.status(500).json({ error: error.message });
      }
      res.json({ data });
    } catch (err) {
      console.error("[Server-Supabase] Fetch exception:", err);
      res.status(500).json({ error: err.message || err });
    }
  });
  if (process.env.NODE_ENV !== "production") {
    const vite = await (0, import_vite.createServer)({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = import_path.default.join(process.cwd(), "dist");
    app.use(import_express.default.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(import_path.default.join(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Express server successfully initialized on http://localhost:${PORT}`);
  });
}
startServer();
//# sourceMappingURL=server.cjs.map
