import React, { useState } from "react";
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
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";

// Import your themed components for dark/light mode support
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";

// ✅ YOUR UPDATED IP ADDRESS
const API_URL = process.env.EXPO_PUBLIC_URL + "/chat";

export default function ChatScreen() {
  const [messages, setMessages] = useState([
    { id: "1", text: "Hello! I am your AI assistant.", sender: "bot" },
  ]);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // --- FUNCTION: Send Message to Python Backend ---
  const sendMessage = async () => {
    if (!inputText.trim()) return;

    const userMessage = {
      id: Date.now().toString(),
      text: inputText,
      sender: "user",
    };

    // 1. Update UI immediately
    setMessages((prev) => [...prev, userMessage]);
    setInputText("");
    setIsLoading(true);

    try {
      // 2. Send to Server
      const response = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMessage.text }),
      });

      const data = await response.json();

      const botMessage = {
        id: (Date.now() + 1).toString(),
        text: data.reply,
        sender: "bot",
      };
      setMessages((prev) => [...prev, botMessage]);
    } catch (error) {
      Alert.alert(
        "Connection Error",
        "Could not reach 192.168.1.102. Make sure your Python server is running!",
      );
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  // --- FUNCTION: Open Camera ---
  const openCamera = async () => {
    const permissionResult = await ImagePicker.requestCameraPermissionsAsync();

    if (permissionResult.granted === false) {
      Alert.alert(
        "Permission Required",
        "You've refused to allow this app to access your camera!",
      );
      return;
    }

    const result = await ImagePicker.launchCameraAsync();
    if (!result.canceled) {
      // Logic to handle image would go here
      console.log(result.assets[0].uri);
    }
  };

  // --- RENDER COMPONENT ---
  const renderItem = ({
    item,
  }: {
    item: { id: string; text: string; sender: string };
  }) => (
    <View
      style={[
        styles.messageBubble,
        item.sender === "user" ? styles.userBubble : styles.botBubble,
      ]}
    >
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
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
      >
        <ThemedView style={styles.innerContainer}>
          {/* 1. THE CHAT HISTORY */}
          <FlatList
            data={messages}
            renderItem={renderItem}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.chatList}
          />

          {/* 2. LOADING SPINNER */}
          {isLoading && (
            <View style={styles.loader}>
              <ActivityIndicator size="small" color="#0a7ea4" />
            </View>
          )}

          {/* 3. THE INPUT BAR (Pill Shape) */}
          <View style={styles.inputWrapper}>
            <View style={styles.inputContainer}>
              {/* Camera Icon */}
              <TouchableOpacity onPress={openCamera}>
                <Ionicons
                  name="camera-outline"
                  size={24}
                  color="black"
                  style={styles.icon}
                />
              </TouchableOpacity>

              {/* Text Input */}
              <TextInput
                style={styles.textInput}
                placeholder="Hi! What may i help you check with today?"
                placeholderTextColor="#999"
                value={inputText}
                onChangeText={setInputText}
                onSubmitEditing={sendMessage}
              />

              {/* Mic OR Send Icon */}
              {inputText.length === 0 ? (
                <TouchableOpacity
                  onPress={() => Alert.alert("Mic", "Recording logic here")}
                >
                  <Ionicons
                    name="mic-outline"
                    size={24}
                    color="black"
                    style={styles.icon}
                  />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity onPress={sendMessage}>
                  <Ionicons
                    name="arrow-forward"
                    size={24}
                    color="#0a7ea4"
                    style={styles.icon}
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
  safeArea: {
    flex: 1,
    backgroundColor: "#fff", // Match this to your ThemedView background if needed
  },
  container: {
    flex: 1,
  },
  innerContainer: {
    flex: 1,
    justifyContent: "space-between",
  },
  chatList: {
    paddingHorizontal: 15,
    paddingTop: 20,
    paddingBottom: 10,
  },
  loader: {
    padding: 10,
    alignItems: "center",
  },
  // BUBBLE STYLES
  messageBubble: {
    maxWidth: "80%",
    padding: 12,
    borderRadius: 20,
    marginVertical: 5,
  },
  userBubble: {
    alignSelf: "flex-end",
    backgroundColor: "#0a7ea4",
    borderBottomRightRadius: 4, // Little tail effect
  },
  botBubble: {
    alignSelf: "flex-start",
    backgroundColor: "#f0f0f0",
    borderBottomLeftRadius: 4,
  },
  userText: { color: "white" },
  botText: { color: "black" },

  // INPUT BAR STYLES
  inputWrapper: {
    paddingHorizontal: 15,
    paddingBottom: 10, // Padding from bottom of screen
    paddingTop: 10,
    backgroundColor: "transparent",
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 30, // PILL SHAPE
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#e0e0e0",
    // Shadows
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  textInput: {
    flex: 1,
    height: 40,
    fontSize: 15,
    marginHorizontal: 10,
    color: "#000",
  },
  icon: {
    marginHorizontal: 5,
  },
});
