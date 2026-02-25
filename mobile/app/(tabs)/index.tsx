import React, { useState, useEffect, useRef, memo } from "react";
import {
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  View,
  SafeAreaView,
  Alert,
  Image,
  Animated,
  StatusBar,
  Easing,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { Audio } from "expo-av";
import ImageCropper from "@/components/ImageCropper";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import ShaderOrb from "@/components/ShaderOrb";

import { useRoute } from "@react-navigation/native";

// Centralized services
import { API_BASE_URL, transcribeAudio } from "@/services/apiClient";

// --- Typewriter Component ---
const TypewriterText = memo(({ text, style }: { text: string; style: any }) => {
  const [displayedText, setDisplayedText] = useState("");
  const index = useRef(0);

  const safeText = text || "";

  useEffect(() => {
    setDisplayedText("");
    index.current = 0;

    const speed = 10;
    const timer = setInterval(() => {
      // 2. Use safeText here
      if (index.current < safeText.length) {
        const chunk = safeText.slice(index.current, index.current + 3);
        setDisplayedText((prev) => prev + chunk);
        index.current += 3;
      } else {
        clearInterval(timer);
      }
    }, speed);
    return () => clearInterval(timer);
  }, [safeText]); // 3. Depend on safeText

  return <ThemedText style={style}>{displayedText}</ThemedText>;
});
TypewriterText.displayName = "TypewriterText";

// --- Delayed Guide Card — appears after TypewriterText finishes ---
// Matches the typewriter speed: 3 chars per 10ms → delay = (text.length / 3) * 10 ms
const DelayedGuideCard = memo(
  ({ text, styles }: { text: string; styles: any }) => {
    const [visible, setVisible] = useState(false);
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const translateY = useRef(new Animated.Value(10)).current;

    useEffect(() => {
      // Calculate how long typewriter takes, add 200ms buffer
      const typewriterMs = Math.ceil((text.length / 3) * 10) + 200;
      const timer = setTimeout(() => {
        setVisible(true);
        Animated.parallel([
          Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 350,
            useNativeDriver: true,
          }),
          Animated.timing(translateY, {
            toValue: 0,
            duration: 350,
            useNativeDriver: true,
          }),
        ]).start();
      }, typewriterMs);
      return () => clearTimeout(timer);
    }, [text]);

    if (!visible) return null;

    return (
      <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY }] }}>
        <View style={styles.guideCard}>
          <View style={styles.guideHeader}>
            <Ionicons name="camera" size={20} color="#fff" />
            <ThemedText style={styles.guideHeaderText}>
              Photo Capture Guide
            </ThemedText>
          </View>
          <Image
            source={require("../../assets/images/throat_guide.jpg")}
            style={styles.guideImage}
            resizeMode="contain"
          />
        </View>
      </Animated.View>
    );
  },
);
DelayedGuideCard.displayName = "DelayedGuideCard";

// --- Typing Indicator (3 Bouncing Dots) ---
const TypingIndicator = memo(() => {
  const dot1 = useRef(new Animated.Value(0.3)).current;
  const dot2 = useRef(new Animated.Value(0.3)).current;
  const dot3 = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animate = (dot: Animated.Value, delay: number) => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(dot, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
            delay: delay,
          }),
          Animated.timing(dot, {
            toValue: 0.3,
            duration: 500,
            useNativeDriver: true,
          }),
        ]),
      ).start();
    };

    animate(dot1, 0);
    animate(dot2, 250);
    animate(dot3, 500);
  });

  return (
    <View style={styles.typingContainer}>
      {/* 🟢 FIX: Added 'styles.messageBubble' so it gets the rounded corners */}
      <View
        style={[styles.messageBubble, styles.botBubble, styles.typingBubble]}
      >
        <Animated.View style={[styles.typingDot, { opacity: dot1 }]} />
        <Animated.View style={[styles.typingDot, { opacity: dot2 }]} />
        <Animated.View style={[styles.typingDot, { opacity: dot3 }]} />
      </View>
    </View>
  );
});
TypingIndicator.displayName = "TypingIndicator";

