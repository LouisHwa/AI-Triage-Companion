import React, { useEffect, useState } from "react";
import {
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  View,
  SafeAreaView,
  StatusBar,
  Platform,
  RefreshControl,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ThemedText } from "@/components/themed-text";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

// ⚠️ CHANGE TO YOUR API URL only
const API_BASE_URL = "http://192.168.0.160:8000";
// const API_BASE_URL = "https://adultly-peckiest-kourtney.ngrok-free.dev";

// ⚠️ CHANGE THIS WHEN BACKEND AUTH IS READY
const MOCK_USER_ID = "BdLcWMFmHjiPghRE7EZW";

// --- TYPE DEFINITIONS ---
interface TriageData {
  absent: string[];
  symptoms: string[];
  vitals: {
    age: number;
  };
  recommendation: string;
  stage: string;
  reasoning: string;
  red_flags: string[];
}

interface Referral {
  id: string;
  triageData: TriageData[];
  validatedAt: string;
  userID: string;
  createdAt: string;
  validatedNotes: string;
  status: "APPROVED" | "PENDING" | "REJECTED";
  validatedBy: string;
  monitor_status: string;
  last_check_in?: string;
}

type RootStackParamList = {
  Chat: { mode: string; referralId: string };
  [key: string]: any;
};

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

// --- DATA SERVICE LAYER (ABSTRACTION) ---
class ReferralService {
  private static baseUrl = API_BASE_URL;
  private static userId = MOCK_USER_ID;

  // Easy to swap data source later - just change this method
  static async fetchReferrals(): Promise<Referral[]> {
    try {
      const response = await fetch(
        `${this.baseUrl}/user/${this.userId}/referrals`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "ngrok-skip-browser-warning": "true", // For ngrok
          },
        },
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error("ReferralService error:", error);
      throw error;
    }
  }

  // Helper to update base URL (when switching between local/ngrok)
  static setBaseUrl(url: string) {
    this.baseUrl = url;
  }

  // Helper to update user ID (when auth is implemented)
  static setUserId(userId: string) {
    this.userId = userId;
  }
}

// --- UI COMPONENTS ---

const StatusBadge = ({ status }: { status: string }) => {
  const getStatusStyle = () => {
    switch (status) {
      case "APPROVED":
        return { bg: "#4CAF50", icon: "checkmark-circle" as const };
      case "PENDING":
        return { bg: "#FF9800", icon: "time-outline" as const };
      case "REJECTED":
        return { bg: "#F44336", icon: "close-circle" as const };
      default:
        return { bg: "#808080", icon: "help-circle" as const };
    }
  };

  const style = getStatusStyle();

  return (
    <View style={[styles.statusBadge, { backgroundColor: style.bg }]}>
      <Ionicons name={style.icon} size={14} color="#fff" />
      <ThemedText style={styles.statusText}>{status}</ThemedText>
    </View>
  );
};

const MonitorStatusIndicator = ({ status }: { status: string }) => {
  const getColor = () => {
    switch (status.toLowerCase()) {
      case "ongoing":
        return "#2196F3";
      case "completed":
        return "#4CAF50";
      case "worsened":
        return "#FF5722";
      default:
        return "#9E9E9E";
    }
  };

  return (
    <View style={styles.monitorStatusRow}>
      <View style={[styles.monitorDot, { backgroundColor: getColor() }]} />
      <ThemedText style={styles.monitorText}>
        {status.replace("_", " ").toUpperCase()}
      </ThemedText>
    </View>
  );
};

