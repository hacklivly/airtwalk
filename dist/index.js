// server/index.ts
import express2 from "express";
import { WebSocketServer as WebSocketServer2 } from "ws";
import { createServer } from "http";

// server/routes.ts
import { WebSocket } from "ws";

// server/storage.ts
var MemStorage = class {
  participants;
  chatHistory;
  regions;
  constructor() {
    this.participants = /* @__PURE__ */ new Map();
    this.chatHistory = /* @__PURE__ */ new Map();
    this.regions = /* @__PURE__ */ new Map();
  }
  async addParticipant(sessionId, region) {
    this.participants.set(sessionId, {
      sessionId,
      isMuted: false,
      isAvailable: true,
      autoFind: false,
      region
    });
    if (region) {
      this.regions.set(sessionId, region);
    }
  }
  async removeParticipant(sessionId) {
    this.participants.delete(sessionId);
    this.regions.delete(sessionId);
  }
  async getAvailableParticipant(excludeSessionId, region) {
    const availableParticipants = Array.from(this.participants.values()).filter((p) => {
      if (!p.isAvailable || p.sessionId === excludeSessionId) return false;
      if (region) {
        const participantRegion = this.regions.get(p.sessionId);
        return participantRegion === region;
      }
      return true;
    });
    if (availableParticipants.length === 0) return void 0;
    const randomIndex = Math.floor(Math.random() * availableParticipants.length);
    return availableParticipants[randomIndex].sessionId;
  }
  async setParticipantAvailability(sessionId, isAvailable) {
    const participant = this.participants.get(sessionId);
    if (participant) {
      participant.isAvailable = isAvailable;
      this.participants.set(sessionId, participant);
    }
  }
  async getParticipantAvailability(sessionId) {
    return this.participants.get(sessionId)?.isAvailable ?? false;
  }
  async setAutoFind(sessionId, autoFind) {
    const participant = this.participants.get(sessionId);
    if (participant) {
      participant.autoFind = autoFind;
      this.participants.set(sessionId, participant);
    }
  }
  async getAutoFindStatus(sessionId) {
    return this.participants.get(sessionId)?.autoFind || false;
  }
  async setParticipantRegion(sessionId, region) {
    this.regions.set(sessionId, region);
    const participant = this.participants.get(sessionId);
    if (participant) {
      participant.region = region;
      this.participants.set(sessionId, participant);
    }
  }
  async getParticipantRegion(sessionId) {
    return this.regions.get(sessionId);
  }
  async addChatHistory(sessionId, partnerId, message) {
    let history = this.chatHistory.get(sessionId) || [];
    let existingChat = history.find((h) => h.partnerId === partnerId);
    if (!existingChat) {
      existingChat = {
        sessionId,
        partnerId,
        lastInteractionTime: Date.now(),
        messages: []
      };
      history.push(existingChat);
    }
    if (message) {
      existingChat.messages.push(message);
    }
    existingChat.lastInteractionTime = Date.now();
    this.chatHistory.set(sessionId, history);
  }
  async getChatHistory(sessionId) {
    return this.chatHistory.get(sessionId) || [];
  }
};
var storage = new MemStorage();

// server/vite.ts
import express from "express";
import fs from "fs";
import path2, { dirname as dirname2 } from "path";
import { fileURLToPath as fileURLToPath2 } from "url";
import { createServer as createViteServer, createLogger } from "vite";

// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import themePlugin from "@replit/vite-plugin-shadcn-theme-json";
import path, { dirname } from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import { fileURLToPath } from "url";
var __filename = fileURLToPath(import.meta.url);
var __dirname = dirname(__filename);
var vite_config_default = defineConfig({
  plugins: [react(), runtimeErrorOverlay(), themePlugin()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "client", "src"),
      "@shared": path.resolve(__dirname, "shared")
    }
  },
  root: path.resolve(__dirname, "client"),
  build: {
    outDir: path.resolve(__dirname, "dist/public"),
    emptyOutDir: true
  }
});

// server/vite.ts
import { nanoid } from "nanoid";
var __filename2 = fileURLToPath2(import.meta.url);
var __dirname2 = dirname2(__filename2);
var viteLogger = createLogger();
function log(message, source = "express") {
  const formattedTime = (/* @__PURE__ */ new Date()).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}
