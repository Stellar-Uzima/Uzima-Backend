// ML Model - Note: Requires @tensorflow/tfjs to be installed
// If TensorFlow is not available, this will cause build errors
// The Prescription Verification feature works independently

import dataset from './symptom_condition_dataset.json';

// Extract unique symptoms and conditions
export const allSymptoms = Array.from(new Set(dataset.flatMap(d => d.symptoms)));
export const allConditions = Array.from(new Set(dataset.map(d => d.condition)));

// Encode symptoms as binary vectors
export function encodeSymptoms(symptoms) {
  return allSymptoms.map(symptom => (symptoms.includes(symptom) ? 1 : 0));
}

// Encode condition as one-hot
function encodeCondition(condition) {
  return allConditions.map(c => (c === condition ? 1 : 0));
}

// Stub function - will be overridden if TensorFlow loads
export async function trainModel() {
  throw new Error('TensorFlow.js not installed. Install with: npm install @tensorflow/tfjs');
}

// Try to use TensorFlow if available (will fail at runtime if not installed)
// This allows the app to build even without TensorFlow
if (typeof window !== 'undefined') {
  // Will be set at runtime if TensorFlow is loaded
  window.__tfAvailable = false;
}
