import React, { useState, useEffect } from "react";
import {
  StyleSheet,
  TouchableOpacity,
  FlatList,
  View,
  SafeAreaView,
  Alert,
  ActivityIndicator,
  Linking,
  StatusBar,
  Platform,
  RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";

import { ThemedText } from "@/components/themed-text";

// Centralized services
import { API_BASE_URL } from "@/services/apiClient";

interface MedicalFacility {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  rating: number;
  user_ratings_total: number;
  distance_meters: number | null;
  place_type: "Pharmacy" | "Clinic" | "Hospital";
  open_now: boolean | null;
  calculatedDistance?: number; // in km
}

type FilterType = "ALL" | "Pharmacy" | "Clinic" | "Hospital";

export default function LocationScreen() {
  const [facilities, setFacilities] = useState<MedicalFacility[]>([]);
  const [filteredFacilities, setFilteredFacilities] = useState<
    MedicalFacility[]
  >([]);
  const [userLocation, setUserLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<FilterType>("ALL");
  const [refreshing, setRefreshing] = useState(false);
  const [locationPermissionDenied, setLocationPermissionDenied] =
    useState(false);

  useEffect(() => {
    requestLocationAndFetch();
  }, []);

  useEffect(() => {
    applyFilter();
  }, [selectedFilter, facilities]);

  // Haversine formula to calculate distance between two coordinates
  const calculateDistance = (
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number => {
    const R = 6371; // Earth's radius in km
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) *
        Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const toRad = (value: number): number => {
    return (value * Math.PI) / 180;
  };

  const requestLocationAndFetch = async () => {
    setIsLoading(true);
    setLocationPermissionDenied(false);

    try {
      // Request location permission
      const { status } = await Location.requestForegroundPermissionsAsync();

      if (status !== "granted") {
        setLocationPermissionDenied(true);
        Alert.alert(
          "Location Permission Denied",
          "Please enable location access in your device settings to find nearby medical facilities.",
          [{ text: "OK" }],
        );
        setIsLoading(false);
        return;
      }

      // Get current location
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const userCoords = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };
      setUserLocation(userCoords);

      // Fetch nearby facilities
      await fetchNearbyFacilities(userCoords.latitude, userCoords.longitude);
    } catch (error) {
      console.error("Location error:", error);
      Alert.alert("Error", "Failed to get your location. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const fetchNearbyFacilities = async (latitude: number, longitude: number) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/geo/nearby`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "true", // Add this for ngrok
        },
        body: JSON.stringify({
          latitude,
          longitude,
          radius_meters: 5000,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to fetch facilities");
      }

      const data: MedicalFacility[] = await response.json();

      // Calculate distance for each facility
      const facilitiesWithDistance = data.map((facility) => ({
        ...facility,
        calculatedDistance: calculateDistance(
          latitude,
          longitude,
          facility.latitude,
          facility.longitude,
        ),
      }));

      // Sort by distance (closest first)
      facilitiesWithDistance.sort(
        (a, b) => (a.calculatedDistance || 0) - (b.calculatedDistance || 0),
      );

      setFacilities(facilitiesWithDistance);
    } catch (error) {
      console.error("Fetch error:", error);
      Alert.alert(
        "Error",
        "Failed to load nearby facilities. Please try again.",
      );
    }
  };

  const applyFilter = () => {
    if (selectedFilter === "ALL") {
      setFilteredFacilities(facilities);
    } else {
      setFilteredFacilities(
        facilities.filter(
          (f: MedicalFacility) => f.place_type === selectedFilter,
        ),
      );
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await requestLocationAndFetch();
    setRefreshing(false);
  };

  const openDirections = (facility: MedicalFacility) => {
    const url = `https://www.google.com/maps/dir/?api=1&destination_place_id=${facility.id}&destination=${encodeURIComponent(facility.name)}`;
    Linking.openURL(url).catch((err) => {
      Alert.alert(
        "Error",
        "Could not open Google Maps. Please make sure it's installed.",
      );
      console.error(err);
    });
  };

  const getStatusColor = (open_now: boolean | null): string => {
    if (open_now === null) return "#999";
    return open_now ? "#4CAF50" : "#F44336";
  };

  const getStatusText = (open_now: boolean | null): string => {
    if (open_now === null) return "Hours not available";
    return open_now ? "Open now" : "Closed";
  };

  const getTypeIcon = (type: string): keyof typeof Ionicons.glyphMap => {
    switch (type) {
      case "Pharmacy":
        return "medkit";
      case "Clinic":
        return "medical";
      case "Hospital":
        return "business";
      default:
        return "location";
    }
  };

  const getTypeColor = (type: string): string => {
    switch (type) {
      case "Pharmacy":
        return "#2196F3";
      case "Clinic":
        return "#FF9800";
      case "Hospital":
        return "#F44336";
      default:
        return "#9E9E9E";
    }
  };

  const getCategoryCount = (type: FilterType): number => {
    if (type === "ALL") return facilities.length;
    return facilities.filter((f: MedicalFacility) => f.place_type === type)
      .length;
  };

  const renderFacilityItem = ({ item }: { item: MedicalFacility }) => (
    <View style={styles.facilityCard}>
      <View style={styles.facilityHeader}>
        <View style={styles.facilityTitleRow}>
          <View
            style={[
              styles.typeIcon,
              { backgroundColor: getTypeColor(item.place_type) },
            ]}
          >
            <Ionicons
              name={getTypeIcon(item.place_type) as any}
              size={20}
              color="#fff"
            />
          </View>
          <View style={styles.facilityInfo}>
            <ThemedText style={styles.facilityName} numberOfLines={2}>
              {item.name}
            </ThemedText>
            <View style={styles.facilityMeta}>
              <View style={styles.ratingContainer}>
                <Ionicons name="star" size={14} color="#FFB300" />
                <ThemedText style={styles.ratingText}>
                  {item.rating?.toFixed(1)} ({item.user_ratings_total})
                </ThemedText>
              </View>
              <View style={styles.distanceContainer}>
                <Ionicons name="navigate" size={14} color="#666" />
                <ThemedText style={styles.distanceText}>
                  {item.calculatedDistance?.toFixed(2)} km
                </ThemedText>
              </View>
            </View>
          </View>
        </View>
        <View
          style={[
            styles.statusBadge,
            { backgroundColor: getStatusColor(item.open_now) },
          ]}
        >
          <ThemedText style={styles.statusText}>
            {getStatusText(item.open_now)}
          </ThemedText>
        </View>
      </View>

      <ThemedText style={styles.facilityAddress} numberOfLines={2}>
        {item.address}
      </ThemedText>

      <TouchableOpacity
        style={styles.directionsButton}
        onPress={() => openDirections(item)}
      >
        <Ionicons name="navigate-outline" size={20} color="#fff" />
        <ThemedText style={styles.directionsButtonText}>
          Get Directions
        </ThemedText>
      </TouchableOpacity>
    </View>
  );

  const renderFilterButton = (type: FilterType) => (
    <TouchableOpacity
      key={type}
      style={[
        styles.filterButton,
        selectedFilter === type && styles.filterButtonActive,
      ]}
      onPress={() => setSelectedFilter(type)}
    >
      <ThemedText
        style={[
          styles.filterButtonText,
          selectedFilter === type && styles.filterButtonTextActive,
        ]}
      >
        {type} ({getCategoryCount(type)})
      </ThemedText>
    </TouchableOpacity>
  );

  if (locationPermissionDenied) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.errorContainer}>
          <Ionicons name="location-outline" size={80} color="#ccc" />
          <ThemedText style={styles.errorTitle}>
            Location Access Required
          </ThemedText>
          <ThemedText style={styles.errorMessage}>
            Please enable location access in your device settings to find nearby
            medical facilities.
          </ThemedText>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={requestLocationAndFetch}
          >
            <ThemedText style={styles.retryButtonText}>Retry</ThemedText>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      <View style={styles.headerBar}>
        <ThemedText style={styles.headerTitle}>
          Nearby Medical Facilities
        </ThemedText>
        <TouchableOpacity
          onPress={onRefresh}
          style={styles.refreshButton}
          disabled={isLoading}
        >
          <Ionicons
            name="reload-outline"
            size={24}
            color={isLoading ? "#ccc" : "#0a7ea4"}
          />
        </TouchableOpacity>
      </View>

      {isLoading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0a7ea4" />
          <ThemedText style={styles.loadingText}>
            Finding nearby facilities...
          </ThemedText>
        </View>
      ) : (
        <>
          <View style={styles.filterContainer}>
            <FlatList
              horizontal
              showsHorizontalScrollIndicator={false}
              data={["ALL", "Pharmacy", "Clinic", "Hospital"] as FilterType[]}
              renderItem={({ item }: { item: FilterType }) =>
                renderFilterButton(item)
              }
              keyExtractor={(item: FilterType) => item}
              contentContainerStyle={styles.filterList}
            />
          </View>

          <FlatList
            data={filteredFacilities}
            renderItem={renderFacilityItem}
            keyExtractor={(item: MedicalFacility) => item.id}
            contentContainerStyle={styles.facilityList}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                colors={["#0a7ea4"]}
                tintColor="#0a7ea4"
              />
            }
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons name="search-outline" size={60} color="#ccc" />
                <ThemedText style={styles.emptyText}>
                  No{" "}
                  {selectedFilter === "ALL" ? "" : selectedFilter.toLowerCase()}{" "}
                  facilities found nearby
                </ThemedText>
                <ThemedText style={styles.emptySubtext}>
                  Try adjusting your filters or pull down to refresh
                </ThemedText>
              </View>
            }
          />
        </>
      )}
    </SafeAreaView>
  );
}

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
    position: "relative",
    paddingHorizontal: 15,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 3,
  },
  refreshButton: {
    position: "absolute",
    right: 15,
    top: Platform.OS === "android" ? (StatusBar.currentHeight || 0) + 15 : 15,
    padding: 6,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#333",
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
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
  },
  errorTitle: {
    fontSize: 22,
    fontWeight: "700",
    marginTop: 20,
    marginBottom: 10,
    textAlign: "center",
  },
  errorMessage: {
    fontSize: 15,
    color: "#666",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 30,
  },
  retryButton: {
    backgroundColor: "#0a7ea4",
    paddingHorizontal: 30,
    paddingVertical: 12,
    borderRadius: 25,
  },
  retryButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  filterContainer: {
    backgroundColor: "#fff",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  filterList: {
    paddingHorizontal: 15,
  },
  filterButton: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#f0f0f0",
    marginRight: 10,
  },
  filterButtonActive: {
    backgroundColor: "#0a7ea4",
  },
  filterButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#666",
  },
  filterButtonTextActive: {
    color: "#fff",
  },
  facilityList: {
    padding: 15,
    paddingBottom: 30,
  },
  facilityCard: {
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
  facilityHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  facilityTitleRow: {
    flexDirection: "row",
    flex: 1,
    marginRight: 10,
  },
  typeIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  facilityInfo: {
    flex: 1,
  },
  facilityName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#333",
    marginBottom: 6,
  },
  facilityMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 15,
  },
  ratingContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  ratingText: {
    fontSize: 13,
    color: "#666",
  },
  distanceContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  distanceText: {
    fontSize: 13,
    color: "#666",
    fontWeight: "600",
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#fff",
    textTransform: "uppercase",
  },
  facilityAddress: {
    fontSize: 13,
    color: "#666",
    lineHeight: 18,
    marginBottom: 12,
  },
  directionsButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0a7ea4",
    paddingVertical: 12,
    borderRadius: 10,
    gap: 8,
  },
  directionsButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    paddingHorizontal: 40,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#999",
    textAlign: "center",
    marginTop: 15,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: "#bbb",
    textAlign: "center",
  },
});
