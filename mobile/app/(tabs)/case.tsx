/*
Create a cases tab, to display the user's refferal cases from the database.

api /user/{user_id}/referrals
- The api accepts 'user_id', for now the user id will be hardcoded as "BdLcWMFmHjiPghRE7EZW". Make the userID the mock data through an abstraction layer, so when the backend is ready, we just swap the data source without changing the UI.
- The api outputs an array with the referral information below: 
    [
        {
            "triageData": [
            {
                "absent": [
                "blisters",
                "fever",
                "trouble_breathing",
                "trouble_swallowing",
                "stiff_neck",
                "sudden_onset",
                "tonsillar_exudate"
                ],
                "symptoms": [
                "flu_symptoms",
                "itchy_throat",
                "dry_throat",
                "sore_throat"
                ],
                "vitals": {
                "age": 30
                },
                "recommendation": "Visit a pharmacy for symptom relief. You may ask for lozenges or pain relievers (like ibuprofen or paracetamol) to help with the soreness. Since you have flu symptoms, stay hydrated and rest. A rapid antigen test can be considered to rule out other causes, but antibiotics are likely not needed.",
                "stage": "Stage 2 (Pharmacy)",
                "reasoning": "Patient has a Centor Score of -1 (Age 30, Flu present, No fever, Gradual onset, No exudate), indicating a viral cause is highly likely. However, the reported pain level is 5/10, which categorizes the severity as Stage 2. Symptomatic relief is the priority.",
                "red_flags": []
            }
            ],
            "validatedAt": "2026-02-16T17:29:21.422000+00:00",
            "userID": "BdLcWMFmHjiPghRE7EZW",
            "createdAt": "2026-02-16T16:51:46.515000+00:00",
            "validatedNotes": "Agreed with Stage 2 assessment. Patient should monitor temp daily.",
            "status": "APPROVED",
            "validatedBy": "Dr. Louis Hwa",
            "monitor_status": "ongoing",
            "id": "T2VcUuasTxumalxpLSJ1"
        },
        {
            "triageData": [
            {
                "absent": [
                "neck_stiffness",
                "trouble_swallowing",
                "swollen_nodes",
                "tonsillar_exudate",
                "fever",
                "trouble_breathing"
                ],
                "symptoms": [
                "runny_nose",
                "itchy_throat",
                "sore_throat",
                "dry_throat"
                ],
                "vitals": {
                "age": 21
                },
                "recommendation": "I recommend visiting a pharmacy for symptom relief. You can ask for lozenges or pain relievers (like paracetamol or ibuprofen) to help with the throat pain, and perhaps a decongestant for your runny nose. It is also a good idea to take a rapid antigen test to rule out COVID-19. If symptoms persist beyond a few more days or get worse, please see a doctor.",
                "stage": "Stage 2 (Pharmacy)",
                "reasoning": "Your Modified Centor Score is low (-1), indicating a low probability of a bacterial infection (like strep throat). It is most likely viral given the runny nose and gradual onset. However, your reported pain level (4/10) places you in **Stage 2 (Pharmacy)** severity according to our protocol, meaning you may require over-the-counter medication to manage the discomfort while your body recovers.",
                "red_flags": []
            }
            ],
            "validatedAt": "2026-02-16T18:15:23.780000+00:00",
            "userID": "BdLcWMFmHjiPghRE7EZW",
            "createdAt": "2026-02-16T18:09:17.459000+00:00",
            "validatedNotes": "Accurate",
            "status": "APPROVED",
            "validatedBy": "Dr Ong",
            "monitor_status": "ongoing",
            "id": "p5jmDKI3QTv2Ify6sZe3"
        }
    ]

    - Create a frontend design that displays user's referral document and show the status, and able to click "View Details" to see the notes. 
    - Sort by the latest to oldest, top down arrangement.
*/

import React, { useEffect, useState } from "react";
import {
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  View,
} from "react-native";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";

// --- 1. DATA LAYER (Service Abstraction) ---
// We keep the User ID mocked as requested
const MOCK_USER_ID = "BdLcWMFmHjiPghRE7EZW";

// The fixed ngrok URL
const API_BASE_URL = "https://adultly-peckiest-kourtney.ngrok-free.dev";

