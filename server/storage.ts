import { type Participant, type ChatHistory } from "@shared/schema";

export interface IStorage {
  addParticipant(sessionId: string, region?: string): Promise<void>;
  removeParticipant(sessionId: string): Promise<void>;
  getAvailableParticipant(excludeSessionId: string, region?: string): Promise<string | undefined>;
  setParticipantAvailability(sessionId: string, isAvailable: boolean): Promise<void>;
  getParticipantAvailability(sessionId: string): Promise<boolean>;
  setAutoFind(sessionId: string, autoFind: boolean): Promise<void>;
  getAutoFindStatus(sessionId: string): Promise<boolean>;
  setParticipantRegion(sessionId: string, region: string): Promise<void>;
  getParticipantRegion(sessionId: string): Promise<string | undefined>;
  addChatHistory(sessionId: string, partnerId: string, message?: { text: string, from: 'me' | 'partner', timestamp: number }): Promise<void>;
  getChatHistory(sessionId: string): Promise<ChatHistory[]>;
}

export class MemStorage implements IStorage {
  private participants: Map<string, Participant>;
  private chatHistory: Map<string, ChatHistory[]>;
  private regions: Map<string, string>;

  constructor() {
    this.participants = new Map();
    this.chatHistory = new Map();
    this.regions = new Map();
  }

  async addParticipant(sessionId: string, region?: string): Promise<void> {
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

  async removeParticipant(sessionId: string): Promise<void> {
    this.participants.delete(sessionId);
    this.regions.delete(sessionId);
  }

  async getAvailableParticipant(excludeSessionId: string, region?: string): Promise<string | undefined> {
    const availableParticipants = Array.from(this.participants.values())
      .filter(p => {
        if (!p.isAvailable || p.sessionId === excludeSessionId) return false;
        if (region) {
          const participantRegion = this.regions.get(p.sessionId);
          return participantRegion === region;
        }
        return true;
      });

    if (availableParticipants.length === 0) return undefined;

    const randomIndex = Math.floor(Math.random() * availableParticipants.length);
    return availableParticipants[randomIndex].sessionId;
  }

  async setParticipantAvailability(sessionId: string, isAvailable: boolean): Promise<void> {
    const participant = this.participants.get(sessionId);
    if (participant) {
      participant.isAvailable = isAvailable;
      this.participants.set(sessionId, participant);
    }
  }

  async getParticipantAvailability(sessionId: string): Promise<boolean> {
    return this.participants.get(sessionId)?.isAvailable ?? false;
  }

  async setAutoFind(sessionId: string, autoFind: boolean): Promise<void> {
    const participant = this.participants.get(sessionId);
    if (participant) {
      participant.autoFind = autoFind;
      this.participants.set(sessionId, participant);
    }
  }

  async getAutoFindStatus(sessionId: string): Promise<boolean> {
    return this.participants.get(sessionId)?.autoFind || false;
  }

  async setParticipantRegion(sessionId: string, region: string): Promise<void> {
    this.regions.set(sessionId, region);
    const participant = this.participants.get(sessionId);
    if (participant) {
      participant.region = region;
      this.participants.set(sessionId, participant);
    }
  }

  async getParticipantRegion(sessionId: string): Promise<string | undefined> {
    return this.regions.get(sessionId);
  }

  async addChatHistory(sessionId: string, partnerId: string, message?: { text: string, from: 'me' | 'partner', timestamp: number }): Promise<void> {
    let history = this.chatHistory.get(sessionId) || [];
    let existingChat = history.find(h => h.partnerId === partnerId);

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

  async getChatHistory(sessionId: string): Promise<ChatHistory[]> {
    return this.chatHistory.get(sessionId) || [];
  }
}

export const storage = new MemStorage();