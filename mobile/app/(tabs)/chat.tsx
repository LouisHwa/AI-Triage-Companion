import React, { useState, useEffect } from "react";
import {
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  View,
  ActivityIndicator,
  SafeAreaView,
  Alert,
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { Audio } from "expo-av"; // <--- NEW: Import Audio

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";

// ⚠️ CHANGE TO YOUR IP
const API_URL = process.env.EXPO_PUBLIC_API_URL + "/chat";

export default function ChatScreen() {
  const [messages, setMessages] = useState([
    {
      id: "1",
      text: "Hello! I can see and listen. How can I help?",
      sender: "bot",
    },
  ]);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Audio Recording State
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);

  // --- PERMISSIONS ---
  useEffect(() => {
    (async () => {
      await Audio.requestPermissionsAsync();
      await ImagePicker.requestCameraPermissionsAsync();
    })();
  }, []);

  // --- FUNCTION 1: MASTER SEND (Handles Text, Image, OR Audio) ---
  const sendToBackend = async (
    text: string | null,
    imageUri: string | null,
    audioUri: string | null,
  ) => {
    setIsLoading(true);

    // 1. Update UI with user message
    const userMsgId = Date.now().toString();
    const userMessage = {
      id: userMsgId,
      text: text || (audioUri ? "Sent an audio clip..." : "Sent an image..."),
      sender: "user",
      image: imageUri,
    };
    // @ts-ignore
    setMessages((prev) => [...prev, userMessage]);
    setInputText("");

    // 2. Prepare Form Data
    const formData = new FormData();

    if (text) {
      formData.append("message", text);
    }

    if (imageUri) {
      // @ts-ignore
      formData.append("file", {
        uri: imageUri,
        name: "photo.jpg",
        type: "image/jpeg",
      });
    }

    if (audioUri) {
      // @ts-ignore
      formData.append("audio", {
        uri: audioUri,
        name: "recording.m4a", // Ensure extension matches backend expectation
        type: "audio/mp4",
      });
    }

    // 3. Send
    try {
      const response = await fetch(API_URL, {
        method: "POST",
        body: formData,
        headers: {
          Accept: "application/json",
          // Do NOT set Content-Type here, let fetch handle boundary
        },
      });

      const data = await response.json();

      const botMessage = {
        id: (Date.now() + 1).toString(),
        text: data.reply,
        sender: "bot",
      };
      // @ts-ignore
      setMessages((prev) => [...prev, botMessage]);
    } catch (error) {
      Alert.alert("Error", "Server connection failed.");
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  // --- FUNCTION 2: HANDLE CAMERA ---
  const openCamera = async () => {
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.5,
    });

    if (!result.canceled) {
      // Send immediately (Text is null, Audio is null)
      sendToBackend(null, result.assets[0].uri, null);
    }
  };

  // --- FUNCTION 3: HANDLE AUDIO RECORDING ---
  const startRecording = async () => {
    try {
      console.log("Starting recording..");
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
      console.error("Failed to start recording", err);
    }
  };

  const stopRecording = async () => {
    console.log("Stopping recording..");
    setRecording(null);
    setIsRecording(false);

    if (!recording) return;

    await recording.stopAndUnloadAsync();
    const uri = recording.getURI();
    console.log("Recording stopped and stored at", uri);

    // Send immediately (Text is null, Image is null)
    if (uri) {
      sendToBackend(null, null, uri);
    }
  };

  // --- RENDER ---
  const renderItem = ({ item }: { item: any }) => (
    <View
      style={[
        styles.messageBubble,
        item.sender === "user" ? styles.userBubble : styles.botBubble,
      ]}
    >
      {item.image && (
        <Image
          source={{ uri: item.image }}
          style={{ width: 200, height: 200, borderRadius: 10 }}
        />
      )}
      <ThemedText
        style={item.sender === "user" ? styles.userText : styles.botText}
      >
        {item.text}
      </ThemedText>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ThemedView style={styles.innerContainer}>
          <FlatList
            data={messages}
            renderItem={renderItem}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.chatList}
          />

          {isLoading && <ActivityIndicator size="small" color="#0a7ea4" />}

          {/* INPUT BAR */}
          {/* INPUT BAR AREA */}
          <View style={styles.inputWrapper}>
            {/* The Single "Pill" Container */}
            <View style={styles.inputContainer}>
              {/* 1. Camera Icon (Left) */}
              <TouchableOpacity onPress={openCamera} style={styles.iconButton}>
                <Ionicons name="camera-outline" size={26} color="black" />
              </TouchableOpacity>

              {/* 2. Text Input (Middle) */}
              <TextInput
                style={styles.textInput}
                placeholder="Hi! What may i help you check with today?"
                placeholderTextColor="#ccc" // Light gray for placeholder
                value={inputText}
                onChangeText={setInputText}
                editable={!isRecording}
                multiline={false} // Keeps it single line like the image
              />

              {/* 3. Mic OR Send Icon (Right) */}
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

              {/* Optional: If you want the arrow to ALWAYS be there like your image, 
                  you can just render the arrow next to the mic, but usually it's one or the other. 
                  If you want EXACTLY your image (Mic AND Arrow), use this: 
              */}
              {/* <View style={{flexDirection: 'row', alignItems: 'center'}}>
                 <Ionicons name="mic-outline" size={26} color="black" style={{marginRight: 10}} />
                 <Ionicons name="arrow-forward-outline" size={26} color="black" />
               </View>
               */}
            </View>
          </View>
        </ThemedView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  container: { flex: 1 },
  innerContainer: { flex: 1, justifyContent: "space-between" },
  chatList: { padding: 15 },
  messageBubble: {
    padding: 10,
    borderRadius: 15,
    marginVertical: 5,
    maxWidth: "80%",
  },
  userBubble: { alignSelf: "flex-end", backgroundColor: "#0a7ea4" },
  botBubble: { alignSelf: "flex-start", backgroundColor: "#f0f0f0" },
  userText: { color: "white" },
  botText: { color: "black" },
  inputWrapper: {
    paddingHorizontal: 15,
    paddingVertical: 10,
    backgroundColor: "#fff", // Or 'transparent' if you have a background image
  },

  // This is the main "Pill"
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",

    // BORDER STYLING
    borderWidth: 1.5, // Slightly thicker to match your image
    borderColor: "#000", // Pure black border
    borderRadius: 50, // High number makes it fully rounded (pill)

    // PADDING INSIDE THE PILL
    paddingHorizontal: 10,
    paddingVertical: 5, // Small vertical padding to center items

    // HEIGHT (Optional, but helps consistency)
    minHeight: 50,
  },

  textInput: {
    flex: 1, // Takes up all available middle space
    fontSize: 16,
    color: "#000",
    paddingHorizontal: 10, // Space between text and icons
    height: "100%",
  },

  iconButton: {
    padding: 5, // Increases touch area without changing look
    justifyContent: "center",
    alignItems: "center",
  },
});
