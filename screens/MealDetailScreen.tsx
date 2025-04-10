import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Alert,
  Share
} from 'react-native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RouteProp } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/FontAwesome';
import MaterialIcon from 'react-native-vector-icons/MaterialIcons';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import storage from '@react-native-firebase/storage';
import { RootStackParamList } from '../App';

type MealDetailScreenNavigationProp = StackNavigationProp<RootStackParamList, 'MealDetail'>;
type MealDetailScreenRouteProp = RouteProp<RootStackParamList, 'MealDetail'>;

type Props = {
  navigation: MealDetailScreenNavigationProp;
  route: MealDetailScreenRouteProp;
};

interface MealEntry {
  id: string;
  userId: string;
  photoUrl: string;
  rating: number;
  restaurant: string;
  meal: string;
  location: {
    latitude: number;
    longitude: number;
  } | null;
  createdAt: number;
}

const MealDetailScreen: React.FC<Props> = ({ route, navigation }) => {
  const { mealId } = route.params;
  const [mealData, setMealData] = useState<MealEntry | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMealData();
  }, []);

  const fetchMealData = async () => {
    try {
      setLoading(true);
      const docRef = await firestore().collection('mealEntries').doc(mealId).get();

      if (docRef.exists) {
        const data = docRef.data() as MealEntry;
        setMealData({
          id: docRef.id,
          ...data
        });
      } else {
        Alert.alert('Error', 'This meal entry no longer exists');
        navigation.goBack();
      }
    } catch (error) {
      console.error('Error fetching meal details:', error);
      Alert.alert('Error', 'Failed to load meal details');
    } finally {
      setLoading(false);
    }
  };

  const handleShare = async () => {
    if (!mealData) return;

    try {
      const ratingText = '⭐'.repeat(mealData.rating);
      const message = `Check out my ${mealData.rating}${ratingText} meal${mealData.restaurant ? ` at ${mealData.restaurant}` : ''}!`;

      await Share.share({
        message,
        url: mealData.photoUrl, // iOS only
      });
    } catch (error) {
      console.log('Sharing error:', error);
    }
  };

  const confirmDelete = () => {
    Alert.alert(
      'Delete Meal Entry',
      'Are you sure you want to delete this meal entry? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', onPress: deleteMealEntry, style: 'destructive' }
      ],
      { cancelable: true }
    );
  };

  const deleteMealEntry = async () => {
    if (!mealData) return;

    try {
      setLoading(true);

      // Delete image from storage if it's a Firebase storage URL
      if (mealData.photoUrl && mealData.photoUrl.includes('firebasestorage')) {
        const storageRef = storage().refFromURL(mealData.photoUrl);
        await storageRef.delete();
      }

      // Delete document from Firestore
      await firestore().collection('mealEntries').doc(mealId).delete();

      Alert.alert('Success', 'Meal entry has been deleted');
      navigation.goBack();
    } catch (error) {
      console.error('Error deleting meal entry:', error);
      Alert.alert('Error', 'Failed to delete meal entry');
      setLoading(false);
    }
  };

  const formatDate = (timestamp: number) => {
    if (!timestamp) return 'Unknown date';
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <ActivityIndicator size="large" color="#ff6b6b" />
      </View>
    );
  }

  if (!mealData) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <Text>Meal entry not found</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.imageContainer}>
        <Image
          source={{ uri: mealData.photoUrl }}
          style={styles.mealImage}
          resizeMode="cover"
        />
      </View>

      <View style={styles.detailsContainer}>
        <View style={styles.headerRow}>
          <View style={styles.mealHeader}>
            <Text style={styles.mealName}>{mealData.meal || 'Unnamed Meal'}</Text>
            <Text style={styles.dateText}>{formatDate(mealData.createdAt)}</Text>
          </View>
          <View style={styles.ratingContainer}>
            {[1, 2, 3, 4, 5].map((star) => (
              <Icon
                key={star}
                name={star <= mealData.rating ? 'star' : 'star-o'}
                size={18}
                color={star <= mealData.rating ? '#FFD700' : '#BDC3C7'}
                style={styles.star}
              />
            ))}
          </View>
        </View>

        {mealData.restaurant && (
          <View style={styles.infoRow}>
            <MaterialIcon name="restaurant" size={20} color="#666" style={styles.infoIcon} />
            <Text style={styles.infoText}>{mealData.restaurant}</Text>
          </View>
        )}

        {mealData.location && (
          <View style={styles.infoRow}>
            <MaterialIcon name="location-on" size={20} color="#666" style={styles.infoIcon} />
            <Text style={styles.infoText}>
              {`${mealData.location.latitude.toFixed(4)}, ${mealData.location.longitude.toFixed(4)}`}
            </Text>
          </View>
        )}

        <View style={styles.actionButtons}>
          <TouchableOpacity style={styles.actionButton} onPress={handleShare}>
            <MaterialIcon name="share" size={20} color="white" />
            <Text style={styles.actionButtonText}>Share</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.actionButton, styles.deleteButton]} onPress={confirmDelete}>
            <MaterialIcon name="delete" size={20} color="white" />
            <Text style={styles.actionButtonText}>Delete</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f8f8',
  },
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageContainer: {
    width: '100%',
    height: 300,
    backgroundColor: '#eee',
  },
  mealImage: {
    width: '100%',
    height: '100%',
  },
  detailsContainer: {
    padding: 20,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 15,
  },
  mealHeader: {
    flex: 1,
  },
  mealName: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  dateText: {
    color: '#666',
    fontSize: 14,
    marginTop: 5,
  },
  ratingContainer: {
    flexDirection: 'row',
    backgroundColor: '#f2f2f2',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 15,
  },
  star: {
    marginHorizontal: 2,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  infoIcon: {
    marginRight: 10,
  },
  infoText: {
    fontSize: 16,
    color: '#333',
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4CAF50',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    flex: 1,
    marginHorizontal: 5,
  },
  deleteButton: {
    backgroundColor: '#F44336',
  },
  actionButtonText: {
    color: 'white',
    fontWeight: '600',
    marginLeft: 8,
  },
});

export default MealDetailScreen;