const fetchReferrals = async (userId: string) => {
  try {
    const response = await fetch(`${API_BASE_URL}/user/${userId}/referrals`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        // This header is often required to bypass the ngrok free-tier warning page
        "ngrok-skip-browser-warning": "true",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error("API Connection Error:", error);
    // Return empty array so the UI doesn't crash, just shows nothing
    return [];
  }
};

// --- 2. UI COMPONENTS ---

const StatusBadge = ({ status }: { status: string }) => {
  const getStatusColor = () => {
    switch (status) {
      case "APPROVED":
        return "#4CAF50"; // Green
      case "PENDING":
        return "#FF9800"; // Orange
      case "REJECTED":
        return "#F44336"; // Red
      default:
        return "#808080";
    }
  };

  return (
    <View style={[styles.badge, { backgroundColor: getStatusColor() }]}>
      <ThemedText style={styles.badgeText}>{status}</ThemedText>
    </View>
  );
};

const ReferralCard = ({ item }: { item: any }) => {
  const [expanded, setExpanded] = useState(false);
  const triage = item.triageData[0] || {};
  const date = new Date(item.createdAt).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <View style={styles.cardContainer}>
      {/* Card Header */}
      <View style={styles.cardHeader}>
        <View>
          <ThemedText type="defaultSemiBold" style={{ fontSize: 16 }}>
            {triage.stage || "Triage Case"}
          </ThemedText>
          <ThemedText style={styles.dateText}>{date}</ThemedText>
        </View>
        <StatusBadge status={item.status} />
      </View>

      {/* Basic Summary */}
      <View style={styles.summarySection}>
        <ThemedText
          numberOfLines={expanded ? undefined : 2}
          style={styles.summaryText}
        >
          {triage.reasoning}
        </ThemedText>
      </View>

      {/* Expanded Details */}
      {expanded && (
        <View style={styles.detailsContainer}>
          <View style={styles.divider} />

          <ThemedText type="defaultSemiBold" style={styles.sectionTitle}>
            Doctor&apos;s Notes ({item.validatedBy})
          </ThemedText>
          <ThemedText style={styles.detailText}>
            {item.validatedNotes}
          </ThemedText>

          <ThemedText type="defaultSemiBold" style={styles.sectionTitle}>
            Recommendation
          </ThemedText>
          <ThemedText style={styles.detailText}>
            {triage.recommendation}
          </ThemedText>

          <ThemedText type="defaultSemiBold" style={styles.sectionTitle}>
            Symptoms Reported
          </ThemedText>
          <View style={styles.tagContainer}>
            {triage.symptoms?.map((sym: string, idx: number) => (
              <View key={idx} style={styles.symptomTag}>
                <ThemedText style={styles.symptomText}>
                  {sym.replace("_", " ")}
                </ThemedText>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Toggle Button */}
      <TouchableOpacity
        style={styles.actionButton}
        onPress={() => setExpanded(!expanded)}
      >
        <ThemedText style={styles.actionButtonText}>
          {expanded ? "Hide Details" : "View Details"}
        </ThemedText>
      </TouchableOpacity>
    </View>
  );
};

// --- 3. MAIN SCREEN ---

export default function ReferralScreen() {
  const [referrals, setReferrals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadReferrals();
  }, []);

  const loadReferrals = async () => {
    setLoading(true);
    try {
      const data: any = await fetchReferrals(MOCK_USER_ID);
      // Sort: Latest createdAt first
      const sortedData = data.sort(
        (a: any, b: any) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
      setReferrals(sortedData);
    } catch (error) {
      console.error("Failed to fetch referrals", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <ThemedText type="title">My Referrals</ThemedText>
        <ThemedText style={styles.subHeader}>
          History of your triage cases
        </ThemedText>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#0a7ea4" />
        </View>
      ) : (
        <FlatList
          data={referrals}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <ReferralCard item={item} />}
          contentContainerStyle={styles.listContent}
          refreshing={loading}
          onRefresh={loadReferrals}
        />
      )}
    </ThemedView>
  );
}

// --- 4. STYLES ---

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 60, // Adjust for status bar
    paddingBottom: 20,
  },
  subHeader: {
    opacity: 0.6,
    marginTop: 4,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  // Card Styles
  cardContainer: {
    backgroundColor: "rgba(150, 150, 150, 0.1)", // Subtle background for contrast
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(150, 150, 150, 0.2)",
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  dateText: {
    fontSize: 12,
    opacity: 0.6,
    marginTop: 4,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "bold",
  },
  summarySection: {
    marginBottom: 12,
  },
  summaryText: {
    fontSize: 14,
    lineHeight: 20,
    opacity: 0.8,
  },
  // Expanded Details
  detailsContainer: {
    marginTop: 8,
  },
  divider: {
    height: 1,
    backgroundColor: "rgba(150, 150, 150, 0.2)",
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 14,
    marginBottom: 4,
    marginTop: 8,
    color: "#0a7ea4",
  },
  detailText: {
    fontSize: 14,
    lineHeight: 20,
    opacity: 0.9,
    marginBottom: 8,
  },
  tagContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
    marginBottom: 8,
  },
  symptomTag: {
    backgroundColor: "rgba(10, 126, 164, 0.15)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  symptomText: {
    fontSize: 12,
    color: "#0a7ea4",
    textTransform: "capitalize",
  },
  // Action Button
  actionButton: {
    marginTop: 8,
    alignSelf: "flex-start",
  },
  actionButtonText: {
    color: "#0a7ea4", // Primary Color
    fontWeight: "600",
    fontSize: 14,
  },
});
