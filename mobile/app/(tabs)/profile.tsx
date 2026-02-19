/*
api will be @app.get("/user/{user_id}")

takes in param user_id, in this case mock will be; MOCK_USER_ID = "BdLcWMFmHjiPghRE7EZW"

server returns json format: 
{
  "Name": "Louis",
  "Email": "louishwa888@gmail.com",
  "CreatedAt": "2026-02-16T07:39:21.713000+00:00",
  "Gender": "male",
  "Age": 21,
  "Medical_History": "no allergies"
}

@app.get("/user/{user_id}")
async def get_user(user_id: str):
    user_ref = db.collection("user").document(user_id)
    user = user_ref.get()

    if not user.exists:
        return {"error": "User not found"}

    return user.to_dict()


*/

import React, { useState, useEffect } from "react";
import {
  View,
  TextInput,
  Button,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
  Text,
} from "react-native";
import { ThemedText } from "@/components/themed-text";

const MOCK_USER_ID = "BdLcWMFmHjiPghRE7EZW";
// const API_BASE_URL = "http://192.168.1.104:8000";
const API_BASE_URL = "https://adultly-peckiest-kourtney.ngrok-free.dev";

type Profile = {
  Name: string;
  Email: string;
  CreatedAt: string;
  Gender: string;
  Age: string; // stored as string in UI
  Medical_History: string;
};

export default function ProfileScreen() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/user/${MOCK_USER_ID}`, {
        headers: { "ngrok-skip-browser-warning": "true" },
      });
      const data = await response.json();

      if (!response.ok || data.error) {
        throw new Error(data.error || "Failed to fetch user");
      }

      setProfile({
        Name: data.Name ?? "",
        Email: data.Email ?? "",
        CreatedAt: data.CreatedAt ?? "",
        Gender: data.Gender ?? "",
        Age: data.Age ? String(data.Age) : "",
        Medical_History: data.Medical_History ?? "",
      });
    } catch (error) {
      Alert.alert("Error", "Could not load profile data.");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: keyof Profile, value: string) => {
    if (!profile) return;
    setProfile({ ...profile, [field]: value });
  };

  const handleSave = async () => {
    if (!profile) return;

    setSaving(true);
    try {
      const payload = {
        ...profile,
        Age: profile.Age ? parseInt(profile.Age, 10) : null,
      };

      const response = await fetch(`${API_BASE_URL}/user/${MOCK_USER_ID}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error("Failed to save profile");
      }

      Alert.alert("Success", "Profile updated successfully!");
    } catch (error) {
      Alert.alert("Error", "Could not save profile data.");
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return "N/A";

    const date = new Date(dateString);
    if (isNaN(date.getTime())) return "Invalid date";

    return date.toLocaleString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text>Unable to load profile.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      {/* Created At */}
      <View style={styles.formGroup}>
        <ThemedText>Account Created</ThemedText>
        <TextInput
          style={[styles.input, styles.readOnlyInput]}
          value={formatDate(profile.CreatedAt)}
          editable={false}
        />
      </View>

      {/* Name */}
      <View style={styles.formGroup}>
        <ThemedText>Name</ThemedText>
        <TextInput
          style={styles.input}
          value={profile.Name}
          onChangeText={(text) => handleInputChange("Name", text)}
        />
      </View>

      {/* Email */}
      <View style={styles.formGroup}>
        <ThemedText>Email</ThemedText>
        <TextInput
          style={styles.input}
          value={profile.Email}
          onChangeText={(text) => handleInputChange("Email", text)}
          keyboardType="email-address"
          autoCapitalize="none"
        />
      </View>

      {/* Gender */}
      <View style={styles.formGroup}>
        <ThemedText>Gender</ThemedText>
        <TextInput
          style={styles.input}
          value={profile.Gender}
          onChangeText={(text) => handleInputChange("Gender", text)}
        />
      </View>

      {/* Age */}
      <View style={styles.formGroup}>
        <ThemedText>Age</ThemedText>
        <TextInput
          style={styles.input}
          value={profile.Age}
          onChangeText={(text) =>
            handleInputChange("Age", text.replace(/[^0-9]/g, ""))
          }
          keyboardType="numeric"
        />
      </View>

      {/* Medical History */}
      <View style={styles.formGroup}>
        <ThemedText>Medical History</ThemedText>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={profile.Medical_History}
          onChangeText={(text) => handleInputChange("Medical_History", text)}
          multiline
        />
      </View>

      <View style={styles.buttonContainer}>
        <Button
          title={saving ? "Saving..." : "Save Profile"}
          onPress={handleSave}
          disabled={saving}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: "#fff",
  },
  center: {
    justifyContent: "center",
    alignItems: "center",
  },
  formGroup: {
    marginBottom: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
    fontSize: 16,
    color: "#333",
  },
  readOnlyInput: {
    backgroundColor: "#f0f0f0",
    color: "#888",
  },
  textArea: {
    height: 80,
    textAlignVertical: "top",
  },
  buttonContainer: {
    marginTop: 20,
    marginBottom: 40,
  },
});
