/*
  Profile page with Digital Medical History document upload + AI parsing.
  Uses centralized apiClient + mappers for DB abstraction.
  UI themed to match the Location tab (cards, shadows, #0a7ea4 accent).
*/

import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Platform,
  RefreshControl,
  KeyboardAvoidingView,
  Modal,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { ThemedText } from "@/components/themed-text";

// Centralized services
import { getProfile, updateProfile, uploadMedicalHistory } from "@/services/apiClient";
import {
  mapProfile,
  profileToPayload,
  Profile,
  MedicalHistory,
} from "@/services/mappers";

const MOCK_USER_ID = "BdLcWMFmHjiPghRE7EZW";

const BLOOD_TYPES = ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"];

// ========================
// TAG INPUT COMPONENT
// ========================
const TagInput = ({
  label,
  icon,
  iconColor,
  tagColor,
  tags,
  onAdd,
  onRemove,
  placeholder,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  tagColor: string;
  tags: string[];
  onAdd: (tag: string) => void;
  onRemove: (index: number) => void;
  placeholder: string;
}) => {
  const [inputValue, setInputValue] = useState("");

  const handleAdd = () => {
    const trimmed = inputValue.trim();
    if (trimmed && !tags.includes(trimmed)) {
      onAdd(trimmed);
      setInputValue("");
    }
  };

  return (
    <View style={styles.sectionCard}>
      <View style={styles.sectionHeader}>
        <Ionicons name={icon} size={20} color={iconColor} />
        <ThemedText style={styles.sectionTitle}>{label}</ThemedText>
      </View>

      {tags.length > 0 && (
        <View style={styles.tagContainer}>
          {tags.map((tag, idx) => (
            <View
              key={idx}
              style={[styles.tag, { backgroundColor: tagColor + "20" }]}
            >
              <ThemedText style={[styles.tagText, { color: tagColor }]}>
                {tag}
              </ThemedText>
              <TouchableOpacity
                onPress={() => onRemove(idx)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close-circle" size={18} color={tagColor} />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      <View style={styles.addRow}>
        <TextInput
          style={styles.addInput}
          value={inputValue}
          onChangeText={setInputValue}
          placeholder={placeholder}
          placeholderTextColor="#aaa"
          onSubmitEditing={handleAdd}
          returnKeyType="done"
        />
        <TouchableOpacity
          style={[styles.addButton, { backgroundColor: iconColor }]}
          onPress={handleAdd}
        >
          <Ionicons name="add" size={20} color="#fff" />
        </TouchableOpacity>
      </View>
    </View>
  );
};

// ========================
// BLOOD TYPE PICKER
// ========================
const BloodTypePicker = ({
  selected,
  onSelect,
}: {
  selected: string;
  onSelect: (type: string) => void;
}) => (
  <View style={styles.sectionCard}>
    <View style={styles.sectionHeader}>
      <Ionicons name="water" size={20} color="#E53935" />
      <ThemedText style={styles.sectionTitle}>Blood Type</ThemedText>
    </View>
    <View style={styles.bloodTypeGrid}>
      {BLOOD_TYPES.map((type) => (
        <TouchableOpacity
          key={type}
          style={[
            styles.bloodTypeChip,
            selected === type && styles.bloodTypeChipActive,
          ]}
          onPress={() => onSelect(type)}
        >
          <ThemedText
            style={[
              styles.bloodTypeText,
              selected === type && styles.bloodTypeTextActive,
            ]}
          >
            {type}
          </ThemedText>
        </TouchableOpacity>
      ))}
    </View>
  </View>
);

// ========================
// MAIN PROFILE SCREEN
// ========================
export default function ProfileScreen() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");

  const fetchProfileData = useCallback(async () => {
    try {
      const raw = await getProfile(MOCK_USER_ID);
      if (raw.error) throw new Error(raw.error);
      setProfile(mapProfile(raw));
      setHasChanges(false);
    } catch (error) {
      Alert.alert("Error", "Could not load profile data.");
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfileData();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchProfileData();
    setRefreshing(false);
  };

  const handleFieldChange = (field: keyof Profile, value: string) => {
    if (!profile) return;
    setProfile({ ...profile, [field]: value });
    setHasChanges(true);
  };

  const handleMedHistoryChange = (field: keyof MedicalHistory, value: any) => {
    if (!profile) return;
    setProfile({
      ...profile,
      Medical_History: { ...profile.Medical_History, [field]: value },
    });
    setHasChanges(true);
  };

  const handleAddTag = (field: keyof MedicalHistory, tag: string) => {
    if (!profile) return;
    const current = profile.Medical_History[field];
    if (Array.isArray(current)) {
      handleMedHistoryChange(field, [...current, tag]);
    }
  };

  const handleRemoveTag = (field: keyof MedicalHistory, index: number) => {
    if (!profile) return;
    const current = profile.Medical_History[field];
    if (Array.isArray(current)) {
      handleMedHistoryChange(
        field,
        current.filter((_: string, i: number) => i !== index)
      );
    }
  };

  // ========================
  // DOCUMENT UPLOAD
  // ========================
  const handleDocumentUpload = async () => {
    // Step 1: Pick a file
    const result = await DocumentPicker.getDocumentAsync({
      type: ["application/pdf", "image/*"],
      copyToCacheDirectory: true,
    });

    if (result.canceled || !result.assets || result.assets.length === 0) return;

    const file = result.assets[0];

    // Step 2: Confirmation popup
    Alert.alert(
      "Upload Medical History",
      "Please ensure this is your latest medical history document.\n\nThis will replace any existing record and AI will automatically extract your medical information.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Upload",
          style: "default",
          onPress: () => performUpload(file),
        },
      ]
    );
  };

  const performUpload = async (file: DocumentPicker.DocumentPickerAsset) => {
    setUploading(true);
    setUploadStatus("Uploading document...");

    try {
      setUploadStatus("AI is reading your document...");

      const response = await uploadMedicalHistory(
        MOCK_USER_ID,
        file.uri,
        file.name || "document",
        file.mimeType || "application/octet-stream"
      );

      if (response.status === "success" && response.extracted) {
        // Auto-update the profile fields with extracted data
        const extracted = response.extracted;
        if (profile) {
          setProfile({
            ...profile,
            Medical_History: {
              ...profile.Medical_History,
              blood_type: extracted.blood_type || profile.Medical_History.blood_type,
              allergies: extracted.allergies?.length > 0 ? extracted.allergies : profile.Medical_History.allergies,
              chronic_conditions: extracted.chronic_conditions?.length > 0 ? extracted.chronic_conditions : profile.Medical_History.chronic_conditions,
              current_medications: extracted.current_medications?.length > 0 ? extracted.current_medications : profile.Medical_History.current_medications,
              past_surgeries: extracted.past_surgeries?.length > 0 ? extracted.past_surgeries : profile.Medical_History.past_surgeries,
              family_history: extracted.family_history?.length > 0 ? extracted.family_history : profile.Medical_History.family_history,
              document_filename: extracted.document_filename || file.name || "",
              document_uploaded_at: extracted.document_uploaded_at || new Date().toISOString(),
            },
          });
        }

        Alert.alert(
          "✅ Document Processed",
          "Your medical history has been uploaded and parsed successfully. Please review the extracted information below.",
          [{ text: "OK" }]
        );
      } else {
        Alert.alert("Upload Complete", "Document saved but could not be fully parsed. You can fill in the fields manually.");
      }
    } catch (error) {
      console.error("Upload error:", error);
      Alert.alert("Error", "Failed to upload document. Please try again.");
    } finally {
      setUploading(false);
      setUploadStatus("");
    }
  };

  const handleSave = async () => {
    if (!profile) return;
    setSaving(true);
    try {
      const payload = profileToPayload(profile);
      await updateProfile(MOCK_USER_ID, payload);
      Alert.alert("Success", "Profile updated successfully!");
      setHasChanges(false);
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
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0a7ea4" />
          <ThemedText style={styles.loadingText}>Loading profile...</ThemedText>
        </View>
      </SafeAreaView>
    );
  }

  if (!profile) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingContainer}>
          <Ionicons name="person-outline" size={60} color="#ccc" />
          <ThemedText style={styles.loadingText}>
            Unable to load profile.
          </ThemedText>
        </View>
      </SafeAreaView>
    );
  }

  const med = profile.Medical_History;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      {/* Header */}
      <View style={styles.headerBar}>
        <ThemedText style={styles.headerTitle}>My Profile</ThemedText>
        <TouchableOpacity
          onPress={onRefresh}
          style={styles.refreshButton}
          disabled={loading || uploading || saving}
        >
          <Ionicons
            name="reload-outline"
            size={24}
            color={loading || uploading || saving ? "#ccc" : "#0a7ea4"}
          />
        </TouchableOpacity>
      </View>

      {/* Upload overlay modal */}
      <Modal visible={uploading} transparent animationType="fade">
        <View style={styles.uploadOverlay}>
          <View style={styles.uploadModal}>
            <ActivityIndicator size="large" color="#0a7ea4" />
            <ThemedText style={styles.uploadStatusText}>{uploadStatus}</ThemedText>
            <ThemedText style={styles.uploadSubText}>
              This may take a moment...
            </ThemedText>
          </View>
        </View>
      </Modal>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={["#0a7ea4"]}
              tintColor="#0a7ea4"
            />
          }
        >
          {/* ===== PERSONAL INFO CARD ===== */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <Ionicons name="person-circle-outline" size={20} color="#0a7ea4" />
              <ThemedText style={styles.sectionTitle}>
                Personal Information
              </ThemedText>
            </View>

            <View style={styles.fieldGroup}>
              <ThemedText style={styles.fieldLabel}>Account Created</ThemedText>
              <View style={[styles.inputBox, styles.readOnly]}>
                <ThemedText style={styles.readOnlyText}>
                  {formatDate(profile.CreatedAt)}
                </ThemedText>
              </View>
            </View>

            <View style={styles.fieldGroup}>
              <ThemedText style={styles.fieldLabel}>Full Name</ThemedText>
              <TextInput
                style={styles.inputBox}
                value={profile.Name}
                onChangeText={(t) => handleFieldChange("Name", t)}
                placeholderTextColor="#aaa"
              />
            </View>

            <View style={styles.fieldGroup}>
              <ThemedText style={styles.fieldLabel}>Email</ThemedText>
              <TextInput
                style={styles.inputBox}
                value={profile.Email}
                onChangeText={(t) => handleFieldChange("Email", t)}
                keyboardType="email-address"
                autoCapitalize="none"
                placeholderTextColor="#aaa"
              />
            </View>

            <View style={styles.row}>
              <View style={[styles.fieldGroup, { flex: 1, marginRight: 10 }]}>
                <ThemedText style={styles.fieldLabel}>Gender</ThemedText>
                <TextInput
                  style={styles.inputBox}
                  value={profile.Gender}
                  onChangeText={(t) => handleFieldChange("Gender", t)}
                  placeholderTextColor="#aaa"
                />
              </View>
              <View style={[styles.fieldGroup, { width: 80 }]}>
                <ThemedText style={styles.fieldLabel}>Age</ThemedText>
                <TextInput
                  style={styles.inputBox}
                  value={profile.Age}
                  onChangeText={(t) =>
                    handleFieldChange("Age", t.replace(/[^0-9]/g, ""))
                  }
                  keyboardType="numeric"
                  placeholderTextColor="#aaa"
                />
              </View>
            </View>
          </View>

          {/* ===== DIGITAL MEDICAL HISTORY HEADER ===== */}
          <View style={styles.medHistoryHeader}>
            <Ionicons name="document-text" size={22} color="#0a7ea4" />
            <ThemedText style={styles.medHistoryTitle}>
              Digital Medical History
            </ThemedText>
          </View>

          {/* ===== UPLOAD DOCUMENT CARD ===== */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <Ionicons name="cloud-upload" size={20} color="#0a7ea4" />
              <ThemedText style={styles.sectionTitle}>
                Upload Medical Document
              </ThemedText>
            </View>

            <ThemedText style={styles.uploadDescription}>
              Upload your government-issued digital medical history (PDF or image).
              AI will automatically extract your medical information.
            </ThemedText>

            {med.document_filename ? (
              <View style={styles.documentInfo}>
                <View style={styles.documentIconRow}>
                  <View style={styles.documentIcon}>
                    <Ionicons name="document-attach" size={24} color="#0a7ea4" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <ThemedText style={styles.documentName} numberOfLines={1}>
                      {med.document_filename}
                    </ThemedText>
                    <ThemedText style={styles.documentDate}>
                      Uploaded: {formatDate(med.document_uploaded_at)}
                    </ThemedText>
                  </View>
                  <View style={styles.verifiedBadge}>
                    <Ionicons name="checkmark-circle" size={16} color="#4CAF50" />
                    <ThemedText style={styles.verifiedText}>Parsed</ThemedText>
                  </View>
                </View>
              </View>
            ) : null}

            <TouchableOpacity
              style={styles.uploadButton}
              onPress={handleDocumentUpload}
              disabled={uploading}
            >
              <Ionicons
                name={med.document_filename ? "refresh" : "cloud-upload-outline"}
                size={20}
                color="#fff"
              />
              <ThemedText style={styles.uploadButtonText}>
                {med.document_filename ? "Replace Document" : "Upload Document"}
              </ThemedText>
            </TouchableOpacity>
          </View>

          {/* Blood Type */}
          <BloodTypePicker
            selected={med.blood_type}
            onSelect={(type) => handleMedHistoryChange("blood_type", type)}
          />

          {/* Allergies */}
          <TagInput
            label="Allergies"
            icon="alert-circle"
            iconColor="#E53935"
            tagColor="#E53935"
            tags={med.allergies}
            onAdd={(tag) => handleAddTag("allergies", tag)}
            onRemove={(idx) => handleRemoveTag("allergies", idx)}
            placeholder="e.g. Penicillin, Shellfish"
          />

          {/* Chronic Conditions */}
          <TagInput
            label="Chronic Conditions"
            icon="heart"
            iconColor="#7B1FA2"
            tagColor="#7B1FA2"
            tags={med.chronic_conditions}
            onAdd={(tag) => handleAddTag("chronic_conditions", tag)}
            onRemove={(idx) => handleRemoveTag("chronic_conditions", idx)}
            placeholder="e.g. Asthma, Diabetes Type 2"
          />

          {/* Current Medications */}
          <TagInput
            label="Current Medications"
            icon="medkit"
            iconColor="#0288D1"
            tagColor="#0288D1"
            tags={med.current_medications}
            onAdd={(tag) => handleAddTag("current_medications", tag)}
            onRemove={(idx) => handleRemoveTag("current_medications", idx)}
            placeholder="e.g. Metformin 500mg"
          />

          {/* Past Surgeries */}
          <TagInput
            label="Past Surgeries"
            icon="cut"
            iconColor="#F57C00"
            tagColor="#F57C00"
            tags={med.past_surgeries}
            onAdd={(tag) => handleAddTag("past_surgeries", tag)}
            onRemove={(idx) => handleRemoveTag("past_surgeries", idx)}
            placeholder="e.g. Appendectomy (2022)"
          />

          {/* Family History */}
          <TagInput
            label="Family Medical History"
            icon="people"
            iconColor="#388E3C"
            tagColor="#388E3C"
            tags={med.family_history}
            onAdd={(tag) => handleAddTag("family_history", tag)}
            onRemove={(idx) => handleRemoveTag("family_history", idx)}
            placeholder="e.g. Heart disease (Father)"
          />

          {/* Emergency Contact */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <Ionicons name="call" size={20} color="#D32F2F" />
              <ThemedText style={styles.sectionTitle}>
                Emergency Contact
              </ThemedText>
            </View>

            <View style={styles.fieldGroup}>
              <ThemedText style={styles.fieldLabel}>Contact Name</ThemedText>
              <TextInput
                style={styles.inputBox}
                value={med.emergency_contact_name}
                onChangeText={(t) =>
                  handleMedHistoryChange("emergency_contact_name", t)
                }
                placeholder="Full name"
                placeholderTextColor="#aaa"
              />
            </View>

            <View style={styles.fieldGroup}>
              <ThemedText style={styles.fieldLabel}>
                Phone Number (+60)
              </ThemedText>
              <TextInput
                style={styles.inputBox}
                value={med.emergency_contact_phone}
                onChangeText={(t) =>
                  handleMedHistoryChange("emergency_contact_phone", t)
                }
                placeholder="+60 11-1234 5678"
                placeholderTextColor="#aaa"
                keyboardType="phone-pad"
              />
            </View>
          </View>

          {/* Save Button */}
          {hasChanges && (
            <TouchableOpacity
              style={[styles.saveButton, saving && styles.saveButtonDisabled]}
              onPress={handleSave}
              disabled={saving}
            >
              <Ionicons
                name={saving ? "hourglass-outline" : "save-outline"}
                size={20}
                color="#fff"
              />
              <ThemedText style={styles.saveButtonText}>
                {saving ? "Saving..." : "Save Changes"}
              </ThemedText>
            </TouchableOpacity>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ========================
// STYLES — matching Location page theme
// ========================
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f8f9fa",
  },
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
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 3,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#333",
  },
  refreshButton: {
    position: "absolute",
    right: 15,
    top: Platform.OS === "android" ? (StatusBar.currentHeight || 0) + 15 : 15,
    padding: 8,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 15,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 30,
  },
  loadingText: {
    marginTop: 15,
    fontSize: 16,
    color: "#666",
  },

  // --- Sections ---
  sectionCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 15,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#333",
  },

  // --- Medical History header ---
  medHistoryHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 4,
    marginTop: 10,
    marginBottom: 15,
  },
  medHistoryTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#333",
  },

  // --- Upload Section ---
  uploadDescription: {
    fontSize: 14,
    color: "#666",
    lineHeight: 20,
    marginBottom: 14,
  },
  documentInfo: {
    backgroundColor: "#f0f8ff",
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#d0e8f5",
  },
  documentIconRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  documentIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#0a7ea4" + "15",
    justifyContent: "center",
    alignItems: "center",
  },
  documentName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
  },
  documentDate: {
    fontSize: 12,
    color: "#888",
    marginTop: 2,
  },
  verifiedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#E8F5E9",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  verifiedText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#4CAF50",
  },
  uploadButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0a7ea4",
    paddingVertical: 12,
    borderRadius: 10,
    gap: 8,
  },
  uploadButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },

  // --- Upload Overlay ---
  uploadOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  uploadModal: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 30,
    alignItems: "center",
    width: "80%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 10,
  },
  uploadStatusText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginTop: 16,
    textAlign: "center",
  },
  uploadSubText: {
    fontSize: 13,
    color: "#888",
    marginTop: 6,
  },

  // --- Fields ---
  fieldGroup: {
    marginBottom: 12,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#666",
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  inputBox: {
    borderWidth: 1,
    borderColor: "#e0e0e0",
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    color: "#333",
    backgroundColor: "#fafafa",
  },
  readOnly: {
    backgroundColor: "#f0f0f0",
    borderColor: "#eee",
  },
  readOnlyText: {
    fontSize: 16,
    color: "#888",
  },
  row: {
    flexDirection: "row",
  },

  // --- Tags ---
  tagContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },
  tag: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  tagText: {
    fontSize: 14,
    fontWeight: "600",
  },

  // --- Add row ---
  addRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  addInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#e0e0e0",
    borderRadius: 10,
    padding: 10,
    fontSize: 15,
    color: "#333",
    backgroundColor: "#fafafa",
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },

  // --- Blood Type ---
  bloodTypeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  bloodTypeChip: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "#f5f5f5",
    borderWidth: 2,
    borderColor: "#eee",
  },
  bloodTypeChipActive: {
    backgroundColor: "#FFEBEE",
    borderColor: "#E53935",
  },
  bloodTypeText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#666",
  },
  bloodTypeTextActive: {
    color: "#E53935",
  },

  // --- Save Button ---
  saveButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0a7ea4",
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
    marginTop: 5,
    shadowColor: "#0a7ea4",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
});
