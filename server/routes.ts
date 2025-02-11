import type { Express } from "express";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { log } from "./vite";
import geoip from 'geoip-lite';

interface WSMessage {
  type: string;
  payload: any;
}

function logConnection(sessionId: string, event: string, details?: string) {
  log(`[${sessionId}] ${event}${details ? `: ${details}` : ''}`, "websocket");
}

export function registerRoutes(app: Express, wss: WebSocketServer) {
  const clients = new Map<string, WebSocket>();
  const connections = new Map<string, string>();

  function broadcastOnlineCount() {
    const count = clients.size;
    const availableCount = Array.from(clients.values()).filter(client => 
      client.readyState === WebSocket.OPEN
    ).length;

    logConnection("system", `Online users: ${count}, Available: ${availableCount}`);

    Array.from(clients.values()).forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({ 
          type: "online_count", 
          payload: { count: availableCount } 
        }));
      }
    });
  }

  wss.on("connection", (ws, req) => {
    const sessionId = Math.random().toString(36).substring(7);
    clients.set(sessionId, ws);

    // Get user's IP and region
    const ip = req.socket.remoteAddress || req.headers['x-forwarded-for']?.toString();
    const geo = ip ? geoip.lookup(ip) : null;
    const region = geo?.country || 'unknown';

    logConnection(sessionId, "Connected", `from region: ${region}`);

    storage.addParticipant(sessionId, region);
    broadcastOnlineCount();

    ws.send(JSON.stringify({ 
      type: "session_id", 
      payload: { sessionId, region } 
    }));

    ws.on("message", async (data) => {
      try {
        const message: WSMessage = JSON.parse(data.toString());
        logConnection(sessionId, `Received message type: ${message.type}`);

        switch (message.type) {
          case "find_partner":
            await storage.setParticipantAvailability(sessionId, true);
            // First try to find partner from same region
            let partnerId = await storage.getAvailableParticipant(sessionId, region);

            // If no partner found in same region and user allows global matching
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
                from: 'me',
                timestamp: Date.now()
              });
              await storage.addChatHistory(chatTarget, sessionId, {
                text: message.payload.text,
                from: 'partner',
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

  function handleDisconnect(sessionId: string) {
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

  return app;
}