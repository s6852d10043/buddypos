// src/theme/index.js
// Design tokens กลางของ BuddyPOS — ใช้ร่วมกันทุกหน้าจอเพื่อให้ UI สอดคล้องกันแบบแอพมืออาชีพ
import { Platform } from 'react-native';

export const colors = {
  // Brand (เขียวเดิมของแอพ)
  primary: '#059669',
  primaryDark: '#047857',
  primaryDeep: '#065F46',
  primarySoft: '#ECFDF5',
  primaryBorder: '#A7F3D0',

  // Neutrals
  bg: '#F6F7F9',
  background: '#F6F7F9',
  surface: '#FFFFFF',
  surfaceMuted: '#F3F4F6',
  surfaceSubtle: '#F3F4F6',
  border: '#E5E7EB',
  borderLight: '#E5E7EB',
  borderStrong: '#D1D5DB',
  text: '#111827',
  textPrimary: '#111827',
  textSecondary: '#4B5563',
  textMuted: '#6B7280',
  textFaint: '#9CA3AF',
  textOnPrimary: '#FFFFFF',

  // Status
  warning: '#B45309',
  warningSoft: '#FEF3C7',
  warningBorder: '#FDE68A',
  info: '#1D4ED8',
  infoSoft: '#DBEAFE',
  infoBorder: '#BFDBFE',
  orange: '#C2410C',
  orangeSoft: '#FFEDD5',
  orangeStrong: '#EA580C',
  danger: '#DC2626',
  dangerDark: '#B91C1C',
  dangerSoft: '#FEF2F2',
  dangerBorder: '#FECACA',
  success: '#047857',
  successSoft: '#D1FAE5',

  // Dark (แถบ header / cart bar)
  dark: '#111827',
  darkAlt: '#1F2937',
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 };

export const radius = { sm: 8, md: 12, lg: 16, xl: 20, pill: 999, full: 999 };

export const fontSize = { xs: 11, sm: 12, md: 14, lg: 16, xl: 20, xxl: 26 };

const cardShadow = Platform.select({
  web: { boxShadow: '0 1px 3px rgba(17,24,39,0.06), 0 1px 2px rgba(17,24,39,0.04)' },
  default: {
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
});

const raisedShadow = Platform.select({
  web: { boxShadow: '0 6px 16px rgba(17,24,39,0.10)' },
  default: {
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
});

export const shadow = {
  card: cardShadow,
  sm: cardShadow,
  raised: raisedShadow,
  md: raisedShadow,
};

const theme = { colors, spacing, radius, fontSize, shadow };
export default theme;
