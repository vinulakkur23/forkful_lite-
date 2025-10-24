import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  SafeAreaView,
  Dimensions
} from 'react-native';
import { RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../App';
import { colors, typography, spacing } from '../themes';

type EnjoyMealScreenRouteProp = RouteProp<RootStackParamList, 'EnjoyMeal'>;
type EnjoyMealScreenNavigationProp = StackNavigationProp<RootStackParamList, 'EnjoyMeal'>;

type Props = {
  route: EnjoyMealScreenRouteProp;
  navigation: EnjoyMealScreenNavigationProp;
};

const { width, height } = Dimensions.get('window');

const EnjoyMealScreen: React.FC<Props> = ({ route, navigation }) => {
  const { photoUri } = route.params;

  const goToFoodPassport = () => {
    navigation.navigate('FoodPassport', { tabIndex: 0 });
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {/* Header Text */}
        <View style={styles.headerContainer}>
          <Text style={styles.headerText}>Enjoy your meal!</Text>
        </View>

        {/* Photo Display */}
        <View style={styles.photoContainer}>
          <Image
            source={{ uri: photoUri }}
            style={styles.photo}
            resizeMode="cover"
          />
        </View>

        {/* Button */}
        <TouchableOpacity
          style={styles.passportButton}
          onPress={goToFoodPassport}
        >
          <Text style={styles.passportButtonText}>Food Passport</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.lightTan,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.screenPadding,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
  },
  headerContainer: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  headerText: {
    ...typography.h1,
    fontFamily: 'Inter',
    fontWeight: 'normal',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  photoContainer: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: spacing.borderRadius.md,
    overflow: 'hidden',
    backgroundColor: colors.white,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  passportButton: {
    backgroundColor: '#5B8A72',
    paddingVertical: spacing.md,
    borderRadius: spacing.borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xl,
  },
  passportButtonText: {
    ...typography.bodyLarge,
    fontFamily: 'Inter',
    fontWeight: '600',
    color: colors.white,
  },
});

export default EnjoyMealScreen;