const ReferralCard = ({ item }: { item: Referral }) => {
  const [expanded, setExpanded] = useState(false);
  const triage = item.triageData[0] || {};

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getStageColor = (stage: string): string => {
    if (stage.includes("Stage 1")) return "#4CAF50";
    if (stage.includes("Stage 2")) return "#FF9800";
    if (stage.includes("Stage 3")) return "#F44336";
    if (stage.includes("Stage 4")) return "#9C27B0";
    return "#0a7ea4";
  };

  const monitorStatus = item.monitor_status;
  const navigation = useNavigation<NavigationProp>();
  return (
    <View style={styles.cardContainer}>
      {/* Card Header */}
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderLeft}>
          <View
            style={[
              styles.stageIndicator,
              { backgroundColor: getStageColor(triage.stage) },
            ]}
          >
            <Ionicons name="medical" size={20} color="#fff" />
          </View>
          <View style={styles.cardHeaderInfo}>
            <ThemedText style={styles.stageTitle}>
              {triage.stage || "Triage Case"}
            </ThemedText>
            <View style={styles.dateRow}>
              <Ionicons name="calendar-outline" size={12} color="#666" />
              <ThemedText style={styles.dateText}>
                {formatDate(item.createdAt)}
              </ThemedText>
            </View>
          </View>
        </View>
        <StatusBadge status={item.status} />
      </View>

      {/* Monitor Status */}
      <MonitorStatusIndicator status={item.monitor_status} />

      {/* Quick Summary */}
      <View style={styles.summarySection}>
        <ThemedText
          numberOfLines={expanded ? undefined : 2}
          style={styles.summaryText}
        >
          {triage.reasoning}
        </ThemedText>
      </View>

      {/* NEW FOOTER SECTION FOR MONITORING STATUS*/}
      <View style={styles.footerContainer}>
        {/* Only show Follow Up if NOT recovered */}
        {monitorStatus !== "RECOVERED" && (
          <TouchableOpacity
            style={styles.followUpButton}
            onPress={() => {
              // Navigate to Chat with context parameters
              navigation.navigate("index", {
                mode: "follow_up",
                referralId: item.id,
              });
            }}
          >
            <ThemedText style={styles.followUpText}>Follow Up →</ThemedText>
          </TouchableOpacity>
        )}
      </View>

      {/* Expanded Details */}
      {expanded && (
        <View style={styles.expandedContent}>
          <View style={styles.divider} />

          {/* Validated By Section */}
          <View style={styles.validatedSection}>
            <View style={styles.doctorHeader}>
              <Ionicons
                name="person-circle-outline"
                size={24}
                color="#0a7ea4"
              />
              <View style={styles.doctorInfo}>
                <ThemedText style={styles.doctorLabel}>Validated By</ThemedText>
                <ThemedText style={styles.doctorName}>
                  {item.validatedBy}
                </ThemedText>
              </View>
            </View>
            <View style={styles.dateRow}>
              <Ionicons name="time-outline" size={12} color="#666" />
              <ThemedText style={styles.dateText}>
                {formatDate(item.validatedAt)}
              </ThemedText>
            </View>
          </View>

          {/* Doctor's Notes */}
          <View style={styles.detailSection}>
            <View style={styles.sectionHeader}>
              <Ionicons
                name="document-text-outline"
                size={18}
                color="#0a7ea4"
              />
              <ThemedText style={styles.sectionTitle}>
                Doctor&apos;s Notes
              </ThemedText>
            </View>
            <ThemedText style={styles.detailText}>
              {item.validatedNotes}
            </ThemedText>
          </View>

          {/* Recommendation */}
          <View style={styles.detailSection}>
            <View style={styles.sectionHeader}>
              <Ionicons
                name="checkmark-done-outline"
                size={18}
                color="#4CAF50"
              />
              <ThemedText style={styles.sectionTitle}>
                Recommendation
              </ThemedText>
            </View>
            <ThemedText style={styles.detailText}>
              {triage.recommendation}
            </ThemedText>
          </View>

          {/* Symptoms */}
          {triage.symptoms && triage.symptoms.length > 0 && (
            <View style={styles.detailSection}>
              <View style={styles.sectionHeader}>
                <Ionicons name="fitness-outline" size={18} color="#FF9800" />
                <ThemedText style={styles.sectionTitle}>
                  Symptoms ({triage.symptoms.length})
                </ThemedText>
              </View>
              <View style={styles.tagContainer}>
                {triage.symptoms.map((symptom: string, idx: number) => (
                  <View key={idx} style={styles.symptomTag}>
                    <ThemedText style={styles.symptomText}>
                      {symptom.replace(/_/g, " ")}
                    </ThemedText>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Red Flags (if any) */}
          {triage.red_flags && triage.red_flags.length > 0 && (
            <View style={styles.detailSection}>
              <View style={styles.sectionHeader}>
                <Ionicons name="warning-outline" size={18} color="#F44336" />
                <ThemedText style={[styles.sectionTitle, { color: "#F44336" }]}>
                  Red Flags
                </ThemedText>
              </View>
              <View style={styles.tagContainer}>
                {triage.red_flags.map((flag: string, idx: number) => (
                  <View
                    key={idx}
                    style={[styles.symptomTag, styles.redFlagTag]}
                  >
                    <ThemedText style={styles.redFlagText}>
                      {flag.replace(/_/g, " ")}
                    </ThemedText>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Last Check-in (if available) */}
          {item.last_check_in && (
            <View style={styles.checkInSection}>
              <Ionicons name="pulse-outline" size={16} color="#666" />
              <ThemedText style={styles.checkInText}>
                Last check-in: {formatDate(item.last_check_in)}
              </ThemedText>
            </View>
          )}
        </View>
      )}

      {/* Toggle Button */}
      <TouchableOpacity
        style={styles.toggleButton}
        onPress={() => setExpanded(!expanded)}
        activeOpacity={0.7}
      >
        <ThemedText style={styles.toggleButtonText}>
          {expanded ? "Hide Details" : "View Details"}
        </ThemedText>
        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={18}
          color="#0a7ea4"
        />
      </TouchableOpacity>
    </View>
  );
};

// --- MAIN SCREEN ---
export default function CasesScreen() {
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadReferrals();
  }, []);

  const loadReferrals = async () => {
    setLoading(true);
    try {
      const data = await ReferralService.fetchReferrals();
      // Sort: Latest createdAt first
      const sortedData = [...data].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
      setReferrals(sortedData);
    } catch (error) {
      console.error("Failed to fetch referrals:", error);
      Alert.alert(
        "Connection Error",
        "Could not load your referrals. Please check your connection and try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadReferrals();
    setRefreshing(false);
  };

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="folder-open-outline" size={80} color="#ccc" />
      <ThemedText style={styles.emptyTitle}>No Referrals Yet</ThemedText>
      <ThemedText style={styles.emptySubtext}>
        Your triage cases will appear here once you complete an assessment
      </ThemedText>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      {/* Header */}
      <View style={styles.headerBar}>
        <View>
          <ThemedText style={styles.headerTitle}>My Referrals</ThemedText>
          <ThemedText style={styles.headerSubtitle}>
            {referrals.length} {referrals.length === 1 ? "case" : "cases"}
          </ThemedText>
        </View>
        <TouchableOpacity
          onPress={onRefresh}
          style={styles.refreshButton}
          disabled={loading || refreshing}
        >
          <Ionicons
            name="reload-outline"
            size={24}
            color={loading || refreshing ? "#ccc" : "#0a7ea4"}
          />
        </TouchableOpacity>
      </View>

      {/* Content */}
      {loading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0a7ea4" />
          <ThemedText style={styles.loadingText}>
            Loading your cases...
          </ThemedText>
        </View>
      ) : (
        <FlatList
          data={referrals}
          renderItem={({ item }: { item: Referral }) => (
            <ReferralCard item={item} />
          )}
          keyExtractor={(item: Referral) => item.id}
          contentContainerStyle={[
            styles.listContent,
            referrals.length === 0 && styles.emptyListContent,
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={["#0a7ea4"]}
              tintColor="#0a7ea4"
            />
          }
          ListEmptyComponent={renderEmptyState}
        />
      )}
    </SafeAreaView>
  );
}

// --- STYLES ---
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f8f9fa",
  },
  headerBar: {
    paddingTop:
      Platform.OS === "android" ? (StatusBar.currentHeight || 0) + 10 : 10,
    height:
      Platform.OS === "android" ? (StatusBar.currentHeight || 0) + 70 : 70,
    backgroundColor: "#fff",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 3,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#333",
  },
  headerSubtitle: {
    fontSize: 13,
    color: "#666",
    marginTop: 2,
  },
  refreshButton: {
    padding: 8,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 12,
    fontSize: 15,
    color: "#666",
  },
  listContent: {
    padding: 16,
    paddingBottom: 30,
  },
  emptyListContent: {
    flexGrow: 1,
    justifyContent: "center",
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#999",
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: "#bbb",
    textAlign: "center",
    lineHeight: 20,
  },

  // Card Styles
  cardContainer: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  cardHeaderLeft: {
    flexDirection: "row",
    flex: 1,
    marginRight: 12,
  },
  stageIndicator: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  cardHeaderInfo: {
    flex: 1,
    justifyContent: "center",
  },
  stageTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#333",
    marginBottom: 4,
  },
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  dateText: {
    fontSize: 12,
    color: "#666",
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 4,
  },
  statusText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  monitorStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    gap: 6,
  },
  monitorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  monitorText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#666",
  },
  summarySection: {
    marginBottom: 16,
  },
  summaryText: {
    fontSize: 14,
    lineHeight: 20,
    color: "#555",
  },

  //follow up button styles
  footerContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    alignSelf: "flex-end",
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#ffffff",
  },
  followUpButton: {
    backgroundColor: "#E3F2FD",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#0a7ea4",
  },
  followUpText: {
    color: "#0a7ea4",
    fontWeight: "700",
    fontSize: 12,
  },

  // Expanded Content
  expandedContent: {
    marginTop: 8,
  },
  divider: {
    height: 1,
    backgroundColor: "#f0f0f0",
    marginBottom: 16,
  },
  validatedSection: {
    backgroundColor: "#f8f9fa",
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
  },
  doctorHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    gap: 10,
  },
  doctorInfo: {
    flex: 1,
  },
  doctorLabel: {
    fontSize: 11,
    color: "#666",
    textTransform: "uppercase",
    fontWeight: "600",
  },
  doctorName: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0a7ea4",
    marginTop: 2,
  },
  detailSection: {
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0a7ea4",
  },
  detailText: {
    fontSize: 14,
    lineHeight: 20,
    color: "#555",
  },
  tagContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
  },
  symptomTag: {
    backgroundColor: "#E3F2FD",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  symptomText: {
    fontSize: 12,
    color: "#0a7ea4",
    fontWeight: "600",
    textTransform: "capitalize",
  },
  redFlagTag: {
    backgroundColor: "#FFEBEE",
  },
  redFlagText: {
    fontSize: 12,
    color: "#F44336",
    fontWeight: "600",
    textTransform: "capitalize",
  },
  checkInSection: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f8f9fa",
    padding: 10,
    borderRadius: 8,
    marginTop: 8,
    gap: 6,
  },
  checkInText: {
    fontSize: 12,
    color: "#666",
  },
  toggleButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 12,
    paddingVertical: 10,
    gap: 6,
  },
  toggleButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0a7ea4",
  },
});
