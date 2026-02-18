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

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";

// ⚠️ CHANGE TO YOUR IP
const API_BASE_URL = "https://adultly-peckiest-kourtney.ngrok-free.dev/chat";

// --- Typewriter Component ---
const TypewriterText = memo(({ text, style }: { text: string; style: any }) => {
  const [displayedText, setDisplayedText] = useState("");
  const index = useRef(0);

  useEffect(() => {
    // Reset if text changes
    setDisplayedText("");
    index.current = 0;

    const speed = 10;
    const timer = setInterval(() => {
      if (index.current < text.length) {
        const chunk = text.slice(index.current, index.current + 3);
        setDisplayedText((prev) => prev + chunk);
        index.current += 3;
      } else {
        clearInterval(timer);
      }
    }, speed);
    return () => clearInterval(timer);
  }, [text]);

  return <ThemedText style={style}>{displayedText}</ThemedText>;
});
TypewriterText.displayName = "TypewriterText";

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

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const flatListRef = useRef<FlatList>(null);

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
  });

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
      const response = await fetch(API_BASE_URL, {
        method: "POST",
        body: formData,
        headers: { Accept: "application/json" },
      });
      const data = await response.json();

      const botMessage = {
        id: (Date.now() + 1).toString(),
        text: data.reply,
        sender: "bot",
        hasText: true,
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
      quality: 0.5,
    });
    if (!result.canceled) sendToBackend(null, result.assets[0].uri, null);
  };

  const openGallery = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.5,
    });
    if (!result.canceled) sendToBackend(null, result.assets[0].uri, null);
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
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      <View style={styles.headerBar}>
        <ThemedText style={styles.headerTitle}>AI TRIAGE</ThemedText>
        <TouchableOpacity
          onPress={() => setMessages([])}
          style={styles.refreshButton}
        >
          <Ionicons name="refresh-outline" size={24} color="#0a7ea4" />
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
                  size={26}
                  color={isRecording ? "#ccc" : "black"}
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
                  size={26}
                  color={isRecording ? "#ccc" : "black"}
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
                  style={styles.iconButton}
                >
                  <Ionicons
                    name="arrow-forward-outline"
                    size={26}
                    color="black"
                  />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  onPress={isRecording ? stopRecording : startRecording}
                  style={styles.iconButton}
                >
                  <Ionicons
                    name={isRecording ? "square" : "mic-outline"}
                    size={26}
                    color={isRecording ? "red" : "black"}
                  />
                </TouchableOpacity>
              )}
            </View>
          </View>
        </ThemedView>
      </KeyboardAvoidingView>
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
  headerTitle: { fontSize: 16, fontWeight: "700", color: "#333" },
  container: { flex: 1 },
  innerContainer: { flex: 1, justifyContent: "space-between" },
  chatList: { padding: 15 },
  messageContainer: { marginVertical: 6, width: "100%" },
  standaloneImage: {
    width: 280,
    height: 200,
    borderRadius: 20,
    marginBottom: 8,
  },

  // --- SHARED BUBBLE STYLES ---
  messageBubble: {
    padding: 14,
    borderRadius: 22,
    maxWidth: "85%",
  },
  // USER: Sharp Bottom Right Corner
  userBubble: {
    backgroundColor: "#0a7ea4",
    borderBottomRightRadius: 4,
  },
  // BOT: Sharp Bottom Left Corner
  botBubble: {
    backgroundColor: "#f2f2f2",
    borderBottomLeftRadius: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 1,
  },

  userText: { color: "white", fontSize: 15, fontWeight: "500" },
  botText: { color: "black", fontSize: 15 },
  emptyListContainer: { flexGrow: 1, justifyContent: "center" },
  emptyContainer: { alignItems: "center" },
  emptyText: {
    fontSize: 22,
    fontWeight: "700",
    textAlign: "center",
    opacity: 0.6,
  },
  messageTextFix: { lineHeight: 22, includeFontPadding: false },
  inputWrapper: {
    paddingHorizontal: 15,
    paddingVertical: 10,
    backgroundColor: "#fff",
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderWidth: 1.5,
    borderColor: "#000",
    borderRadius: 50,
    paddingHorizontal: 10,
    minHeight: 50,
  },
  inputContainerRecording: { borderColor: "red" },
  textInput: { flex: 1, fontSize: 16, color: "#000", paddingHorizontal: 10 },
  iconButton: { padding: 6, justifyContent: "center", alignItems: "center" },

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
});
