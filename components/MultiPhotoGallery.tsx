import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  Alert,
  PanResponder
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';

const { width } = Dimensions.get('window');

export interface PhotoItem {
  url: string;
  isFlagship: boolean;
  order: number;
  uploadedAt?: any;
}

interface MultiPhotoGalleryProps {
  photos: PhotoItem[];
  onAddPhoto?: () => void;
  onRemovePhoto?: (index: number) => void;
  onSetFlagship?: (index: number) => void;
  onPhotoPress?: (index: number, photo: PhotoItem) => void; // New prop for photo tap
  editable?: boolean;
  maxPhotos?: number;
  aspectRatio?: 'square' | 'wide'; // New prop to control aspect ratio
}

const MultiPhotoGallery: React.FC<MultiPhotoGalleryProps> = ({
  photos = [],
  onAddPhoto,
  onRemovePhoto,
  onSetFlagship,
  onPhotoPress,
  editable = false,
  maxPhotos = 5
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  
  // Debug selectedIndex changes
  React.useEffect(() => {
    console.log('selectedIndex changed to:', selectedIndex, 'of', photos.length, 'photos');
  }, [selectedIndex, photos.length]);
  
  // Reset selectedIndex when photos change
  React.useEffect(() => {
    console.log('Photos effect triggered. Photos length:', photos.length, 'selectedIndex:', selectedIndex);
    if (selectedIndex >= photos.length && photos.length > 0) {
      console.log('Resetting selectedIndex from', selectedIndex, 'to 0 because photos changed');
      setSelectedIndex(0);
    }
  }, [photos]);
  
  // Debug photos array changes
  React.useEffect(() => {
    console.log('Photos array changed:', photos.map(p => p.url.slice(-20)));
  }, [photos]);
  
  // Use a ref to store current selectedIndex to avoid stale closure
  const selectedIndexRef = useRef(selectedIndex);
  selectedIndexRef.current = selectedIndex;
  
  // Simplified swipe gesture handling
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        // Respond to horizontal swipes greater than 5 pixels
        return Math.abs(gestureState.dx) > 5 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
      },
      onPanResponderRelease: (evt, gestureState) => {
        const swipeThreshold = 50; // Lower threshold for easier swiping
        const velocity = gestureState.vx;
        const currentIndex = selectedIndexRef.current; // Use ref to get current value
        
        console.log('Swipe detected:', {
          dx: gestureState.dx,
          velocity: velocity,
          selectedIndex: currentIndex, // Use ref value
          photosLength: photos.length,
          canGoPrevious: currentIndex > 0,
          canGoNext: currentIndex < photos.length - 1
        });
        
        // Check velocity for quick swipes or distance for slow swipes
        if ((gestureState.dx > swipeThreshold || velocity > 0.3) && currentIndex > 0) {
          // Swipe right - go to previous photo
          console.log('Going to previous photo:', currentIndex - 1);
          setSelectedIndex(currentIndex - 1);
        } else if ((gestureState.dx < -swipeThreshold || velocity < -0.3) && currentIndex < photos.length - 1) {
          // Swipe left - go to next photo  
          console.log('Going to next photo:', currentIndex + 1);
          setSelectedIndex(currentIndex + 1);
        } else {
          console.log('Swipe not strong enough or at boundary');
        }
      },
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => false,
    })
  ).current;

  const handleRemovePhoto = (index: number) => {
    if (photos[index]?.isFlagship && photos.length > 1) {
      Alert.alert(
        'Cannot Remove Flagship Photo',
        'Please set another photo as the flagship before removing this one.',
        [{ text: 'OK' }]
      );
      return;
    }

    Alert.alert(
      'Remove Photo',
      'Are you sure you want to remove this photo?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Remove', 
          style: 'destructive',
          onPress: () => onRemovePhoto?.(index)
        }
      ]
    );
  };

  const handleSetFlagship = (index: number) => {
    if (photos[index]?.isFlagship) return; // Already flagship
    
    Alert.alert(
      'Set Flagship Photo',
      'This photo will be shown in your feed and on maps. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Set as Flagship',
          onPress: () => onSetFlagship?.(index)
        }
      ]
    );
  };

  const renderMainPhoto = () => {
    if (photos.length === 0) {
      // If editable and no photos, show Add Photo button
      if (editable && onAddPhoto) {
        return (
          <TouchableOpacity 
            style={styles.addPhotoButtonContainer}
            onPress={onAddPhoto}
            activeOpacity={0.8}
          >
            <Text style={styles.plusIcon}>+</Text>
            <Text style={styles.addPhotoButtonText}>Add a Photo</Text>
          </TouchableOpacity>
        );
      }
      // Non-editable mode shows the no photos state
      return (
        <View style={styles.noPhotoContainer}>
          <Icon name="no-photography" size={64} color="#ccc" />
          <Text style={styles.noPhotoText}>No photos</Text>
        </View>
      );
    }

    const currentPhoto = photos[selectedIndex] || photos[0];
    
    return (
      <View 
        style={styles.mainPhotoContainer}
        {...panResponder.panHandlers}
      >
        <TouchableOpacity 
          onPress={() => onPhotoPress?.(selectedIndex, currentPhoto)}
          activeOpacity={onPhotoPress ? 0.8 : 1}
          style={styles.mainPhotoTouchable}
        >
          <Image
            source={{ uri: currentPhoto.url }}
            style={styles.mainPhoto}
            resizeMode="cover"
          />
          
          {/* Click to Crop and Edit overlay - only show if onPhotoPress is provided */}
          {onPhotoPress && (
            <View style={styles.editOverlay}>
              <View style={styles.editOverlayBackground}>
                <Text style={styles.editOverlayText}>Click to Crop and Edit</Text>
              </View>
            </View>
          )}
        </TouchableOpacity>
        
        {/* Flagship badge removed - users don't need to see this */}

        {/* Photo dots indicator */}
        {photos.length > 1 && (
          <View style={styles.photoDotsContainer}>
            {photos.map((_, index) => (
              <View
                key={index}
                style={[
                  styles.photoDot,
                  selectedIndex === index && styles.photoDotActive
                ]}
              />
            ))}
          </View>
        )}
        
        {/* Swipe indicators removed - users understand from photo position */}

        {/* Remove button (only if editable and not the only photo) */}
        {editable && photos.length > 1 && (
          <TouchableOpacity 
            style={styles.removeButton}
            onPress={() => handleRemovePhoto(selectedIndex)}
          >
            <Text style={styles.removeButtonText}>×</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const renderThumbnails = () => {
    // Only show thumbnails when editing
    if (!editable) return null;
    if (photos.length <= 1 && photos.length >= maxPhotos) return null;

    return (
      <View style={styles.thumbnailsContainer}>
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.thumbnailsContent}
        >
          {photos.map((photo, index) => (
            <TouchableOpacity
              key={index}
              style={[
                styles.thumbnail,
                selectedIndex === index && styles.thumbnailSelected
              ]}
              onPress={() => setSelectedIndex(index)}
              onLongPress={editable ? () => handleSetFlagship(index) : undefined}
            >
              <Image
                source={{ uri: photo.url }}
                style={styles.thumbnailImage}
                resizeMode="cover"
              />
              
            </TouchableOpacity>
          ))}
          
          {/* Add photo button */}
          {photos.length < maxPhotos && (
            <TouchableOpacity 
              style={styles.addPhotoThumbnail}
              onPress={onAddPhoto}
            >
              <Text style={styles.addPhotoPlus}>+</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {renderMainPhoto()}
      {renderThumbnails()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  mainPhotoContainer: {
    width: '100%',
    aspectRatio: 1, // Square aspect ratio
    position: 'relative',
  },
  mainPhotoTouchable: {
    width: '100%',
    height: '100%',
  },
  mainPhoto: {
    width: '100%',
    height: '100%',
  },
  noPhotoContainer: {
    width: '100%',
    aspectRatio: 1, // Square aspect ratio
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
  },
  addPhotoButtonContainer: {
    width: '100%',
    aspectRatio: 1, // Square aspect ratio
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f8f8',
    borderWidth: 2,
    borderColor: '#ddd',
    borderStyle: 'dashed',
    borderRadius: 12,
  },
  plusIcon: {
    fontSize: 120,
    fontWeight: '300',
    color: '#1a2b49',
    lineHeight: 120,
  },
  addPhotoButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1a2b49',
    marginTop: 12,
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  noPhotoText: {
    marginTop: 10,
    color: '#999',
    fontSize: 16,
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  // Flagship badge styles removed - no longer shown to users
  photoDotsContainer: {
    position: 'absolute',
    bottom: 12,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
    marginHorizontal: 3,
  },
  photoDotActive: {
    backgroundColor: 'rgba(255, 255, 255, 1)',
  },
  removeButton: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 20,
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeButtonText: {
    color: '#ffc008',
    fontSize: 24,
    fontWeight: 'bold',
    lineHeight: 24,
    textAlign: 'center',
  },
  thumbnailsContainer: {
    backgroundColor: '#f8f8f8',
    paddingVertical: 12,
  },
  thumbnailsContent: {
    paddingHorizontal: 16,
  },
  thumbnail: {
    width: 60,
    height: 60,
    borderRadius: 8,
    marginRight: 12,
    position: 'relative',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  thumbnailSelected: {
    borderColor: '#ffc008',
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
    borderRadius: 6,
  },
  addPhotoThumbnail: {
    width: 60,
    height: 60,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1a2b49',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f9f9f9',
  },
  addPhotoPlus: {
    fontSize: 36,
    color: '#1a2b49',
    fontWeight: '400',
    textAlign: 'center',
    lineHeight: 36,
  },
  // Edit overlay styles
  editOverlay: {
    position: 'absolute',
    top: 12,
    right: 12,
  },
  editOverlayBackground: {
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  editOverlayText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  }
});

export default MultiPhotoGallery;