export default function ChatScreen() {
  const [messages, setMessages] = useState<any[]>([]);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isLiveCallMode, setIsLiveCallMode] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showLiveGuidePopup, setShowLiveGuidePopup] = useState(false);
  const [activeReferralId, setActiveReferralId] = useState<string | null>(null);
  const [cropperUri, setCropperUri] = useState<string | null>(null); // raw URI waiting to be cropped
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const flatListRef = useRef<FlatList>(null);

  // Holographic Orb Animation Values
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const opacityAnim = useRef(new Animated.Value(0.8)).current;
  const popupAnim = useRef(new Animated.Value(0)).current;

  // Cleanup audio
  useEffect(() => {
    return () => {
      if (soundRef.current) soundRef.current.unloadAsync();
    };
  }, []);

  // Live Call Idle & Speaking Animations
  useEffect(() => {
    if (!isLiveCallMode) return;

    if (!isRecording && !isTranscribing && !isPlaying) {
      Animated.timing(scaleAnim, { toValue: 1, duration: 800, useNativeDriver: true }).start();
      Animated.timing(opacityAnim, { toValue: 0.8, duration: 300, useNativeDriver: true }).start();
    } else if (isPlaying) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(scaleAnim, { toValue: 1.15, duration: 350, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
          Animated.timing(scaleAnim, { toValue: 1.05, duration: 350, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
        ])
      ).start();
      Animated.timing(opacityAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
    } else if (isRecording) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(scaleAnim, { toValue: 1.05, duration: 150, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
          Animated.timing(scaleAnim, { toValue: 0.98, duration: 150, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
        ])
      ).start();
      Animated.timing(opacityAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
    } else {
      Animated.timing(opacityAnim, { toValue: 0.8, duration: 300, useNativeDriver: true }).start();
    }
  }, [isRecording, isTranscribing, isPlaying, isLiveCallMode]);

  // Live Guide Popup Animation Transition
  useEffect(() => {
    if (showLiveGuidePopup) {
      Animated.spring(popupAnim, {
        toValue: 1,
        useNativeDriver: true,
        friction: 8,
        tension: 50,
      }).start();
    } else {
      Animated.timing(popupAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [showLiveGuidePopup]);

  const route = useRoute();
  const { mode, referralId } = (route.params as any) || {}; // Get params

  const initiateFollowUp = async (id: string) => {
    setIsLoading(true);
    setActiveReferralId(id); // 🔑 Lock the session to monitoring agent

    const formData = new FormData();
    formData.append("referral_id", id); // Send the ID
    formData.append("generate_audio", "false"); // No voice in chat tab
    // No message needed; backend handles the trigger

    try {
      const response = await fetch(`${API_BASE_URL}/chat`, {
        method: "POST",
        body: formData,
        headers: {
          Accept: "application/json",
          "ngrok-skip-browser-warning": "true",
        },
      });
      const data = await response.json();

      // Add Bot's opening line ("Hi, I see you were treated for...")
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          text: data.reply,
          sender: "bot",
          hasText: true,
          audioBase64: null,
        },
      ]);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (mode === "follow_up" && referralId) {
      // Send a "blank" message with the ID to wake up the agent
      // The backend will see the ID and inject the system trigger
      initiateFollowUp(referralId);
    }
  }, [mode, referralId]);

  useEffect(() => {
    (async () => {
      await Audio.requestPermissionsAsync();
      await ImagePicker.requestCameraPermissionsAsync();
      await ImagePicker.requestMediaLibraryPermissionsAsync();
    })();

    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 800,
      useNativeDriver: true,
    }).start();
  }, []); // ✅ Run once on mount only

  useEffect(() => {
    if (messages.length > 0 || isLoading) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages, isLoading]);

  const sendToBackend = async (
    text: string | null,
    imageUri: string | null,
    audioUri: string | null,
  ) => {
    // 1. Show User Message Immediately
    const userMessageId = Date.now().toString();
    const userMessage = {
      id: userMessageId,
      text: text || (audioUri ? "Processing audio..." : null),
      sender: "user",
      image: imageUri,
      hasText: !!(text && text.trim().length > 0) || !!audioUri,
    };
    setMessages((prev) => [...prev, userMessage]);
    setInputText("");
    setIsLoading(true); // Show typing indicator immediately

    // 2. Prepare Data
    const formData = new FormData();
    if (text && text.trim().length > 0 && text !== "null") {
      formData.append("message", text);
    }
    // Always include referral_id if in follow-up mode — routes to monitoring agent
    if (activeReferralId) formData.append("referral_id", activeReferralId);
    formData.append("generate_audio", isLiveCallMode ? "true" : "false"); // True for Live Call

    if (imageUri)
      formData.append("file", {
        uri: imageUri,
        name: "photo.jpg",
        type: "image/jpeg",
      } as any);
    if (audioUri)
      formData.append("audio", {
        uri: audioUri,
        name: "recording.m4a",
        type: "audio/mp4",
      } as any);

    // 3. 🟢 Handle "Thanks" Message for Images with 1.5s DELAY
    if (imageUri) {
      setTimeout(() => {
        const ackMessage = {
          id: Date.now().toString() + "_ack",
          text: "Thanks for the photo! 📸\nPlease wait a moment while I analyze it...",
          sender: "bot",
          hasText: true,
        };
        // We use functional update to safely append to whatever state exists then
        setMessages((prev) => [...prev, ackMessage]);
      }, 1500);
    }

    try {
      // 4. Fetch from Backend (Happens in background immediately)
      const response = await fetch(`${API_BASE_URL}/chat`, {
        method: "POST",
        body: formData,
        headers: {
          Accept: "application/json",
          "ngrok-skip-browser-warning": "true",
        },
      });
      const data = await response.json();

      // If we sent audio, and the backend transcribed it, update our user message
      if (audioUri && data.transcribed_text) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === userMessageId
              ? { ...msg, text: data.transcribed_text }
              : msg,
          ),
        );
      }

      const rawReply =
        data.reply ||
        "Sorry, I didn't receive a valid response from the server.";

      // Detect [PHOTO_GUIDE] tag
      const hasPhotoGuide = rawReply.includes("[PHOTO_GUIDE]");
      const cleanReply = rawReply.replace(/\[PHOTO_GUIDE\]/g, "").trim();

      const botMessage = {
        id: (Date.now() + 1).toString(),
        text: cleanReply,
        sender: "bot",
        hasText: true,
        showPhotoGuide: hasPhotoGuide,
        audioBase64: null,
      };

      setMessages((prev) => [...prev, botMessage]);

      if (isLiveCallMode && hasPhotoGuide) {
        setShowLiveGuidePopup(true);
      }

      // Auto-play the audio response if available
      if (data.audio_base64 && botMessage.audioBase64) {
        playAudioMessage(botMessage.id, data.audio_base64);
      } else if (data.audio_base64 && isLiveCallMode) {
        // Play the audio globally if in Live Call Mode even without expanding a message
        playAudioMessage(botMessage.id, data.audio_base64);
      }
    } catch (error) {
      Alert.alert("Error", String(error));
    } finally {
      setIsLoading(false);
    }
  };

  const openCamera = async () => {
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 1, // full quality — we crop ourselves
    });
    if (!result.canceled) setCropperUri(result.assets[0].uri); // → show custom cropper
  };

  const openGallery = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 1,
    });
    if (!result.canceled) setCropperUri(result.assets[0].uri); // → show custom cropper
  };

  const startRecording = async () => {
    try {
      console.log("Starting chat recording...");
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
      const { recording: newRecording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
      );
      setRecording(newRecording);
      setIsRecording(true);
      if (isLiveCallMode && soundRef.current) {
        await soundRef.current.unloadAsync();
        setIsPlaying(false);
      }
      console.log("Chat recording started.");
    } catch (err) {
      console.error("Failed to start chat recording:", err);
      Alert.alert("Recording Error", "Failed to start recording.");
    }
  };

  const stopRecording = async () => {
    console.log(
      "Chat stopRecording clicked. isRecording:",
      isRecording,
      "recording obj:",
      !!recording,
    );
    setIsRecording(false);

    if (!recording) {
      console.log("Chat stopRecording: recording object is null!");
      return;
    }

    setIsTranscribing(true); // Indicate STT processing

    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecording(null);
      console.log("Chat recording stopped. URI:", uri);

      if (uri) {
        if (isLiveCallMode) {
          // Live Call Mode: Send audio directly as user message payload
          console.log("Live Call: Sending audio direct to Chat endpoint");
          sendToBackend(null, null, uri);
          setIsTranscribing(false); // sendToBackend implies processing
        } else {
          // Standard Chat Mode: Transcribe local, then pop into text box
          const formData = new FormData();
          formData.append("audio", {
            uri: uri,
            name: "voice_message.m4a",
            type: "audio/mp4",
          } as any);

          console.log("Sending backend transcription request...");
          const { transcribed_text } = await transcribeAudio(formData);
          console.log("Got back text:", transcribed_text);

          if (transcribed_text) {
            setInputText((prev) =>
              prev ? `${prev} ${transcribed_text}` : transcribed_text,
            );
          } else {
            Alert.alert(
              "Transcription Notice",
              "Could not understand audio or returned blank.",
            );
          }
          setIsTranscribing(false);
        }
      } else {
        setIsTranscribing(false);
      }
    } catch (e) {
      console.error("Transcription local error:", e);
      Alert.alert("Transcription Error", String(e));
      setIsTranscribing(false);
    }
  };

  const playAudioMessage = async (messageId: string, base64Audio: string) => {
    try {
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
      }

      const { sound } = await Audio.Sound.createAsync({
        uri: `data:audio/mp3;base64,${base64Audio}`,
      });

      soundRef.current = sound;
      setPlayingAudioId(messageId);

      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          setPlayingAudioId(null);
          setIsPlaying(false);
          sound.unloadAsync();
        }
      });

      setIsPlaying(true);
      await sound.playAsync();
    } catch (e) {
      console.error("Failed to play audio", e);
      setPlayingAudioId(null);
      setIsPlaying(false);
    }
  };

  const renderItem = ({ item }: { item: any }) => (
    <View
      style={[
        styles.messageContainer,
        item.sender === "user"
          ? { alignItems: "flex-end" }
          : { alignItems: "flex-start" },
      ]}
    >
      {item.image && (
        <Image source={{ uri: item.image }} style={styles.standaloneImage} />
      )}
      {item.hasText && (
        <View
          style={[
            styles.messageBubble,
            item.sender === "user" ? styles.userBubble : styles.botBubble,
          ]}
        >
          {item.sender === "bot" ? (
            <View style={{ flexDirection: "column" }}>
              <TypewriterText
                text={item.text}
                style={[styles.botText, styles.messageTextFix]}
              />

              {item.audioBase64 && (
                <TouchableOpacity
                  style={styles.inlinePlayButton}
                  onPress={() => playAudioMessage(item.id, item.audioBase64)}
                >
                  <Ionicons
                    name={
                      playingAudioId === item.id
                        ? "volume-high"
                        : "volume-medium-outline"
                    }
                    size={18}
                    color="#0a7ea4"
                  />
                  <ThemedText style={styles.inlinePlayText}>
                    {playingAudioId === item.id ? "Playing..." : "Play Voice"}
                  </ThemedText>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <ThemedText style={[styles.userText, styles.messageTextFix]}>
              {item.text}
            </ThemedText>
          )}
        </View>
      )}

      {/* Photo Guide Card — fades in after typewriter animation finishes */}
      {item.showPhotoGuide && (
        <DelayedGuideCard text={item.text || ""} styles={styles} />
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      <View style={styles.headerBar}>
        <ThemedText style={styles.headerTitle}>
          {isLiveCallMode ? "LIVE VOICEMAIL" : "TriMed"}
        </ThemedText>
        <View style={styles.headerActions}>
          <TouchableOpacity
            onPress={() => setIsLiveCallMode(!isLiveCallMode)}
            style={styles.headerButton}
          >
            <Ionicons
              name={isLiveCallMode ? "chatbubbles" : "call"}
              size={20}
              color={isLiveCallMode ? "#0a7ea4" : "#fff"}
              style={isLiveCallMode ? null : styles.solidIconButton}
            />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              setMessages([]);
              setActiveReferralId(null); // Reset mode when clearing chat
            }}
            style={styles.headerButton}
          >
            <Ionicons name="refresh-outline" size={22} color="#0a7ea4" />
          </TouchableOpacity>
        </View>
      </View>

      {!isLiveCallMode ? (
        <KeyboardAvoidingView
          style={styles.container}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
        >
          <ThemedView style={styles.innerContainer}>
            <FlatList
              ref={flatListRef}
              data={messages}
              renderItem={renderItem}
              keyExtractor={(item) => item.id}
              contentContainerStyle={[
                styles.chatList,
                messages.length === 0 && styles.emptyListContainer,
              ]}
              ListEmptyComponent={
                <Animated.View
                  style={[styles.emptyContainer, { opacity: fadeAnim }]}
                >
                  <ThemedText style={styles.emptyText}>
                    How can I help you?
                  </ThemedText>
                </Animated.View>
              }
              ListFooterComponent={isLoading ? <TypingIndicator /> : null}
              onContentSizeChange={() =>
                flatListRef.current?.scrollToEnd({ animated: true })
              }
            />

            <View style={styles.inputWrapper}>
              <View
                style={[
                  styles.inputContainer,
                  isRecording && styles.inputContainerRecording,
                ]}
              >
                {/* Gallery Button */}
                <TouchableOpacity
                  onPress={openGallery}
                  style={styles.iconButton}
                  disabled={isRecording || isTranscribing}
                >
                  <Ionicons
                    name="image-outline"
                    size={24}
                    color={isRecording || isTranscribing ? "#ccc" : "#0a7ea4"}
                  />
                </TouchableOpacity>

                {/* Camera Button */}
                <TouchableOpacity
                  onPress={openCamera}
                  style={styles.iconButton}
                  disabled={isRecording || isTranscribing}
                >
                  <Ionicons
                    name="camera-outline"
                    size={24}
                    color={isRecording || isTranscribing ? "#ccc" : "#0a7ea4"}
                  />
                </TouchableOpacity>

                <TextInput
                  style={styles.textInput}
                  placeholder={
                    isRecording
                      ? "Recording audio..."
                      : isTranscribing
                        ? "Transcribing..."
                        : "Ask me anything..."
                  }
                  placeholderTextColor={isRecording ? "red" : "#aaa"}
                  value={inputText}
                  onChangeText={setInputText}
                  editable={!isRecording && !isTranscribing}
                />

                {inputText.length > 0 ? (
                  <TouchableOpacity
                    onPress={() => sendToBackend(inputText, null, null)}
                    style={styles.sendButton}
                    disabled={isTranscribing}
                  >
                    <Ionicons name="arrow-up" size={20} color="#fff" />
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    onPress={isRecording ? stopRecording : startRecording}
                    style={styles.iconButton}
                    disabled={isTranscribing}
                  >
                    <Ionicons
                      name={isRecording ? "square" : "mic"}
                      size={24}
                      color={isRecording ? "red" : "#0a7ea4"}
                    />
                  </TouchableOpacity>
                )}
              </View>
              <ThemedText style={styles.disclaimerText}>
                AI-Triage is an AI assistant and may make mistakes.{"\n"}Please verify important medical information.
              </ThemedText>
            </View>
          </ThemedView>
        </KeyboardAvoidingView>
      ) : (
        <View style={styles.liveCallContainer}>
          <ThemedText style={styles.statusText}>
            {isRecording
              ? "Listening..."
              : isLoading
                ? "Thinking..."
                : isPlaying
                  ? "Speaking..."
                  : "Tap the mic to start talking."}
          </ThemedText>

          <View style={styles.orbWrapper}>
            <Animated.View
              style={[
                styles.orbInner,
                {
                  transform: [{ scale: scaleAnim }],
                  opacity: opacityAnim,
                },
              ]}
            >
              <ShaderOrb
                scaleAnim={scaleAnim}
                opacityAnim={opacityAnim}
                size={240}
                colorHex={isRecording ? 0x8000ff : 0x00e5ff}
              />
            </Animated.View>
          </View>

          <View style={styles.bottomControls}>
            {/* Gallery Button */}
            <TouchableOpacity
              onPress={openGallery}
              style={styles.sideMediaButton}
              disabled={isRecording || isLoading || isPlaying}
            >
              <Ionicons
                name="image"
                size={24}
                color={
                  isRecording || isLoading || isPlaying ? "#ccc" : "#0a7ea4"
                }
              />
            </TouchableOpacity>

            <View style={{ alignItems: "center" }}>
              <TouchableOpacity
                onPress={isRecording ? stopRecording : startRecording}
                style={[
                  styles.bigMicButton,
                  isRecording && styles.bigMicButtonRecording,
                ]}
                activeOpacity={0.7}
                disabled={isLoading || isPlaying}
              >
                <Ionicons
                  name={isRecording ? "square" : "mic"}
                  size={36}
                  color="#fff"
                />
              </TouchableOpacity>
              <ThemedText style={styles.recordSubtext}>
                {isRecording ? "Tap to send" : ""}
              </ThemedText>
            </View>

            {/* Camera Button */}
            <TouchableOpacity
              onPress={openCamera}
              style={styles.sideMediaButton}
              disabled={isRecording || isLoading || isPlaying}
            >
              <Ionicons
                name="camera"
                size={24}
                color={
                  isRecording || isLoading || isPlaying ? "#ccc" : "#0a7ea4"
                }
              />
            </TouchableOpacity>
          </View>

          <ThemedText style={[styles.liveDisclaimerText, { textAlign: "center", lineHeight: 20 }]}>
            AI-Triage is an AI assistant and may make mistakes.{"\n"}Please verify important medical information.
          </ThemedText>

          <Animated.View style={[
            styles.liveGuidePopup,
            {
              opacity: popupAnim,
              transform: [{
                scale: popupAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.85, 1]
                })
              }]
            }
          ]} pointerEvents={showLiveGuidePopup ? "auto" : "none"}>
            <TouchableOpacity
              style={styles.liveGuideClose}
              onPress={() => setShowLiveGuidePopup(false)}
            >
              <Ionicons name="close" size={26} color="#444" />
            </TouchableOpacity>
            <Image
              source={require("../../assets/images/throat_guide.jpg")}
              style={styles.liveGuideImage}
              resizeMode="contain"
            />
          </Animated.View>
        </View>
      )}

      {/* Custom free-form image cropper — shown after camera/gallery pick */}
      {cropperUri && (
        <ImageCropper
          visible={!!cropperUri}
          imageUri={cropperUri}
          onCrop={(result) => {
            setCropperUri(null);
            sendToBackend(null, result.uri, null);
          }}
          onCancel={() => setCropperUri(null)}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  headerBar: {
    paddingTop:
      Platform.OS === "android" ? (StatusBar.currentHeight || 0) + 10 : 10,
    height:
      Platform.OS === "android" ? (StatusBar.currentHeight || 0) + 60 : 60,
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
    flexDirection: "row",
    paddingHorizontal: 15,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerButton: {
    padding: 6,
    justifyContent: "center",
    alignItems: "center",
  },
  solidIconButton: {
    backgroundColor: "#0a7ea4",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    overflow: "hidden",
  },
  headerTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: "700",
    color: "#0a7ea4",
    letterSpacing: 0.5,
  },
  container: { flex: 1 },
  innerContainer: { flex: 1, justifyContent: "space-between" },
  chatList: { padding: 15 },
  messageContainer: { marginVertical: 6, width: "100%" },
  standaloneImage: {
    width: 280,
    height: 200,
    borderRadius: 16,
    marginBottom: 8,
  },

  // --- SHARED BUBBLE STYLES ---
  messageBubble: {
    padding: 12,
    borderRadius: 18,
    maxWidth: "85%",
  },
  // USER: Sharp Bottom Right Corner
  userBubble: {
    backgroundColor: "#0a7ea4",
    borderBottomRightRadius: 4,
  },
  // BOT: White card with shadow
  botBubble: {
    backgroundColor: "#fff",
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: "#f0f0f0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07,
    shadowRadius: 4,
    elevation: 2,
  },

  userText: { color: "white", fontSize: 15, fontWeight: "500" },
  botText: { color: "#333", fontSize: 15 },
  emptyListContainer: { flexGrow: 1, justifyContent: "center" },
  emptyContainer: { alignItems: "center" },
  emptyText: {
    fontSize: 20,
    fontWeight: "700",
    textAlign: "center",
    color: "#0a7ea4",
    opacity: 0.6,
  },
  messageTextFix: { lineHeight: 22, includeFontPadding: false },
  inputWrapper: {
    paddingHorizontal: 15,
    paddingVertical: 10,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#f0f0f0",
  },
  disclaimerText: {
    textAlign: "center",
    fontSize: 10,
    color: "#999",
    marginTop: 8,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f8f9fa",
    borderWidth: 1.5,
    borderColor: "#0a7ea4",
    borderRadius: 50,
    paddingHorizontal: 10,
    minHeight: 50,
  },
  inputContainerRecording: { borderColor: "red", backgroundColor: "#fff5f5" },
  textInput: { flex: 1, fontSize: 15, color: "#333", paddingHorizontal: 10 },
  iconButton: { padding: 6, justifyContent: "center", alignItems: "center" },
  sendButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#0a7ea4",
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 4,
  },

  // --- TYPING INDICATOR STYLES ---
  typingContainer: {
    width: "100%",
    alignItems: "flex-start",
    marginTop: 6,
    marginBottom: 12,
  },
  typingBubble: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    width: 70,
    height: 40,
    marginLeft: 0,
  },
  typingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#999",
    marginHorizontal: 3,
  },
  inlinePlayButton: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#eee",
    gap: 6,
  },
  inlinePlayText: {
    fontSize: 12,
    color: "#0a7ea4",
    fontWeight: "600",
  },

  // --- PHOTO GUIDE CARD STYLES ---
  guideCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    marginTop: 8,
    maxWidth: "95%",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  guideHeader: {
    backgroundColor: "#0a7ea4",
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 14,
    gap: 8,
  },
  guideHeaderText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  // --- LIVE CALL STYLES ---
  liveCallContainer: {
    flex: 1,
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 40,
    backgroundColor: "#fff",
  },
  statusText: {
    fontSize: 20,
    fontWeight: "500",
    color: "#555",
    marginTop: 20,
    letterSpacing: 0.5,
  },
  orbWrapper: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    width: "100%",
  },
  orbInner: {
    width: 240,
    height: 240,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#00e5ff",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 30,
    elevation: 15,
    zIndex: 2,
  },
  orbImage: {
    width: "100%",
    height: "100%",
    borderRadius: 120, // Circular mask
    resizeMode: "cover",
  },
  bottomControls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 30,
    height: 100,
  },
  liveDisclaimerText: {
    textAlign: "center",
    fontSize: 10,
    color: "#bbb",
    marginTop: 10,
    paddingHorizontal: 20,
  },
  sideMediaButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#f0f0f0",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  bigMicButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#0a7ea4",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#0a7ea4",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  bigMicButtonRecording: {
    backgroundColor: "#e74c3c",
    shadowColor: "#e74c3c",
  },
  recordSubtext: {
    marginTop: 10,
    fontSize: 13,
    color: "#d9534f",
    fontWeight: "600",
  },
  guideStep: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: "#eee",
  },
  guideStepIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  guideStepTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#333",
    marginBottom: 2,
  },
  guideStepDesc: {
    fontSize: 12,
    color: "#666",
    lineHeight: 17,
  },
  guideImage: {
    width: "100%",
    height: 200,
  },
  liveGuidePopup: {
    position: "absolute",
    top: "12%",
    left: "5%",
    right: "5%",
    backgroundColor: "rgba(255, 255, 255, 0.96)",
    borderRadius: 20,
    padding: 20,
    alignItems: "center",
    zIndex: 100,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 15,
  },
  liveGuideClose: {
    position: "absolute",
    top: 12,
    right: 12,
    zIndex: 101,
    padding: 5,
  },
  liveGuideImage: {
    width: "100%",
    height: 250,
    marginTop: 15,
    borderRadius: 8,
  },
});
