import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, View, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { registerForPushNotificationsAsync, savePushToken, removePushToken } from './src/services/notifications';
import { getStoredUser, clearUser, API_URL } from './src/services/api';
import { COLORS } from './src/utils/constants';
import axios from 'axios';

import LoginScreen from './src/screens/LoginScreen';
import BulletinsScreen from './src/screens/BulletinsScreen';
import InboxScreen from './src/screens/InboxScreen';
import ComposeScreen from './src/screens/ComposeScreen';
import AdminScreen from './src/screens/AdminScreen';
import UserDetailScreen from './src/screens/UserDetailScreen';
import ForgotPasswordScreen from './src/screens/ForgotPasswordScreen';
import ChangePasswordScreen from './src/screens/ChangePasswordScreen';

const Tab = createBottomTabNavigator();
const AdminStack = createStackNavigator();
const AuthStack = createStackNavigator();

function AdminStackScreen({ user, onLogout, onRefresh }) {
  return (
    <AdminStack.Navigator
      screenOptions={{
        headerStyle: {
          backgroundColor: COLORS.primary,
        },
        headerTintColor: 'white',
        headerTitleStyle: {
          fontWeight: 'bold',
        },
      }}
    >
      <AdminStack.Screen 
        name="AdminHome" 
        options={{ headerShown: false }}
      >
        {props => <AdminScreen {...props} user={user} onLogout={onLogout} onRefresh={onRefresh} />}
      </AdminStack.Screen>
      <AdminStack.Screen 
        name="UserDetail" 
        component={UserDetailScreen}
        options={{ 
          title: 'User Details',
        }}
      />
    </AdminStack.Navigator>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);
  const [pendingUsersCount, setPendingUsersCount] = useState(0);
  const [passwordResetCount, setPasswordResetCount] = useState(0);

  useEffect(() => {
    checkStoredUser();
  }, []);

  useEffect(() => {
    if (user) {
      loadNotificationCounts();
      
      // Poll every 30 seconds
      const interval = setInterval(loadNotificationCounts, 30000);
      return () => clearInterval(interval);
    }
  }, [user]);
  
  // Register for push notifications when user logs in
  useEffect(() => {
    if (user) {
      registerPushNotifications();
    }
  }, [user]);

  const registerPushNotifications = async () => {
    try {
      const token = await registerForPushNotificationsAsync();
      if (token) {
        await savePushToken(user.id, token);
      }

      // Listen for notifications when app is in foreground
      const notificationListener = Notifications.addNotificationReceivedListener(notification => {
        console.log('Notification received:', notification);
        // Refresh counts when notification received
        loadNotificationCounts();
      });

      // Listen for notification taps
      const responseListener = Notifications.addNotificationResponseReceivedListener(response => {
        console.log('Notification tapped:', response);
        // You can navigate to specific screens based on notification data
      });

      return () => {
        Notifications.removeNotificationSubscription(notificationListener);
        Notifications.removeNotificationSubscription(responseListener);
      };
    } catch (error) {
      console.error('Error registering push notifications:', error);
    }
  };

  const checkStoredUser = async () => {
    const storedUser = await getStoredUser();
    if (storedUser) {
      setUser(storedUser);
    }
    setLoading(false);
  };

  const loadNotificationCounts = async () => {
    if (!user) return;
    
    try {
      // Load unread messages count
      const messagesResponse = await axios.get(`${API_URL}/messages/inbox/${user.id}`);
      const messages = messagesResponse.data || [];
      
      const readStatusResponse = await axios.get(`${API_URL}/read-status/${user.id}`);
      const readMessages = readStatusResponse.data.messages || [];
      
      const unreadCount = messages.filter(msg => 
        !readMessages.includes(msg.id) && msg.sender_id !== user.id
      ).length;
      setUnreadMessagesCount(unreadCount);
      
      // Load admin counts if admin
      const isAdmin = user.role === 'admin' || user.role === 'super_user' || 
                      user.roles?.includes('admin') || user.roles?.includes('super_user');
      
      if (isAdmin) {
        const pendingResponse = await axios.get(`${API_URL}/admin/pending-users?requestingUserId=${user.id}`);
        setPendingUsersCount((pendingResponse.data || []).length);
        
        const resetResponse = await axios.get(`${API_URL}/admin/password-reset-requests?requestingUserId=${user.id}`);
        setPasswordResetCount((resetResponse.data || []).length);
      }
    } catch (error) {
      console.error('Error loading notification counts:', error);
    }
  };

  const handleLogin = (userData) => {
    setUser(userData);
  };

  const handlePasswordChanged = (updatedUser) => {
    setUser(updatedUser);
  };

  const handleLogout = async () => {
    if (user?.id) {
      await removePushToken(user.id);
    }
    await clearUser();
    setUser(null);
  };

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (!user) {
    return (
      <NavigationContainer>
        <AuthStack.Navigator screenOptions={{ headerShown: false }}>
          <AuthStack.Screen name="Login">
            {props => <LoginScreen {...props} onLogin={handleLogin} />}
          </AuthStack.Screen>
          <AuthStack.Screen 
            name="ForgotPassword" 
            component={ForgotPasswordScreen}
            options={{
              headerShown: true,
              title: 'Forgot Password',
              headerStyle: {
                backgroundColor: COLORS.primary,
              },
              headerTintColor: 'white',
              headerTitleStyle: {
                fontWeight: 'bold',
              },
            }}
          />
        </AuthStack.Navigator>
      </NavigationContainer>
    );
  }

  // Check if user must change password
  if (user.must_change_password) {
    return (
      <NavigationContainer>
        <AuthStack.Navigator screenOptions={{ headerShown: false }}>
          <AuthStack.Screen name="ChangePassword">
            {props => (
              <ChangePasswordScreen
                {...props}
                route={{ params: { user, onPasswordChanged: handlePasswordChanged } }}
              />
            )}
          </AuthStack.Screen>
        </AuthStack.Navigator>
      </NavigationContainer>
    );
  }
  
  const isAdmin = user.role === 'admin' || user.role === 'super_user' || 
                  user.roles?.includes('admin') || user.roles?.includes('super_user');

  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          tabBarIcon: ({ focused, color, size }) => {
            let iconName;

            if (route.name === 'Bulletins') {
              iconName = focused ? 'megaphone' : 'megaphone-outline';
            } else if (route.name === 'Inbox') {
              iconName = focused ? 'mail' : 'mail-outline';
            } else if (route.name === 'Compose') {
              iconName = focused ? 'add-circle' : 'add-circle-outline';
            } else if (route.name === 'Admin') {
              iconName = focused ? 'people' : 'people-outline';
            }

            return <Ionicons name={iconName} size={size} color={color} />;
          },
          tabBarActiveTintColor: COLORS.primary,
          tabBarInactiveTintColor: COLORS.gray500,
          headerStyle: {
            backgroundColor: COLORS.primary,
          },
          headerTintColor: 'white',
          headerTitleStyle: {
            fontWeight: 'bold',
          },
        })}
      >
        <Tab.Screen 
          name="Bulletins"
          options={{ title: 'Bulletins' }}
        >
          {props => <BulletinsScreen {...props} user={user} onLogout={handleLogout} />}
        </Tab.Screen>
        
        <Tab.Screen 
          name="Inbox"
          options={{ 
            title: 'Messages',
            tabBarBadge: unreadMessagesCount > 0 ? unreadMessagesCount : undefined,
          }}
        >
          {props => <InboxScreen {...props} user={user} onRefresh={loadNotificationCounts} />}
        </Tab.Screen>

        <Tab.Screen 
          name="Compose"
          options={{ title: 'New Message' }}
        >
          {props => <ComposeScreen {...props} user={user} />}
        </Tab.Screen>

        {isAdmin && (
          <Tab.Screen 
            name="Admin"
            options={{ 
              title: 'Admin', 
              headerShown: false,
              tabBarBadge: (pendingUsersCount + passwordResetCount) > 0 
                ? (pendingUsersCount + passwordResetCount) 
                : undefined,
            }}
          >
            {props => <AdminStackScreen {...props} user={user} onLogout={handleLogout} onRefresh={loadNotificationCounts} />}
          </Tab.Screen>
        )}
      </Tab.Navigator>
    </NavigationContainer>
  );
}