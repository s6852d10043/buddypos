import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import Icon from '../theme/Icon';
import { colors, spacing, radius, fontSize, shadow } from '../theme';

export default function RoleSelectScreen({ onSelectOwner, onSelectStaff }) {
  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
    >
      <View style={styles.inner}>
        {/* ส่วนหัวโลโก้และชื่อแอป */}
        <View style={styles.header}>
          <View style={styles.logoBox}>
            <Icon name="restaurant-outline" size={36} color="#FFFFFF" />
          </View>
          <Text style={styles.appTitle}>BuddyPOS</Text>
          <Text style={styles.appSub}>ระบบจัดการร้านอาหารอัจฉริยะ</Text>
        </View>

        {/* ส่วนการ์ดเลือกบทบาท (จัดไอคอนและข้อความกึ่งกลาง) */}
        <View style={styles.cardsContainer}>
          {/* การ์ดเจ้าของร้าน */}
          <TouchableOpacity
            style={styles.card}
            onPress={onSelectOwner}
            activeOpacity={0.85}
          >
            <View style={[styles.iconCircle, { backgroundColor: colors.primarySoft }]}>
              <Icon name="storefront-outline" size={28} color={colors.primary} />
            </View>
            <Text style={styles.cardTitle}>เจ้าของร้าน (Owner)</Text>
            <Text style={styles.cardSub}>จัดการร้าน เมนูอาหาร และดูยอดขาย</Text>
          </TouchableOpacity>

          {/* การ์ดพนักงาน */}
          <TouchableOpacity
            style={styles.card}
            onPress={onSelectStaff}
            activeOpacity={0.85}
          >
            <View style={[styles.iconCircle, { backgroundColor: colors.infoSoft }]}>
              <Icon name="people-outline" size={28} color={colors.info} />
            </View>
            <Text style={styles.cardTitle}>พนักงาน / แคชเชียร์ / ครัว</Text>
            <Text style={styles.cardSub}>สแกน QR หรือใส่รหัสร้านเพื่อรับออเดอร์</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: 32,
    paddingBottom: 56, // ยกระดับสายตาให้อยู่กึ่งกลางหน้าจอพอดี
  },
  inner: {
    width: '100%',
    maxWidth: 420,
    alignItems: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 42, // เพิ่มระยะห่างระหว่างส่วนโลโก้กับการ์ดทั้ง 2 ใบ
  },
  logoBox: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    ...shadow.raised,
  },
  appTitle: {
    fontSize: 30,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.4,
    textAlign: 'center',
  },
  appSub: {
    fontSize: 15,
    color: colors.textMuted,
    marginTop: 6,
    textAlign: 'center',
  },
  cardsContainer: {
    width: '100%',
    gap: 18,
  },
  card: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderRadius: 20,
    paddingVertical: 26,
    paddingHorizontal: 24,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
  },
  cardSub: {
    fontSize: 14,
    color: colors.textMuted,
    marginTop: 6,
    textAlign: 'center',
    lineHeight: 20,
  },
});
