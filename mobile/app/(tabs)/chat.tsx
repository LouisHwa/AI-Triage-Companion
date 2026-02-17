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
const API_URL = "http://192.168.1.106:8000/chat";

// --- Typewriter Component ---
const TypewriterText = memo(({ text, style }: { text: string; style: any }) => {
  const [displayedText, setDisplayedText] = useState("");
  const index = useRef(0);

  useEffect(() => {
    const speed = 1;
    const timer = setInterval(() => {
      if (index.current < text.length) {
        const chunk = text.slice(index.current, index.current + 5);
        setDisplayedText((prev) => prev + chunk);
        index.current += 5;
      } else {
        clearInterval(timer);
      }
    }, speed);
    return () => clearInterval(timer);
  }, [text]);

  return <ThemedText style={style}>{displayedText}</ThemedText>;
});
TypewriterText.displayName = 'TypewriterText';

// --- Skeleton Loader ---
const SkeletonLoader = memo(() => {
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(shimmerAnim, {
          toValue: 0,
          duration: 1000,
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, []);

  const opacity = shimmerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.7],
  });

  return (
    <View style={styles.skeletonContainer}>
      <View style={[styles.skeletonBubble, { borderBottomLeftRadius: 4 }]}>
        <Animated.View
          style={[styles.skeletonLine, styles.skeletonLineLong, { opacity }]}
        />
        <Animated.View
          style={[styles.skeletonLine, styles.skeletonLineMedium, { opacity }]}
        />
        <Animated.View
          style={[styles.skeletonLine, styles.skeletonLineShort, { opacity }]}
        />
      </View>
    </View>
  );
});
SkeletonLoader.displayName = 'SkeletonLoader';

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
    })();

    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 800,
      useNativeDriver: true,
    }).start();
  }, []);

  useEffect(() => {
    if (messages.length > 0) {
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
    setIsLoading(true);
    const userMessage = {
      id: Date.now().toString(),
      text: text || (audioUri ? "Audio message" : null),
      sender: "user",
      image: imageUri,
      hasText: !!(text && text.trim().length > 0) || !!audioUri,
    };
    setMessages((prev) => [...prev, userMessage]);
    setInputText("");

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

    try {
      const response = await fetch(API_URL, {
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
      Alert.alert("Error", "Server connection failed.");
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
            onContentSizeChange={() =>
              flatListRef.current?.scrollToEnd({ animated: true })
            }
          />

          {isLoading && <SkeletonLoader />}

          <View style={styles.inputWrapper}>
            <View
              style={[
                styles.inputContainer,
                isRecording && styles.inputContainerRecording,
              ]}
            >
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

  // SHARED BUBBLE STYLES
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
  skeletonContainer: {
    paddingLeft: 15,
    paddingRight: 15,
    marginBottom: 15,
    alignItems: "flex-start",
  },
  skeletonBubble: {
    backgroundColor: "#f2f2f2",
    padding: 12,
    borderRadius: 18,
    maxWidth: "80%",
    minWidth: 200,
  },
  skeletonLine: {
    height: 12,
    backgroundColor: "#e0e0e0",
    borderRadius: 6,
    marginVertical: 4,
  },
  skeletonLineLong: { width: "100%" },
  skeletonLineMedium: { width: "75%" },
  skeletonLineShort: { width: "50%" },
});
