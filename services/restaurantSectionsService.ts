/**
 * Restaurant Sections Service
 * Manages custom restaurant ordering and sections on user profiles.
 * Data is stored on the user document in Firestore and visible to all profile visitors.
 */

import { firestore } from '../firebaseConfig';

export interface RestaurantSection {
  id: string;
  name: string;
  restaurants: string[]; // ordered restaurant names
}

export interface RestaurantSectionsData {
  sections: RestaurantSection[];
  unsectionedOrder: string[];
}

/**
 * Load restaurant sections and custom order from a user's profile
 */
export const loadRestaurantSections = async (userId: string): Promise<RestaurantSectionsData | null> => {
  try {
    const userDoc = await firestore().collection('users').doc(userId).get();
    const userData = userDoc.data();

    if (!userData) return null;

    const sections: RestaurantSection[] = userData.restaurant_sections || [];
    const unsectionedOrder: string[] = userData.restaurant_unsectioned_order || [];

    // Return null if no custom ordering exists (use default meal-count sort)
    if (sections.length === 0 && unsectionedOrder.length === 0) {
      return null;
    }

    return { sections, unsectionedOrder };
  } catch (error) {
    console.error('RestaurantSectionsService: Error loading sections:', error);
    return null;
  }
};

/**
 * Save restaurant sections and custom order to a user's profile
 */
export const saveRestaurantSections = async (
  userId: string,
  sections: RestaurantSection[],
  unsectionedOrder: string[]
): Promise<void> => {
  try {
    await firestore().collection('users').doc(userId).update({
      restaurant_sections: sections,
      restaurant_unsectioned_order: unsectionedOrder,
    });
    console.log('✅ RestaurantSectionsService: Sections saved');
  } catch (error) {
    console.error('❌ RestaurantSectionsService: Error saving sections:', error);
    throw error;
  }
};

/**
 * Create a new empty section
 */
export const createSection = async (userId: string, name: string): Promise<RestaurantSection> => {
  const newSection: RestaurantSection = {
    id: `section_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    name,
    restaurants: [],
  };

  const userDoc = await firestore().collection('users').doc(userId).get();
  const userData = userDoc.data();
  const existingSections: RestaurantSection[] = userData?.restaurant_sections || [];

  await firestore().collection('users').doc(userId).update({
    restaurant_sections: [...existingSections, newSection],
  });

  console.log('✅ RestaurantSectionsService: Section created:', name);
  return newSection;
};

/**
 * Delete a section and move its restaurants to the unsectioned list
 */
export const deleteSection = async (userId: string, sectionId: string): Promise<void> => {
  const userDoc = await firestore().collection('users').doc(userId).get();
  const userData = userDoc.data();

  const sections: RestaurantSection[] = userData?.restaurant_sections || [];
  const unsectioned: string[] = userData?.restaurant_unsectioned_order || [];

  const sectionToDelete = sections.find(s => s.id === sectionId);
  const remainingSections = sections.filter(s => s.id !== sectionId);
  const updatedUnsectioned = [...unsectioned, ...(sectionToDelete?.restaurants || [])];

  await firestore().collection('users').doc(userId).update({
    restaurant_sections: remainingSections,
    restaurant_unsectioned_order: updatedUnsectioned,
  });

  console.log('✅ RestaurantSectionsService: Section deleted:', sectionId);
};

/**
 * Rename a section
 */
export const renameSection = async (userId: string, sectionId: string, newName: string): Promise<void> => {
  const userDoc = await firestore().collection('users').doc(userId).get();
  const userData = userDoc.data();
  const sections: RestaurantSection[] = userData?.restaurant_sections || [];

  const updatedSections = sections.map(s =>
    s.id === sectionId ? { ...s, name: newName } : s
  );

  await firestore().collection('users').doc(userId).update({
    restaurant_sections: updatedSections,
  });

  console.log('✅ RestaurantSectionsService: Section renamed:', newName);
};

/**
 * Reconcile sections with the current list of restaurants.
 * Any restaurant in uniqueRestaurants that isn't in any section or unsectioned order
 * gets appended to the unsectioned list.
 */
export const reconcileRestaurants = (
  allRestaurantNames: string[],
  sections: RestaurantSection[],
  unsectionedOrder: string[]
): { sections: RestaurantSection[]; unsectionedOrder: string[] } => {
  // Collect all restaurants that are already placed
  const placed = new Set<string>();
  for (const section of sections) {
    for (const r of section.restaurants) {
      placed.add(r);
    }
  }
  for (const r of unsectionedOrder) {
    placed.add(r);
  }

  // Find new restaurants not yet placed
  const newRestaurants = allRestaurantNames.filter(r => !placed.has(r));

  // Remove restaurants from sections/order that no longer exist
  const validNames = new Set(allRestaurantNames);
  const cleanedSections = sections.map(s => ({
    ...s,
    restaurants: s.restaurants.filter(r => validNames.has(r)),
  }));
  const cleanedUnsectioned = unsectionedOrder.filter(r => validNames.has(r));

  return {
    sections: cleanedSections,
    unsectionedOrder: [...cleanedUnsectioned, ...newRestaurants],
  };
};
