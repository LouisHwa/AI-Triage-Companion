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
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { Audio } from "expo-av";
import ImageCropper from "@/components/ImageCropper";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";

import { useRoute } from "@react-navigation/native";

// Centralized services
import { API_BASE_URL } from "@/services/apiClient";

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
const DelayedGuideCard = memo(({ text, styles }: { text: string; styles: any }) => {
  const [visible, setVisible] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(10)).current;

  useEffect(() => {
    // Calculate how long typewriter takes, add 200ms buffer
    const typewriterMs = Math.ceil((text.length / 3) * 10) + 200;
    const timer = setTimeout(() => {
      setVisible(true);
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 350, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 0, duration: 350, useNativeDriver: true }),
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
          <ThemedText style={styles.guideHeaderText}>Photo Capture Guide</ThemedText>
        </View>
        <Image
          source={require("../../assets/images/throat_guide.jpg")}
          style={styles.guideImage}
          resizeMode="contain"
        />
      </View>
    </Animated.View>
  );
});
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
  const [activeReferralId, setActiveReferralId] = useState<string | null>(null);
  const [cropperUri, setCropperUri] = useState<string | null>(null); // raw URI waiting to be cropped

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const flatListRef = useRef<FlatList>(null);

  const route = useRoute();
  const { mode, referralId } = (route.params as any) || {}; // Get params

  const initiateFollowUp = async (id: string) => {
    setIsLoading(true);
    setActiveReferralId(id); // 🔑 Lock the session to monitoring agent

    const formData = new FormData();
    formData.append("referral_id", id); // Send the ID
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
    const userMessage = {
      id: Date.now().toString(),
      text: text || (audioUri ? "Audio message" : null),
      sender: "user",
      image: imageUri,
      hasText: !!(text && text.trim().length > 0) || !!audioUri,
    };
    setMessages((prev) => [...prev, userMessage]);
    setInputText("");
    setIsLoading(true); // Show typing indicator immediately

    // 2. Prepare Data
    const formData = new FormData();
    if (text) formData.append("message", text);
    // Always include referral_id if in follow-up mode — routes to monitoring agent
    if (activeReferralId) formData.append("referral_id", activeReferralId);
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
      };
      setMessages((prev) => [...prev, botMessage]);
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
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
      );
      setRecording(recording);
      setIsRecording(true);
    } catch (err) {
      console.error(err);
    }
  };

  const stopRecording = async () => {
    setIsRecording(false);
    if (!recording) return;
    await recording.stopAndUnloadAsync();
    const uri = recording.getURI();
    setRecording(null);
    if (uri) sendToBackend(null, null, uri);
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
            <TypewriterText
              text={item.text}
              style={[styles.botText, styles.messageTextFix]}
            />
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
        <ThemedText style={styles.headerTitle}>AI TRIAGE</ThemedText>
        <TouchableOpacity
          onPress={() => {
            setMessages([]);
            setActiveReferralId(null); // Reset mode when clearing chat
          }}
          style={styles.refreshButton}
        >
          <Ionicons name="refresh-outline" size={22} color="#0a7ea4" />
        </TouchableOpacity>
      </View>

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
                disabled={isRecording}
              >
                <Ionicons
                  name="image-outline"
                  size={24}
                  color={isRecording ? "#ccc" : "#0a7ea4"}
                />
              </TouchableOpacity>

              {/* Camera Button */}
              <TouchableOpacity
                onPress={openCamera}
                style={styles.iconButton}
                disabled={isRecording}
              >
                <Ionicons
                  name="camera-outline"
                  size={24}
                  color={isRecording ? "#ccc" : "#0a7ea4"}
                />
              </TouchableOpacity>

              <TextInput
                style={styles.textInput}
                placeholder={
                  isRecording ? "Recording audio..." : "Ask me anything..."
                }
                placeholderTextColor={isRecording ? "red" : "#aaa"}
                value={inputText}
                onChangeText={setInputText}
                editable={!isRecording}
              />

              {inputText.length > 0 ? (
                <TouchableOpacity
                  onPress={() => sendToBackend(inputText, null, null)}
                  style={styles.sendButton}
                >
                  <Ionicons
                    name="arrow-up"
                    size={20}
                    color="#fff"
                  />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  onPress={isRecording ? stopRecording : startRecording}
                  style={styles.iconButton}
                >
                  <Ionicons
                    name={isRecording ? "square" : "mic-outline"}
                    size={24}
                    color={isRecording ? "red" : "#0a7ea4"}
                  />
                </TouchableOpacity>
              )}
            </View>
          </View>
        </ThemedView>
      </KeyboardAvoidingView>
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
    position: "relative",
    paddingHorizontal: 15,
  },
  refreshButton: {
    position: "absolute",
    right: 15,
    top: Platform.OS === "android" ? (StatusBar.currentHeight || 0) + 10 : 15,
    padding: 6,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: { fontSize: 16, fontWeight: "700", color: "#0a7ea4" },
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
});
