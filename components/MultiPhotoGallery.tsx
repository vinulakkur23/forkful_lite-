import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  Alert
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
  editable?: boolean;
  maxPhotos?: number;
}

const MultiPhotoGallery: React.FC<MultiPhotoGalleryProps> = ({
  photos = [],
  onAddPhoto,
  onRemovePhoto,
  onSetFlagship,
  editable = false,
  maxPhotos = 5
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

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
      return (
        <View style={styles.noPhotoContainer}>
          <Icon name="no-photography" size={64} color="#ccc" />
          <Text style={styles.noPhotoText}>No photos</Text>
        </View>
      );
    }

    const currentPhoto = photos[selectedIndex] || photos[0];
    
    return (
      <View style={styles.mainPhotoContainer}>
        <Image
          source={{ uri: currentPhoto.url }}
          style={styles.mainPhoto}
          resizeMode="cover"
        />
        
        {/* Flagship badge */}
        {currentPhoto.isFlagship && (
          <View style={styles.flagshipBadge}>
            <Icon name="star" size={16} color="#fff" />
            <Text style={styles.flagshipText}>Flagship</Text>
          </View>
        )}

        {/* Photo counter */}
        {photos.length > 1 && (
          <View style={styles.photoCounter}>
            <Text style={styles.photoCounterText}>
              {selectedIndex + 1} of {photos.length}
            </Text>
          </View>
        )}

        {/* Remove button (only if editable and not the only photo) */}
        {editable && photos.length > 1 && (
          <TouchableOpacity 
            style={styles.removeButton}
            onPress={() => handleRemovePhoto(selectedIndex)}
          >
            <Icon name="close" size={20} color="#fff" />
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const renderThumbnails = () => {
    if (photos.length <= 1 && !editable) return null;

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
              
              {/* Flagship indicator */}
              {photo.isFlagship && (
                <View style={styles.thumbnailFlagshipIndicator}>
                  <Icon name="star" size={12} color="#ffc008" />
                </View>
              )}
            </TouchableOpacity>
          ))}
          
          {/* Add photo button */}
          {editable && photos.length < maxPhotos && (
            <TouchableOpacity 
              style={styles.addPhotoThumbnail}
              onPress={onAddPhoto}
            >
              <Icon name="add-a-photo" size={24} color="#666" />
              <Text style={styles.addPhotoText}>Add Photo</Text>
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
    height: 320,
    position: 'relative',
  },
  mainPhoto: {
    width: '100%',
    height: '100%',
  },
  noPhotoContainer: {
    width: '100%',
    height: 320,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
  },
  noPhotoText: {
    marginTop: 10,
    color: '#999',
    fontSize: 16,
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  flagshipBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    backgroundColor: 'rgba(255, 192, 8, 0.9)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  flagshipText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
    marginLeft: 4,
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  photoCounter: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  photoCounterText: {
    color: '#fff',
    fontSize: 12,
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  removeButton: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    backgroundColor: 'rgba(239, 68, 68, 0.9)',
    borderRadius: 20,
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
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
  thumbnailFlagshipIndicator: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#fff',
    borderRadius: 8,
    width: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  addPhotoThumbnail: {
    width: 60,
    height: 60,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#ddd',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f9f9f9',
  },
  addPhotoText: {
    fontSize: 8,
    color: '#666',
    marginTop: 2,
    textAlign: 'center',
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
});

export default MultiPhotoGallery;