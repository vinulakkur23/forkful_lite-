const BASE_URL = 'https://dishitout-imageinhancer.onrender.com';

export interface DishHistoryResult {
  title: string;
  history: string;
  generation_timestamp: string;
  generation_version: string;
  generation_model: string;
  dish_name: string;
  generation_error?: boolean;
}

export interface DishHistoryResponse {
  success: boolean;
  data: DishHistoryResult;
  message: string;
  performance: {
    total_time_seconds: number;
    api_time_seconds: number;
  };
}

export const getDishHistory = async (dishName: string): Promise<DishHistoryResult | null> => {
  try {
    console.log('🏛️ DishHistoryService: Generating history for:', dishName);
    
    const startTime = Date.now();
    
    // Create form data
    const formData = new FormData();
    formData.append('dish_name', dishName);
    
    console.log('🏛️ DishHistoryService: Making API request to /generate-dish-history');
    
    const response = await fetch(`${BASE_URL}/generate-dish-history`, {
      method: 'POST',
      body: formData,
      headers: {
        'Accept': 'application/json',
      },
    });

    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;

    console.log('🏛️ DishHistoryService: API response received');
    console.log('🏛️ DishHistoryService: Response status:', response.status);
    console.log('🏛️ DishHistoryService: Total request time:', `${duration}s`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('🏛️ DishHistoryService: API error:', response.status, errorText);
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const result: DishHistoryResponse = await response.json();
    console.log('🏛️ DishHistoryService: Successfully generated dish history');
    console.log('🏛️ DishHistoryService: Title:', result.data.title);
    console.log('🏛️ DishHistoryService: History length:', result.data.history?.length || 0, 'chars');

    return result.data;
  } catch (error) {
    console.error('🏛️ DishHistoryService: Error generating dish history:', error);
    console.error('🏛️ DishHistoryService: Error details:', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return null;
  }
};