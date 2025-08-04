import { CSSProperties } from 'react';

/**
 * Style properties to disable auto-corrections in textareas
 * Prevents ligatures, smart quotes, and other automatic text transformations
 */
export const textareaNoAutoCorrectStyles: CSSProperties = {
  fontVariantLigatures: 'none',
  fontFeatureSettings: '"liga" 0, "clig" 0',
};

/**
 * HTML attributes to disable auto-corrections in textareas
 * Disables spell checking, auto-correction, and auto-capitalization
 */
export const textareaNoAutoCorrectProps = {
  spellCheck: false,
  autoCorrect: 'off',
  autoCapitalize: 'off',
} as const;

/**
 * Combined props and styles for textareas that shouldn't have auto-corrections
 * Use this for code editors, script inputs, and other technical text areas
 */
export const getTextareaNoAutoCorrect = (existingStyle?: CSSProperties) => ({
  style: {
    ...textareaNoAutoCorrectStyles,
    ...existingStyle,
  },
  ...textareaNoAutoCorrectProps,
});