async function setupVite(app2, server2) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server: server2 },
    allowedHosts: true
  };
  const vite = await createViteServer({
    ...vite_config_default,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      }
    },
    server: serverOptions,
    appType: "custom"
  });
  app2.use(vite.middlewares);
  app2.use("*", async (req, res, next) => {
    const url = req.originalUrl;
    try {
      const clientTemplate = path2.resolve(
        __dirname2,
        "..",
        "client",
        "index.html"
      );
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e);
      next(e);
    }
  });
}
function serveStatic(app2) {
  const distPath = path2.resolve(__dirname2, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }
  app2.use(express.static(distPath));
  app2.use("*", (_req, res) => {
    res.sendFile(path2.resolve(distPath, "index.html"));
  });
}

// server/routes.ts
import geoip from "geoip-lite";
function logConnection(sessionId, event, details) {
  log(`[${sessionId}] ${event}${details ? `: ${details}` : ""}`, "websocket");
}
function registerRoutes(app2, wss2) {
  const clients = /* @__PURE__ */ new Map();
  const connections = /* @__PURE__ */ new Map();
  function broadcastOnlineCount() {
    const count = clients.size;
    const availableCount = Array.from(clients.values()).filter(
      (client) => client.readyState === WebSocket.OPEN
    ).length;
    logConnection("system", `Online users: ${count}, Available: ${availableCount}`);
    Array.from(clients.values()).forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({
          type: "online_count",
          payload: { count: availableCount }
        }));
      }
    });
  }
  wss2.on("connection", (ws, req) => {
    const sessionId = Math.random().toString(36).substring(7);
    clients.set(sessionId, ws);
    const ip = req.socket.remoteAddress || req.headers["x-forwarded-for"]?.toString();
    const geo = ip ? geoip.lookup(ip) : null;
    const region = geo?.country || "unknown";
    logConnection(sessionId, "Connected", `from region: ${region}`);
    storage.addParticipant(sessionId, region);
    broadcastOnlineCount();
    ws.send(JSON.stringify({
      type: "session_id",
      payload: { sessionId, region }
    }));
    ws.on("message", async (data) => {
      try {
        const message = JSON.parse(data.toString());
        logConnection(sessionId, `Received message type: ${message.type}`);
        switch (message.type) {
          case "find_partner":
            await storage.setParticipantAvailability(sessionId, true);
            let partnerId = await storage.getAvailableParticipant(sessionId, region);
            if (!partnerId && message.payload.allowGlobal) {
              partnerId = await storage.getAvailableParticipant(sessionId);
            }
            if (partnerId) {
              logConnection(sessionId, "Finding partner", `Attempting to match with ${partnerId}`);
              await storage.setParticipantAvailability(sessionId, false);
              await storage.setParticipantAvailability(partnerId, false);
              connections.set(sessionId, partnerId);
              connections.set(partnerId, sessionId);
              await storage.addChatHistory(sessionId, partnerId);
              await storage.addChatHistory(partnerId, sessionId);
              const partnerWs = clients.get(partnerId);
              const partnerRegion = await storage.getParticipantRegion(partnerId);
              if (partnerWs?.readyState === WebSocket.OPEN) {
                partnerWs.send(JSON.stringify({
                  type: "connected",
                  payload: {
                    partnerId: sessionId,
                    partnerRegion: region
                  }
                }));
                ws.send(JSON.stringify({
                  type: "connected",
                  payload: {
                    partnerId,
                    partnerRegion
                  }
                }));
                logConnection(sessionId, "Partner matched", `Connected with ${partnerId} from ${partnerRegion}`);
              } else {
                logConnection(sessionId, "Partner unavailable", `Failed to connect with ${partnerId}`);
                await storage.setParticipantAvailability(partnerId, false);
                ws.send(JSON.stringify({
                  type: "waiting",
                  payload: { message: "Partner unavailable, finding another..." }
                }));
              }
            } else {
              logConnection(sessionId, "No partner found", "Waiting for someone to connect");
              ws.send(JSON.stringify({
                type: "waiting",
                payload: { message: "Waiting for partner..." }
              }));
            }
            break;
          case "voice_data":
            const voiceTarget = connections.get(sessionId);
            if (voiceTarget) {
              const targetWs = clients.get(voiceTarget);
              if (targetWs?.readyState === WebSocket.OPEN) {
                targetWs.send(JSON.stringify({
                  type: "voice_data",
                  payload: {
                    data: message.payload.data,
                    from: sessionId
                  }
                }));
              }
            }
            break;
          case "chat_message":
            const chatTarget = connections.get(sessionId);
            if (chatTarget) {
              const targetWs = clients.get(chatTarget);
              if (targetWs?.readyState === WebSocket.OPEN) {
                targetWs.send(JSON.stringify(message));
              }
              await storage.addChatHistory(sessionId, chatTarget, {
                text: message.payload.text,
                from: "me",
                timestamp: Date.now()
              });
              await storage.addChatHistory(chatTarget, sessionId, {
                text: message.payload.text,
                from: "partner",
                timestamp: Date.now()
              });
            }
            break;
          case "typing_status":
          case "voice_activity":
            const target = connections.get(sessionId);
            if (target) {
              const targetWs = clients.get(target);
              if (targetWs?.readyState === WebSocket.OPEN) {
                targetWs.send(JSON.stringify(message));
              }
            }
            break;
          case "set_auto_find":
            await storage.setAutoFind(sessionId, message.payload.autoFind);
            break;
          case "get_chat_history":
            const history = await storage.getChatHistory(sessionId);
            ws.send(JSON.stringify({
              type: "chat_history",
              payload: { history }
            }));
            break;
          case "disconnect_call":
            const currentPartner = connections.get(sessionId);
            if (currentPartner) {
              const autoFindEnabled = await storage.getAutoFindStatus(sessionId);
              await storage.setParticipantAvailability(sessionId, autoFindEnabled);
              const partnerAutoFind = await storage.getAutoFindStatus(currentPartner);
              await storage.setParticipantAvailability(currentPartner, partnerAutoFind);
              connections.delete(sessionId);
              connections.delete(currentPartner);
              const partnerSocket = clients.get(currentPartner);
              if (partnerSocket?.readyState === WebSocket.OPEN) {
                partnerSocket.send(JSON.stringify({ type: "partner_disconnected" }));
              }
            }
            break;
        }
      } catch (error) {
        logConnection(sessionId, "Error", error instanceof Error ? error.message : String(error));
        ws.send(JSON.stringify({
          type: "error",
          payload: { message: "Failed to process message" }
        }));
      }
    });
    ws.on("error", (error) => {
      logConnection(sessionId, "Error", error.message);
      handleDisconnect(sessionId);
    });
    ws.on("close", () => {
      logConnection(sessionId, "Disconnected");
      handleDisconnect(sessionId);
    });
  });
  function handleDisconnect(sessionId) {
    const partnerId = connections.get(sessionId);
    if (partnerId) {
      const partnerWs = clients.get(partnerId);
      if (partnerWs?.readyState === WebSocket.OPEN) {
        partnerWs.send(JSON.stringify({ type: "partner_disconnected" }));
      }
      connections.delete(partnerId);
      connections.delete(sessionId);
    }
    storage.removeParticipant(sessionId);
    clients.delete(sessionId);
    broadcastOnlineCount();
  }
  return app2;
}

// server/index.ts
var app = express2();
var server = createServer(app);
var wss = new WebSocketServer2({
  server,
  path: "/ws"
});
var router = registerRoutes(app, wss);
app.use(express2.json());
app.use(express2.urlencoded({ extended: false }));
if (process.env.NODE_ENV === "production") {
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-XSS-Protection", "1; mode=block");
    next();
  });
}
app.use((req, res, next) => {
  const start = Date.now();
  const path3 = req.path;
  let capturedJsonResponse = void 0;
  const originalResJson = res.json;
  res.json = function(bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };
  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path3.startsWith("/api")) {
      let logLine = `${req.method} ${path3} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "\u2026";
      }
      log(logLine);
    }
  });
  next();
});
app.use((err, _req, res, _next) => {
  const status = err.status || err.statusCode || 500;
  const message = err.message || "Internal Server Error";
  res.status(status).json({ message });
  console.error(err);
});
(async () => {
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }
  const PORT = process.env.PORT || 5e3;
  server.listen(PORT, "0.0.0.0", () => {
    log(`Server running on port ${PORT}`);
    log(`WebSocket server initialized on path /ws`);
  });
})();
