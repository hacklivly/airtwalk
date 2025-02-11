import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Mic,
  MicOff,
  Loader2,
  Users,
  Send,
  History,
  Clock,
  X
} from "lucide-react";
import { connectWebSocket, sendMessage, addMessageListener } from "@/lib/websocket";
import { AudioManager } from "@/lib/audio";
import { motion, AnimatePresence } from "framer-motion";
import { SearchingAnimation, ConnectionIndicator } from "@/components/ui/loading-animation";

interface Message {
  text: string;
  from: 'me' | 'partner';
  timestamp: number;
}

interface ChatHistory {
  partnerId: string;
  lastInteractionTime: number;
  messages: Message[];
}

export default function Home() {
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPartnerSpeaking, setIsPartnerSpeaking] = useState(false);
  const [isPartnerTyping, setIsPartnerTyping] = useState(false);
  const [onlineCount, setOnlineCount] = useState(0);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageInput, setMessageInput] = useState("");
  const [autoFind, setAutoFind] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatHistory[]>([]);
  const [audioManager] = useState(() => new AudioManager());
  const [sessionId, setSessionId] = useState<string>("");
  const [region, setRegion] = useState<string>("");
  const [allowGlobal, setAllowGlobal] = useState(false);
  const [partnerRegion, setPartnerRegion] = useState<string>();
  const typingTimeoutRef = useRef<NodeJS.Timeout>();
  const messageEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    let cleanup = () => {};

    const setup = async () => {
      try {
        const ws = await connectWebSocket();

        const removeListener = addMessageListener((message) => {
          switch (message.type) {
            case "session_id":
              setSessionId(message.payload.sessionId);
              setRegion(message.payload.region);
              break;
            case "connected":
              setIsConnecting(false);
              setIsConnected(true);
              setPartnerRegion(message.payload.partnerRegion);
              break;
            case "partner_disconnected":
              setIsConnected(false);
              setIsMuted(true);
              setIsPartnerTyping(false);
              setIsPartnerSpeaking(false);
              audioManager.stopRecording();
              if (autoFind) {
                setTimeout(() => findPartner(), 1000);
              }
              break;
            case "voice_data":
              if (!isMuted) {
                audioManager.playAudio(message.payload.data, message.payload.from);
              }
              break;
            case "online_count":
              setOnlineCount(message.payload.count);
              break;
            case "chat_message":
              setMessages(prev => [...prev, {
                text: message.payload.text,
                from: 'partner',
                timestamp: Date.now()
              }]);
              break;
            case "typing_status":
              setIsPartnerTyping(message.payload.isTyping);
              break;
            case "voice_activity":
              setIsPartnerSpeaking(message.payload.isSpeaking);
              break;
            case "chat_history":
              setChatHistory(message.payload.history);
              break;
          }
        });

        // Request chat history
        sendMessage("get_chat_history", {});

        audioManager.onAudioData = (data) => {
          if (!isMuted && isConnected) {
            sendMessage("voice_data", { data });
          }
        };

        audioManager.onVoiceActivityChange = (speaking) => {
          setIsSpeaking(speaking);
          if (isConnected) {
            sendMessage("voice_activity", { isSpeaking: speaking });
          }
        };

        cleanup = () => {
          removeListener?.();
          ws.close();
          audioManager.stopRecording();
        };
      } catch (error) {
        console.error("Failed to setup:", error);
        setIsConnecting(false);
      }
    };

    setup();
    return () => cleanup();
  }, [audioManager, isMuted, isConnected, autoFind]);

  const findPartner = () => {
    setIsConnecting(true);
    setMessages([]);
    setPartnerRegion(undefined);
    sendMessage("find_partner", { allowGlobal });
  };

  const disconnect = () => {
    sendMessage("disconnect_call", {});
    setIsConnected(false);
    setIsMuted(true);
    setMessages([]);
    audioManager.stopRecording();
  };

  const toggleMute = async () => {
    try {
      if (isMuted) {
        await audioManager.startRecording();
      } else {
        audioManager.stopRecording();
      }
      setIsMuted(!isMuted);
    } catch (error) {
      console.error("Failed to toggle mute:", error);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMessageInput(e.target.value);

    if (isConnected) {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }

      sendMessage("typing_status", { isTyping: true });

      typingTimeoutRef.current = setTimeout(() => {
        sendMessage("typing_status", { isTyping: false });
      }, 1000);
    }
  };

  const sendChatMessage = () => {
    if (!messageInput.trim() || !isConnected) return;

    sendMessage("chat_message", { text: messageInput });
    setMessages(prev => [...prev, {
      text: messageInput,
      from: 'me',
      timestamp: Date.now()
    }]);
    setMessageInput("");

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      sendMessage("typing_status", { isTyping: false });
    }
  };

  const toggleAutoFind = () => {
    const newAutoFind = !autoFind;
    setAutoFind(newAutoFind);
    sendMessage("set_auto_find", { autoFind: newAutoFind });
  };

  const connectToHistoryPartner = (partnerId: string) => {
    sendMessage("connect_to_partner", { partnerId });
    setShowHistory(false);
  };

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold text-primary">AirWalk</h1>
          <div className="flex flex-col items-center gap-2">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Users className="h-4 w-4" />
                <span>{onlineCount} online</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="gap-2"
                onClick={() => setShowHistory(!showHistory)}
              >
                <History className="h-4 w-4" />
                History
              </Button>
            </div>
            <div className="text-sm text-muted-foreground flex flex-col items-center gap-1">
              <div>Your Session ID: {sessionId}</div>
              <div>Your Region: {region}</div>
              {partnerRegion && (
                <div>Partner's Region: {partnerRegion}</div>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {showHistory && (
            <Card className="md:col-span-1">
              <CardHeader>
                <CardTitle className="flex justify-between items-center">
                  <span>Chat History</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowHistory(false)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[400px]">
                  {chatHistory.length === 0 ? (
                    <p className="text-center text-muted-foreground">No history yet</p>
                  ) : (
                    chatHistory.map((chat, index) => (
                      <div
                        key={chat.partnerId}
                        className="mb-4 last:mb-0"
                      >
                        {index > 0 && <Separator className="my-2" />}
                        <div className="flex justify-between items-center mb-2">
                          <div className="text-sm text-muted-foreground flex items-center gap-2">
                            <Clock className="h-3 w-3" />
                            {new Date(chat.lastInteractionTime).toLocaleDateString()}
                          </div>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => connectToHistoryPartner(chat.partnerId)}
                            disabled={isConnected}
                          >
                            Connect
                          </Button>
                        </div>
                        {chat.messages.length > 0 && (
                          <p className="text-sm truncate text-muted-foreground">
                            Last message: {chat.messages[chat.messages.length - 1].text}
                          </p>
                        )}
                      </div>
                    ))
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          )}

          <Card className={showHistory ? "md:col-span-2" : "md:col-span-3"}>
            <CardHeader>
              <CardTitle className="flex justify-between items-center">
                <span>Voice Chat</span>
                <div className="flex items-center gap-2">
                  {isConnected && (
                    <motion.div 
                      className="flex items-center gap-2"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                    >
                      <ConnectionIndicator isConnected={isSpeaking} />
                      <span className="text-sm text-green-500">Connected</span>
                      <ConnectionIndicator isConnected={isPartnerSpeaking} />
                    </motion.div>
                  )}
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center space-x-2">
                <Switch
                  checked={autoFind}
                  onCheckedChange={toggleAutoFind}
                  disabled={isConnected || isConnecting}
                />
                <span className="text-sm text-muted-foreground">
                  Auto-find new partners
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  checked={allowGlobal}
                  onCheckedChange={setAllowGlobal}
                  disabled={isConnected || isConnecting}
                />
                <span className="text-sm text-muted-foreground">
                  Allow matching with users from other regions
                </span>
              </div>
              {isConnected && (
                <ScrollArea className="h-[300px] border rounded-md p-4">
                  {messages.map((msg, index) => (
                    <div
                      key={index}
                      className={`mb-2 ${
                        msg.from === 'me' ? 'text-right' : 'text-left'
                      }`}
                    >
                      <span
                        className={`inline-block rounded-lg px-3 py-1 text-sm ${
                          msg.from === 'me'
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted'
                        }`}
                      >
                        {msg.text}
                      </span>
                    </div>
                  ))}
                  {isPartnerTyping && (
                    <div className="text-left">
                      <span className="inline-block rounded-lg px-3 py-1 text-sm bg-muted text-muted-foreground">
                        typing...
                      </span>
                    </div>
                  )}
                  <div ref={messageEndRef} />
                </ScrollArea>
              )}

              <div className="flex justify-center">
                <Button
                  variant={isMuted ? "outline" : "default"}
                  size="lg"
                  onClick={toggleMute}
                  disabled={!isConnected}
                  className="h-16 w-16 rounded-full"
                >
                  {isMuted ? (
                    <MicOff className="h-6 w-6" />
                  ) : (
                    <Mic className="h-6 w-6" />
                  )}
                </Button>
              </div>

              {isConnected && (
                <div className="flex gap-2">
                  <Input
                    placeholder="Type a message..."
                    value={messageInput}
                    onChange={handleInputChange}
                    onKeyPress={(e) => e.key === 'Enter' && sendChatMessage()}
                  />
                  <Button onClick={sendChatMessage}>
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              )}

              <AnimatePresence mode="wait">
                {!isConnected && (
                  <Button
                    className="w-full"
                    onClick={findPartner}
                    disabled={isConnecting}
                  >
                    <AnimatePresence mode="wait">
                      {isConnecting ? (
                        <motion.div
                          key="connecting"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="flex items-center gap-2"
                        >
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Finding Partner...
                        </motion.div>
                      ) : (
                        <motion.div
                          key="start"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                        >
                          Start Random Chat
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </Button>
                )}
              </AnimatePresence>

              {isConnected && (
                <Button
                  variant="destructive"
                  className="w-full"
                  onClick={disconnect}
                >
                  End Call
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}