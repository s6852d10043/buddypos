// src/theme/Icon.js
// ตัวห่อไอคอนกลาง (Ionicons) — ใช้แทนอีโมจิทั้งแอพ
// ตัวอย่าง: <Icon name="restaurant-outline" size={18} color={colors.primary} />
// ดูชื่อไอคอนได้ที่ https://icons.expo.fyi (ชุด Ionicons)
import React from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors } from './index';

export default function Icon({ name, size = 18, color = colors.text, style }) {
  return <Ionicons name={name} size={size} color={color} style={style} />;
}
