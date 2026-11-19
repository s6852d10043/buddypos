// src/screens/MenuManagementScreen.js
import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  ScrollView,
  TextInput,
  Alert,
  Platform,
  ActivityIndicator,
  Modal,
  Image,
  Switch,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { supabase } from '../lib/supabase';
import Icon from '../theme/Icon';
import { colors, spacing, radius, fontSize, shadow } from '../theme';

const CATEGORIES = ['ทั้งหมด', 'อาหารจานหลัก', 'ทานเล่น', 'เครื่องดื่ม', 'ของหวาน', 'อื่น ๆ'];

export default function MenuManagementScreen({ store, onBack }) {
  const restaurantId = store?.restaurantId || store?.id;
  const restaurantName = store?.restaurantName || store?.name || 'ร้านค้าของคุณ';

  const [menuItems, setMenuItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Filter & Search States
  const [selectedCategory, setSelectedCategory] = useState('ทั้งหมด');
  const [searchQuery, setSearchQuery] = useState('');

  // Modal States
  const [modalVisible, setModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState(null);

  // Form States
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState('อาหารจานหลัก');
  const [imageUrl, setImageUrl] = useState('');
  const [isAvailable, setIsAvailable] = useState(true);

  // Synchronous locks & lifecycle guards
  const isMountedRef = useRef(true);
  const isSavingRef = useRef(false);
  const isDeletingRef = useRef(false);
  const togglingIdsRef = useRef(new Set());

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (restaurantId) {
      fetchMenuItems();
    }
  }, [restaurantId]);

  // -------------------------------------------------------------
  // Data Fetching & Operations
  // -------------------------------------------------------------
  const fetchMenuItems = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('menu_items')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (isMountedRef.current) {
        setMenuItems(data || []);
      }
    } catch (error) {
      console.error('Fetch Menu Error Details:', error);
      showNotice('เกิดข้อผิดพลาด', error.message || 'ไม่สามารถโหลดข้อมูลเมนูอาหารได้');
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  };

  const showNotice = (title, message) => {
    if (Platform.OS === 'web') {
      alert(`${title}: ${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  const base64ToArrayBuffer = (base64) => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    const clean = base64.replace(/^data:[^;]+;base64,/, '').replace(/[^A-Za-z0-9+/=]/g, '');
    const len = clean.length;
    let bufferLength = (len * 3) / 4;
    if (clean[len - 1] === '=') bufferLength--;
    if (clean[len - 2] === '=') bufferLength--;
    const bytes = new Uint8Array(bufferLength);
    let p = 0;
    for (let i = 0; i < len; i += 4) {
      const encoded1 = chars.indexOf(clean[i]);
      const encoded2 = chars.indexOf(clean[i + 1]);
      const encoded3 = clean[i + 2] === '=' ? 0 : chars.indexOf(clean[i + 2]);
      const encoded4 = clean[i + 3] === '=' ? 0 : chars.indexOf(clean[i + 3]);
      bytes[p++] = (encoded1 << 2) | (encoded2 >> 4);
      if (clean[i + 2] !== '=') bytes[p++] = ((encoded2 & 15) << 4) | (encoded3 >> 2);
      if (clean[i + 3] !== '=') bytes[p++] = ((encoded3 & 3) << 6) | (encoded4 & 63);
    }
    return bytes.buffer;
  };

  // -------------------------------------------------------------
  // Image Processing & Uploading (WebP Conversion)
  // -------------------------------------------------------------
  const uploadAndConvertImage = async (uri) => {
    try {
      // 1. ย่อขนาดและแปลงไฟล์เป็น Format WEBP (ความกว้างสูงสุด 800px, บีบอัด 80%)
      const manipResult = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 800 } }],
        { compress: 0.8, format: ImageManipulator.SaveFormat.WEBP, base64: Platform.OS !== 'web' }
      );

      // 2. แปลงเป็น ArrayBuffer (บนมือถือ) หรือ Blob (บนเว็บ) เพื่อส่งขึ้น Supabase Storage
      let uploadPayload;
      if (Platform.OS !== 'web' && manipResult.base64) {
        uploadPayload = base64ToArrayBuffer(manipResult.base64);
      } else {
        const response = await fetch(manipResult.uri);
        uploadPayload = await response.blob();
      }

      // 3. กำหนดชื่อไฟล์และ Path ปลายทาง
      const fileName = `menu_${Date.now()}_${Math.random().toString(36).substring(7)}.webp`;
      const filePath = `menus/${fileName}`;

      // 4. อัปโหลดเข้า Bucket ชื่อ 'menu-images'
      const { error } = await supabase.storage
        .from('menu-images')
        .upload(filePath, uploadPayload, {
          contentType: 'image/webp',
          upsert: true,
        });

      if (error) throw error;

      // 5. ขอ Public URL มาใช้บันทึกลง Database
      const { data: publicUrlData } = supabase.storage
        .from('menu-images')
        .getPublicUrl(filePath);

      return publicUrlData.publicUrl;
    } catch (err) {
      console.error('Image Upload & Convert Error:', err);
      throw err;
    }
  };

  // -------------------------------------------------------------
  // Form & Image Handling
  // -------------------------------------------------------------
  const openModal = (item = null) => {
    if (item) {
      setEditingItem(item);
      setName(item.name || '');
      setPrice(item.price ? item.price.toString() : '');
      setCategory(item.category || 'อาหารจานหลัก');
      setImageUrl(item.image_url || '');
      setIsAvailable(item.is_available ?? true);
    } else {
      setEditingItem(null);
      setName('');
      setPrice('');
      setCategory('อาหารจานหลัก');
      setImageUrl('');
      setIsAvailable(true);
    }
    setModalVisible(true);
  };

  const handlePickImage = async () => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        showNotice('คำเตือน', 'กรุณาอนุญาตการเข้าถึงคลังภาพเพื่อเลือกรูปอาหาร');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const selectedAsset = result.assets[0];
        setImageUrl(selectedAsset.uri);
      }
    } catch (err) {
      console.error('Pick Image Error:', err);
    }
  };

  const handleSaveItem = async () => {
    if (isSavingRef.current) return;

    if (!name.trim()) {
      showNotice('คำเตือน', 'กรุณากรอกชื่อเมนูอาหาร');
      return;
    }
    const parsedPrice = parseFloat(price);
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0 || parsedPrice > 1000000) {
      showNotice('คำเตือน', 'กรุณาระบุราคาที่ถูกต้อง (ตั้งแต่ 0 ถึง 1,000,000 บาท)');
      return;
    }

    try {
      isSavingRef.current = true;
      setSubmitting(true);
      let finalImageUrl = imageUrl.trim() || null;

      // ตรวจสอบว่าเป็นรูปภาพ Local จากคลังภาพในเครื่องหรือไม่ (ถ้าใช่ ให้อัปโหลดและแปลงเป็น .webp)
      if (
        imageUrl &&
        !imageUrl.startsWith('http://') &&
        !imageUrl.startsWith('https://')
      ) {
        finalImageUrl = await uploadAndConvertImage(imageUrl);
      }

      const payload = {
        restaurant_id: restaurantId,
        name: name.trim(),
        price: parsedPrice,
        category: category,
        image_url: finalImageUrl,
        is_available: isAvailable,
      };

      if (editingItem) {
        const { error } = await supabase
          .from('menu_items')
          .update(payload)
          .eq('id', editingItem.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('menu_items')
          .insert([payload]);

        if (error) throw error;
      }

      if (isMountedRef.current) {
        setModalVisible(false);
        fetchMenuItems();
      }
    } catch (error) {
      console.error('Save Menu Error:', error);
      showNotice('เกิดข้อผิดพลาด', error.message || 'ไม่สามารถบันทึกข้อมูลเมนูได้');
    } finally {
      isSavingRef.current = false;
      if (isMountedRef.current) {
        setSubmitting(false);
      }
    }
  };

  const handleDeleteItem = (item) => {
    if (isDeletingRef.current) return;

    const confirmAction = async () => {
      if (isDeletingRef.current) return;
      try {
        isDeletingRef.current = true;
        setLoading(true);
        const { error } = await supabase
          .from('menu_items')
          .delete()
          .eq('id', item.id);

        if (error) throw error;
        if (isMountedRef.current) {
          fetchMenuItems();
        }
      } catch (error) {
        console.error('Delete Menu Error:', error);
        showNotice('เกิดข้อผิดพลาด', error.message || 'ไม่สามารถลบรายการเมนูนี้ได้');
      } finally {
        isDeletingRef.current = false;
        if (isMountedRef.current) {
          setLoading(false);
        }
      }
    };

    if (Platform.OS === 'web') {
      if (confirm(`คุณต้องการลบเมนู "${item.name}" ใช่หรือไม่?`)) {
        confirmAction();
      }
    } else {
      Alert.alert(
        'ยืนยันการลบ',
        `คุณต้องการลบเมนู "${item.name}" ใช่หรือไม่?`,
        [
          { text: 'ยกเลิก', style: 'cancel' },
          { text: 'ลบ', style: 'destructive', onPress: confirmAction },
        ]
      );
    }
  };

  const handleToggleStatus = async (item) => {
    if (togglingIdsRef.current.has(item.id)) return;
    togglingIdsRef.current.add(item.id);

    const newStatus = !(item.is_available ?? true);
    setMenuItems((prev) =>
      prev.map((m) => (m.id === item.id ? { ...m, is_available: newStatus } : m))
    );

    try {
      const { error } = await supabase
        .from('menu_items')
        .update({ is_available: newStatus })
        .eq('id', item.id);

      if (error) throw error;
    } catch (error) {
      console.error('Toggle Status Error:', error);
      if (isMountedRef.current) {
        fetchMenuItems();
      }
    } finally {
      togglingIdsRef.current.delete(item.id);
    }
  };

  const filteredMenuItems = menuItems.filter((item) => {
    const matchCategory = selectedCategory === 'ทั้งหมด' || item.category === selectedCategory;
    const matchSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchCategory && matchSearch;
  });

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.surface} />

      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack} activeOpacity={0.7}>
          <Icon name="chevron-back" size={18} color={colors.primary} />
          <Text style={styles.backBtnText}>กลับแดชบอร์ด</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{restaurantName}</Text>
        <View style={{ width: 80 }} />
      </View>

      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.sectionHeader}>
          <View>
            <View style={styles.sectionTitleRow}>
              <Icon name="restaurant-outline" size={20} color={colors.primary} />
              <Text style={styles.sectionTitle}>จัดการเมนูอาหาร</Text>
            </View>
            <Text style={styles.subTitle}>รายการทั้งหมด: {menuItems.length} เมนู</Text>
          </View>
          <TouchableOpacity style={styles.addBtn} onPress={() => openModal()} activeOpacity={0.85}>
            <Icon name="add" size={16} color={colors.textOnPrimary} />
            <Text style={styles.addBtnText}>เพิ่มเมนูใหม่</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.searchBox}>
          <Icon name="search-outline" size={18} color={colors.textFaint} style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="ค้นหาชื่อเมนูอาหาร..."
            placeholderTextColor={colors.textFaint}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery !== '' && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Icon name="close-circle" size={18} color={colors.textFaint} />
            </TouchableOpacity>
          )}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryBar}>
          {CATEGORIES.map((cat) => (
            <TouchableOpacity
              key={cat}
              style={[
                styles.categoryChip,
                selectedCategory === cat && styles.categoryChipActive,
              ]}
              onPress={() => setSelectedCategory(cat)}
            >
              <Text
                style={[
                  styles.categoryChipText,
                  selectedCategory === cat && styles.categoryChipTextActive,
                ]}
              >
                {cat}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {loading ? (
          <ActivityIndicator color={colors.primary} size="large" style={{ marginVertical: 40 }} />
        ) : filteredMenuItems.length === 0 ? (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIconWrap}>
              <Icon name="restaurant-outline" size={28} color={colors.textFaint} />
            </View>
            <Text style={styles.emptyText}>ไม่พบรายการเมนูอาหาร</Text>
            <TouchableOpacity style={styles.addBtnModal} onPress={() => openModal()}>
              <Icon name="add" size={16} color={colors.textOnPrimary} />
              <Text style={styles.addBtnModalText}>เพิ่มเมนูอาหารแรก</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.gridContainer}>
            {filteredMenuItems.map((item) => (
              <View key={item.id} style={styles.menuCard}>
                <Image
                  source={
                    item.image_url
                      ? { uri: item.image_url }
                      : { uri: 'https://via.placeholder.com/150?text=No+Image' }
                  }
                  style={styles.menuImage}
                  resizeMode="cover"
                />
                
                <View style={styles.menuContent}>
                  <View style={styles.categoryBadge}>
                    <Text style={styles.categoryBadgeText}>{item.category || 'ทั่วไป'}</Text>
                  </View>

                  <Text style={styles.menuName} numberOfLines={1}>{item.name}</Text>
                  <Text style={styles.menuPrice}>฿{Number(item.price).toLocaleString()}</Text>

                  <View style={styles.statusRow}>
                    <View style={styles.statusIndicatorRow}>
                      <View
                        style={[
                          styles.statusDot,
                          { backgroundColor: (item.is_available ?? true) ? colors.primary : colors.danger },
                        ]}
                      />
                      <Text style={[
                        styles.statusLabel,
                        { color: (item.is_available ?? true) ? colors.primary : colors.danger }
                      ]}>
                        {(item.is_available ?? true) ? 'พร้อมขาย' : 'สินค้าหมด'}
                      </Text>
                    </View>
                    <Switch
                      value={item.is_available ?? true}
                      onValueChange={() => handleToggleStatus(item)}
                      trackColor={{ false: colors.border, true: colors.primaryBorder }}
                      thumbColor={(item.is_available ?? true) ? colors.primary : colors.textFaint}
                    />
                  </View>

                  <View style={styles.cardActions}>
                    <TouchableOpacity style={styles.actionBtnEdit} onPress={() => openModal(item)}>
                      <Icon name="create-outline" size={14} color={colors.info} />
                      <Text style={styles.actionBtnEditText}>แก้ไข</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionBtnDelete} onPress={() => handleDeleteItem(item)}>
                      <Icon name="trash-outline" size={14} color={colors.danger} />
                      <Text style={styles.actionBtnDeleteText}>ลบ</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <Modal visible={modalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.modalTitleRow}>
                <Icon
                  name={editingItem ? 'create-outline' : 'add-circle-outline'}
                  size={20}
                  color={colors.primary}
                />
                <Text style={styles.modalTitle}>
                  {editingItem ? 'แก้ไขเมนูอาหาร' : 'เพิ่มเมนูอาหารใหม่'}
                </Text>
              </View>

              <Text style={styles.inputLabel}>รูปภาพเมนู</Text>
              <View style={styles.imagePickerContainer}>
                {imageUrl ? (
                  <Image source={{ uri: imageUrl }} style={styles.previewImage} />
                ) : (
                  <View style={styles.placeholderImage}>
                    <Icon name="image-outline" size={26} color={colors.textFaint} />
                    <Text style={{ fontSize: 10, color: colors.textFaint, marginTop: 2 }}>ไม่มีรูปภาพ</Text>
                  </View>
                )}
                <View style={styles.imageBtnGroup}>
                  <TouchableOpacity style={styles.pickImageBtn} onPress={handlePickImage}>
                    <Icon name="folder-open-outline" size={16} color={colors.textSecondary} />
                    <Text style={styles.pickImageBtnText}>เลือกรูปภาพ</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <Text style={styles.inputLabel}>URL รูปภาพ (กรณีใช้ลิงก์ภาพภายนอก)</Text>
              <TextInput
                style={styles.input}
                placeholder="https://example.com/image.jpg"
                placeholderTextColor={colors.textFaint}
                value={imageUrl}
                onChangeText={setImageUrl}
              />

              <Text style={styles.inputLabel}>ชื่อเมนูอาหาร *</Text>
              <TextInput
                style={styles.input}
                placeholder="เช่น ข้าวผัดกระเพราไข่ดาว"
                placeholderTextColor={colors.textFaint}
                value={name}
                onChangeText={setName}
              />

              <Text style={styles.inputLabel}>ราคา (บาท) *</Text>
              <TextInput
                style={styles.input}
                placeholder="0.00"
                placeholderTextColor={colors.textFaint}
                keyboardType="numeric"
                value={price}
                onChangeText={setPrice}
              />

              <Text style={styles.inputLabel}>หมวดหมู่</Text>
              <View style={styles.categoryPickerRow}>
                {CATEGORIES.filter((c) => c !== 'ทั้งหมด').map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    style={[
                      styles.categoryOption,
                      category === cat && styles.categoryOptionActive,
                    ]}
                    onPress={() => setCategory(cat)}
                  >
                    <Text
                      style={[
                        styles.categoryOptionText,
                        category === cat && styles.categoryOptionTextActive,
                      ]}
                    >
                      {cat}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.switchRow}>
                <Text style={styles.inputLabel}>สถานะพร้อมขาย</Text>
                <Switch
                  value={isAvailable}
                  onValueChange={setIsAvailable}
                  trackColor={{ false: colors.border, true: colors.primaryBorder }}
                  thumbColor={isAvailable ? colors.primary : colors.textFaint}
                />
              </View>

              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => setModalVisible(false)}
                  disabled={submitting}
                >
                  <Text style={styles.cancelBtnText}>ยกเลิก</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.saveBtn}
                  onPress={handleSaveItem}
                  disabled={submitting}
                >
                  {submitting ? (
                    <ActivityIndicator color={colors.textOnPrimary} size="small" />
                  ) : (
                    <Text style={styles.saveBtnText}>บันทึกข้อมูล</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingLeft: 6,
    paddingRight: 10,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.sm,
  },
  backBtnText: { color: colors.primary, fontWeight: '600', fontSize: fontSize.md, marginLeft: 2 },
  headerTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text, maxWidth: '50%' },
  container: { padding: spacing.xl },

  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center' },
  sectionTitle: { fontSize: fontSize.lg + 2, fontWeight: '700', color: colors.text, marginLeft: 6 },
  subTitle: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2 },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radius.sm,
  },
  addBtnText: { color: colors.textOnPrimary, fontWeight: '700', fontSize: fontSize.sm + 1, marginLeft: 4 },

  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 44,
    marginBottom: spacing.md,
  },
  searchInput: { flex: 1, fontSize: fontSize.md, color: colors.text },

  categoryBar: { flexDirection: 'row', marginBottom: spacing.lg },
  categoryChip: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 8,
  },
  categoryChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  categoryChipText: { fontSize: fontSize.sm + 1, color: colors.textSecondary, fontWeight: '600' },
  categoryChipTextActive: { color: colors.textOnPrimary },

  gridContainer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  menuCard: {
    width: '48%',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    ...shadow.card,
  },
  menuImage: { width: '100%', height: 110, backgroundColor: colors.surfaceMuted },
  menuContent: { padding: 10 },
  categoryBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primarySoft,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
    marginBottom: 4,
  },
  categoryBadgeText: { fontSize: 10, color: colors.primary, fontWeight: '700' },
  menuName: { fontSize: fontSize.md, fontWeight: '700', color: colors.text, marginBottom: 2 },
  menuPrice: { fontSize: fontSize.md + 1, fontWeight: '700', color: colors.primary, marginBottom: 8 },

  statusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  statusIndicatorRow: { flexDirection: 'row', alignItems: 'center' },
  statusDot: { width: 7, height: 7, borderRadius: 4, marginRight: 5 },
  statusLabel: { fontSize: fontSize.xs, fontWeight: '700' },

  cardActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 8,
  },
  actionBtnEdit: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  actionBtnEditText: { color: colors.info, fontSize: fontSize.sm, fontWeight: '600', marginLeft: 4 },
  actionBtnDelete: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  actionBtnDeleteText: { color: colors.danger, fontSize: fontSize.sm, fontWeight: '600', marginLeft: 4 },

  emptyCard: {
    backgroundColor: colors.surface,
    padding: 30,
    borderRadius: radius.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  emptyIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  emptyText: { fontSize: fontSize.md, color: colors.textMuted, marginBottom: spacing.md },
  addBtnModal: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: radius.sm,
  },
  addBtnModalText: { color: colors.textOnPrimary, fontWeight: '700', fontSize: fontSize.sm + 1, marginLeft: 4 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(17, 24, 39, 0.5)', justifyContent: 'center', alignItems: 'center', padding: spacing.xl },
  modalContent: { width: '100%', maxWidth: 440, maxHeight: '85%', backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.xl },
  modalTitleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.lg },
  modalTitle: { fontSize: fontSize.lg + 2, fontWeight: '700', color: colors.text, marginLeft: 6 },

  inputLabel: { fontSize: fontSize.sm + 1, fontWeight: '600', color: colors.textSecondary, marginBottom: 6 },
  input: {
    height: 44,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    fontSize: fontSize.md,
    color: colors.text,
    marginBottom: 14,
  },

  imagePickerContainer: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  previewImage: { width: 70, height: 70, borderRadius: radius.sm, backgroundColor: colors.surfaceMuted },
  placeholderImage: {
    width: 70,
    height: 70,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageBtnGroup: { flex: 1 },
  pickImageBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  pickImageBtnText: { color: colors.textSecondary, fontSize: fontSize.sm, fontWeight: '700', marginLeft: 6 },

  categoryPickerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 },
  categoryOption: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg },
  categoryOptionActive: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  categoryOptionText: { fontSize: fontSize.sm, color: colors.textSecondary },
  categoryOptionTextActive: { color: colors.primary, fontWeight: '700' },

  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg },
  modalButtons: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 10, gap: 8 },
  cancelBtn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: radius.sm },
  cancelBtnText: { color: colors.textMuted, fontWeight: '700' },
  saveBtn: { backgroundColor: colors.primary, paddingVertical: 10, paddingHorizontal: 20, borderRadius: radius.sm },
  saveBtnText: { color: colors.textOnPrimary, fontWeight: '700' },
});
