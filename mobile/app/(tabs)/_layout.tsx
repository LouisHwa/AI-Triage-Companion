import { Tabs } from "expo-router";
import React from "react";

import { HapticTab } from "@/components/haptic-tab";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? "light"].tint,
        headerShown: false,
        tabBarButton: HapticTab,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Triage", //Name displayed
          tabBarIcon: ({ color }) => (
            <IconSymbol size={28} name="cross.case.fill" color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="case"
        options={{
          title: "Case", //Name displayed
          tabBarIcon: ({ color }) => (
            <IconSymbol size={28} name="doc.fill" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="location"
        options={{
          title: "Location", //Name displayed
          tabBarIcon: ({ color }) => (
            <IconSymbol size={28} name="mappin.circle.fill" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile", //Name displayed
          tabBarIcon: ({ color }) => (
            <IconSymbol size={28} name="person.fill" color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
