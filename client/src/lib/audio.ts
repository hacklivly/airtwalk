export class AudioManager {
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private audioContext: AudioContext | null = null;
  private audioSources: Map<string, AudioBufferSourceNode> = new Map();
  private analyzer: AnalyserNode | null = null;
  private isRecording = false;
  private animationFrame: number | null = null;

  async startRecording(): Promise<void> {
    if (this.isRecording) {
      console.log("Already recording");
      return;
    }

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Media devices not supported");
      }

      this.stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000,
          latency: 0
        } 
      });

      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

      // Set up audio analysis
      const source = this.audioContext.createMediaStreamSource(this.stream);
      this.analyzer = this.audioContext.createAnalyser();
      this.analyzer.fftSize = 2048;
      this.analyzer.minDecibels = -85;
      this.analyzer.maxDecibels = -10;
      this.analyzer.smoothingTimeConstant = 0.85;

      source.connect(this.analyzer);

      // Start monitoring voice activity
      this.startVoiceActivityDetection();

      this.recorder = new MediaRecorder(this.stream, {
        mimeType: 'audio/webm;codecs=opus'
      });

      this.recorder.ondataavailable = async (event) => {
        if (event.data.size > 0) {
          try {
            const reader = new FileReader();
            reader.onloadend = () => {
              if (typeof reader.result === "string" && this.isRecording) {
                this.onAudioData?.(reader.result);
              }
            };
            reader.readAsDataURL(event.data);
          } catch (error) {
            console.error("Error processing audio data:", error);
          }
        }
      };

      this.recorder.start(100);
      this.isRecording = true;
      console.log("Recording started successfully");
    } catch (error) {
      console.error("Failed to start recording:", error);
      this.stopRecording();
      throw error;
    }
  }

  private startVoiceActivityDetection() {
    if (!this.analyzer) return;

    const dataArray = new Uint8Array(this.analyzer.frequencyBinCount);
    let speaking = false;

    const checkVoiceActivity = () => {
      if (!this.analyzer) return;

      this.analyzer.getByteFrequencyData(dataArray);

      // Calculate average volume
      const average = dataArray.reduce((a, b) => a + b) / dataArray.length;

      // Threshold for voice activity
      const threshold = 20;
      const isSpeaking = average > threshold;

      if (speaking !== isSpeaking) {
        speaking = isSpeaking;
        this.onVoiceActivityChange?.(speaking);
      }

      this.animationFrame = requestAnimationFrame(checkVoiceActivity);
    };

    checkVoiceActivity();
  }

  stopRecording() {
    try {
      if (this.animationFrame) {
        cancelAnimationFrame(this.animationFrame);
        this.animationFrame = null;
      }

      if (this.recorder?.state === "recording") {
        this.recorder.stop();
      }
      this.stream?.getTracks().forEach(track => track.stop());
      this.audioSources.forEach(source => source.stop());
      this.audioSources.clear();

      this.analyzer = null;
      this.recorder = null;
      this.stream = null;
      this.isRecording = false;
      console.log("Recording stopped");
    } catch (error) {
      console.error("Error stopping recording:", error);
    }
  }

  async playAudio(audioData: string, participantId: string) {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }

    try {
      const response = await fetch(audioData);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;

      const gainNode = this.audioContext.createGain();
      gainNode.gain.value = 1.0;

      source.connect(gainNode);
      gainNode.connect(this.audioContext.destination);

      this.audioSources.get(participantId)?.stop();
      this.audioSources.set(participantId, source);

      source.start();
      source.onended = () => {
        this.audioSources.delete(participantId);
      };
    } catch (error) {
      console.error("Failed to play audio:", error);
    }
  }

  onAudioData?: (data: string) => void;
  onVoiceActivityChange?: (isSpeaking: boolean) => void;
}