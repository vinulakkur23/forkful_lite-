import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ActivityIndicator } from 'react-native';
import { StackNavigationProp } from '@react-navigation/stack';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import auth from '@react-native-firebase/auth';
import { RootStackParamList } from '../App';
import { getAuth, GoogleAuthProvider, signInWithCredential } from '@react-native-firebase/auth';

type LoginScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Login'>;

type Props = {
  navigation: LoginScreenNavigationProp;
};

const LoginScreen: React.FC<Props> = ({ navigation }) => {
  const [initializing, setInitializing] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);

  // Configure Google Sign In
  useEffect(() => {
    GoogleSignin.configure({
      webClientId: '476812977799-7dmlpm8g3plslrsftesst7op6ipm71a4.apps.googleusercontent.com',
      iosClientId: '476812977799-vutvsmj3dit2ov9ko1sgp4p2p0u57kh4.apps.googleusercontent.com',
      offlineAccess: true,
      forceCodeForRefreshToken: true,
      scopes: ['https://www.googleapis.com/auth/userinfo.profile', 'https://www.googleapis.com/auth/userinfo.email']
    });
  }, []);

  // Handle user state changes
  function onAuthStateChanged(user: any) {
    console.log("AUTH STATE CHANGED called");
    console.log("User object:", user ? "User exists" : "No user");
    if (user) {
      console.log("User ID from auth state:", user.uid);
      console.log("User email from auth state:", user.email);
    }
    
    setUser(user);
    if (initializing) {
      console.log("Initializing complete");
      setInitializing(false);
    }

    if (user) {
      console.log("User detected, attempting navigation to MainTabs");
      navigation.reset({
        index: 0,
        routes: [{ name: 'MainTabs' }],
      });
      console.log("Navigation command from auth state change executed");
    } else {
      console.log("No user detected, staying on Login screen");
    }
  }

  // Use the original setup from GitHub
  useEffect(() => {
    const auth = getAuth();
    const subscriber = auth.onAuthStateChanged(onAuthStateChanged);
    return subscriber; // unsubscribe on unmount
  }, []);

  // This is the exact onGoogleButtonPress with updates for proper navigation
  const onGoogleButtonPress = async () => {
    try {
      setIsSigningIn(true);
      console.log("1. Starting Google sign-in process");
      
      // Make sure Google Play Services are available
      await GoogleSignin.hasPlayServices();
      console.log("2. Google Play Services available");
      
      // Sign in with Google
      const userInfo = await GoogleSignin.signIn();
      console.log("3. Google sign-in successful, got user info");
      console.log("User info object:", JSON.stringify(userInfo));
      
      // Check if ID token exists
      if (!userInfo.idToken) {
        console.error("No ID token in user info object!");
        
        // Try to get tokens directly
        try {
          const tokens = await GoogleSignin.getTokens();
          console.log("Retrieved tokens directly:", tokens);
          
          if (tokens.idToken) {
            // Use this token instead
            const googleCredential = GoogleAuthProvider.credential(tokens.idToken);
            console.log("4. Created Google credential from getTokens()");
            
            // Sign in with Firebase
            console.log("5. Attempting Firebase authentication...");
            const auth = getAuth();
            await signInWithCredential(auth, googleCredential);
            console.log("6. Firebase auth completed successfully!");
            
            // Add manual navigation to MainTabs here
            console.log("7. Manual navigation to MainTabs");
            navigation.reset({
              index: 0,
              routes: [{ name: 'MainTabs' }],
            });
          } else {
            throw new Error('No ID token present in tokens!');
          }
        } catch (tokenError) {
          console.error("Error getting tokens:", tokenError);
          throw new Error('No ID token present!');
        }
      } else {
        // Create Auth credential
        const googleCredential = GoogleAuthProvider.credential(userInfo.idToken);
        console.log("4. Created Google credential");
        
        // Sign in with Firebase
        console.log("5. Attempting Firebase authentication...");
        const auth = getAuth();
        await signInWithCredential(auth, googleCredential);
        console.log("6. Firebase auth completed successfully!");
        
        // Add manual navigation to MainTabs here
        console.log("7. Manual navigation to MainTabs");
        navigation.reset({
          index: 0,
          routes: [{ name: 'MainTabs' }],
        });
      }
    } catch (error) {
      console.error("ERROR in Google sign-in:", error);
      // Detailed error logging
      if (error.code) {
        console.error("Error code:", error.code);
      }
      if (error.message) {
        console.error("Error message:", error.message);
      }
      
      // Show alert to user
      alert(`Google Sign-In Error: ${error.message}`);
    } finally {
      setIsSigningIn(false);
    }
  };
    
  const continueAsGuest = () => {
    navigation.reset({
      index: 0,
      routes: [{ name: 'MainTabs' }],  // Updated to navigate to MainTabs instead of Home
    });
  };

  if (initializing) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <ActivityIndicator size="large" color="#ff6b6b" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.logoContainer}>
        <Image
          source={require('../assets/app-logo.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.title}>DishItOut</Text>
        <Text style={styles.subtitle}>Your Food Passport</Text>
      </View>

      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={styles.googleButton}
          onPress={onGoogleButtonPress}
          disabled={isSigningIn}
        >
          {isSigningIn ? (
            <ActivityIndicator size="small" color="white" />
          ) : (
            <>
              <Image
                source={require('../assets/google-logo.png')}
                style={styles.googleIcon}
              />
              <Text style={styles.googleButtonText}>Sign in with Google</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.guestButton}
          onPress={continueAsGuest}
        >
          <Text style={styles.guestButtonText}>Continue as Guest</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.termsText}>
        By signing in, you agree to our Terms of Service and Privacy Policy
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f8f8',
    padding: 20,
  },
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 50,
  },
  logo: {
    width: 120,
    height: 120,
    marginBottom: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#ff6b6b',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 18,
    color: '#666',
  },
  buttonContainer: {
    width: '100%',
    marginBottom: 30,
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4285F4',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    marginBottom: 15,
  },
  googleIcon: {
    width: 24,
    height: 24,
    marginRight: 10,
    backgroundColor: 'white',
    borderRadius: 12,
  },
  googleButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  guestButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ededed',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
  },
  guestButtonText: {
    color: '#555',
    fontSize: 16,
    fontWeight: '600',
  },
  termsText: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
  }
});

export default LoginScreen;
