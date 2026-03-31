/**
 * AddSectionModal
 * Modal for creating a new restaurant section on the user's profile.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  StyleSheet,
  Alert,
} from 'react-native';
import { colors, spacing } from '../themes';

interface Props {
  visible: boolean;
  existingSectionNames: string[];
  onClose: () => void;
  onCreate: (name: string) => void;
}

const AddSectionModal: React.FC<Props> = ({ visible, existingSectionNames, onClose, onCreate }) => {
  const [name, setName] = useState('');

  const handleCreate = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      Alert.alert('Enter a name', 'Section name cannot be empty.');
      return;
    }
    if (existingSectionNames.some(n => n.toLowerCase() === trimmed.toLowerCase())) {
      Alert.alert('Duplicate', 'A section with that name already exists.');
      return;
    }
    onCreate(trimmed);
    setName('');
    onClose();
  };

  const handleClose = () => {
    setName('');
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleClose}>
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={handleClose}
      >
        <TouchableOpacity activeOpacity={1} onPress={e => e.stopPropagation()} style={styles.card}>
          <Text style={styles.title}>New Section</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g., Favorites, Mexican Food"
            placeholderTextColor="#999"
            value={name}
            onChangeText={setName}
            autoFocus
            maxLength={40}
          />
          <View style={styles.buttons}>
            <TouchableOpacity style={styles.cancelButton} onPress={handleClose}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.createButton} onPress={handleCreate}>
              <Text style={styles.createText}>Create</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 20,
    width: '85%',
    maxWidth: 340,
  },
  title: {
    fontFamily: 'Inter',
    fontSize: 18,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 16,
  },
  input: {
    fontFamily: 'Inter',
    fontSize: 15,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.mediumGray,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 20,
  },
  buttons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  cancelButton: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: '#999',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  cancelText: {
    fontFamily: 'Inter',
    fontSize: 14,
    fontWeight: '600',
    color: '#999',
  },
  createButton: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: '#5B8A72',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  createText: {
    fontFamily: 'Inter',
    fontSize: 14,
    fontWeight: '600',
    color: '#5B8A72',
  },
});

export default AddSectionModal;
