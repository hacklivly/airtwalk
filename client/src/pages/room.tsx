import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Mic, MicOff, Users } from "lucide-react";
import { connectWebSocket, sendMessage, addMessageListener } from "@/lib/websocket";
import { AudioManager } from "@/lib/audio";

export default function Room({ params }: { params: { id: string } }) {
  const [, navigate] = useLocation();
  const [isMuted, setIsMuted] = useState(true);
  const [participantCount, setParticipantCount] = useState(0);
  const [audioManager] = useState(() => new AudioManager());

  const { data: room } = useQuery({
    queryKey: ["/api/rooms", params.id],
  });

  useEffect(() => {
    let cleanup = () => {};

    const setup = async () => {
      try {
        const ws = await connectWebSocket();

        sendMessage("join_room", { roomId: Number(params.id) });

        addMessageListener((message) => {
          switch (message.type) {
            case "participants_update":
              setParticipantCount(message.payload.participants.length);
              break;
            case "voice_data":
              if (!isMuted) {
                audioManager.playAudio(message.payload.data, message.payload.from);
              }
              break;
          }
        });

        audioManager.onAudioData = (data) => {
          if (!isMuted) {
            sendMessage("voice_data", {
              roomId: Number(params.id),
              data
            });
          }
        };

        cleanup = () => {
          sendMessage("leave_room", { roomId: Number(params.id) });
          ws.close();
          audioManager.stopRecording();
        };
      } catch (error) {
        console.error("Failed to setup room:", error);
        navigate("/");
      }
    };

    setup();
    return () => cleanup();
  }, [params.id, navigate, audioManager, isMuted]);

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

  if (!room) return null;

  return (
    <div className="min-h-screen bg-background p-8">
      <Card className="max-w-2xl mx-auto">
        <CardContent className="p-6 space-y-6">
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold">{room.name}</h1>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Users className="w-4 h-4" />
              <span>{participantCount}</span>
            </div>
          </div>

          <div className="flex justify-center gap-4">
            <Button
              variant={isMuted ? "outline" : "default"}
              size="lg"
              onClick={toggleMute}
              className="h-16 w-16 rounded-full"
            >
              {isMuted ? (
                <MicOff className="h-6 w-6" />
              ) : (
                <Mic className="h-6 w-6" />
              )}
            </Button>
          </div>

          <Button 
            variant="ghost" 
            className="w-full"
            onClick={() => navigate("/")}
          >
            Leave Room
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
