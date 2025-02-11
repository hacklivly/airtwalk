let ws: WebSocket | null = null;
let sessionId: string | null = null;
let isConnecting = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

export function connectWebSocket(): Promise<WebSocket> {
  if (isConnecting) {
    return new Promise((resolve) => {
      const checkConnection = setInterval(() => {
        if (ws?.readyState === WebSocket.OPEN) {
          clearInterval(checkConnection);
          resolve(ws);
        }
      }, 100);
    });
  }

  return new Promise((resolve, reject) => {
    try {
      isConnecting = true;
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws`;

      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log("WebSocket connected successfully");
        isConnecting = false;
        reconnectAttempts = 0;
        resolve(ws!);
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.type === "session_id") {
            sessionId = message.payload.sessionId;
            console.log("Received session ID:", sessionId);
          }
        } catch (error) {
          console.error("Error parsing WebSocket message:", error);
        }
      };

      ws.onerror = (error) => {
        console.error("WebSocket error:", error);
        isConnecting = false;
        reject(error);
      };

      ws.onclose = () => {
        console.log("WebSocket disconnected");
        isConnecting = false;
        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          reconnectAttempts++;
          console.log(`Attempting to reconnect (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
          setTimeout(() => connectWebSocket(), 1000 * reconnectAttempts);
        }
      };
    } catch (error) {
      isConnecting = false;
      reject(error);
    }
  });
}

export function getSessionId(): string | null {
  return sessionId;
}

export function sendMessage(type: string, payload: any) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    console.warn("WebSocket is not connected. Attempting to reconnect...");
    connectWebSocket().then(() => {
      ws?.send(JSON.stringify({ type, payload }));
    });
    return;
  }
  ws.send(JSON.stringify({ type, payload }));
}

export function addMessageListener(callback: (message: any) => void) {
  if (!ws) return;

  const messageHandler = (event: MessageEvent) => {
    try {
      const message = JSON.parse(event.data);
      callback(message);
    } catch (error) {
      console.error("Error parsing message in listener:", error);
    }
  };

  ws.addEventListener("message", messageHandler);
  return () => ws?.removeEventListener("message", messageHandler);
}