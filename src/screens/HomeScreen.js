// HomeScreen.js
import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  StatusBar,
  TextInput,
  Alert,
  Platform,
  ActivityIndicator,
  Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { supabase } from '../lib/supabase';
import Icon from '../theme/Icon';
import { colors, spacing, radius, fontSize, shadow } from '../theme';

// Helper: แปลงรูปภาพเป็น WebP บน Web Browser ผ่าน Canvas
const convertToWebPOnWeb = (uri) => {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);

      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Canvas toBlob failed'));
        },
        'image/webp',
        0.8
      );
    };
    img.onerror = (error) => reject(error);
    img.src = uri;
  });
};

export default function HomeScreen({ session, navigation, onLogout }) {
  const [restaurants, setRestaurants] = useState([]);
  const [selectedRestaurant, setSelectedRestaurant] = useState(null);
  const [loading, setLoading] = useState(true);

  // State ฟอร์ม
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [restaurantName, setRestaurantName] = useState('');
  const [imageUri, setImageUri] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Synchronous locks & lifecycle guards
  const isMountedRef = useRef(true);
  const isSavingRef = useRef(false);
  const isDeletingRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    fetchRestaurants();
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // 1. READ: ดึงข้อมูลร้านค้าทั้งหมด
  const fetchRestaurants = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('restaurants')
        .select('*')
        .eq('owner_id', session?.user?.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (!isMountedRef.current) return;

      setRestaurants(data || []);
      if (data && data.length > 0) {
        setSelectedRestaurant(data[0]);
      } else {
        setSelectedRestaurant(null);
        openCreateForm();
      }
    } catch (error) {
      console.error('Fetch Restaurants Error:', error);
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  };

  // เลือกรูปภาพจากเครื่อง
  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0].uri) {
      setImageUri(result.assets[0].uri);
    }
  };

  // อัปโหลดรูปภาพไปยัง Supabase Storage พร้อมแปลงไฟล์เป็น .webp
  const uploadImage = async (uri) => {
    if (!uri || uri.startsWith('http')) return uri;

    const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.webp`;
    const filePath = `logos/${fileName}`;
    let uploadBlob;

    try {
      if (Platform.OS === 'web') {
        uploadBlob = await convertToWebPOnWeb(uri);
      } else {
        const manipulatedImage = await ImageManipulator.manipulateAsync(
          uri,
          [],
          {
            compress: 0.8,
            format: ImageManipulator.SaveFormat.WEBP,
          }
        );

        const response = await fetch(manipulatedImage.uri);
        uploadBlob = await response.blob();
      }

      const { error: uploadError } = await supabase.storage
        .from('restaurant-images')
        .upload(filePath, uploadBlob, {
          contentType: 'image/webp',
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage
        .from('restaurant-images')
        .getPublicUrl(filePath);

      return data.publicUrl;
    } catch (error) {
      console.error('Upload Error:', error);
      throw error;
    }
  };

  // 2. CREATE / UPDATE: บันทึกข้อมูลร้านค้า
  const handleSaveStore = async () => {
    if (isSavingRef.current) return;
    if (!restaurantName.trim()) {
      const msg = 'กรุณากรอกชื่อร้านค้า';
      if (Platform.OS === 'web') alert(msg);
      else Alert.alert('คำเตือน', msg);
      return;
    }

    try {
      isSavingRef.current = true;
      setSubmitting(true);
      let uploadedImageUrl = imageUri;

      if (imageUri && !imageUri.startsWith('http')) {
        uploadedImageUrl = await uploadImage(imageUri);
      }

      if (editingId) {
        const { error } = await supabase
          .from('restaurants')
          .update({
            name: restaurantName.trim(),
            image_url: uploadedImageUrl,
          })
          .eq('id', editingId);

        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('restaurants')
          .insert([
            {
              name: restaurantName.trim(),
              image_url: uploadedImageUrl,
              owner_id: session?.user?.id,
            },
          ])
          .select();

        if (error) throw error;
        if (data && data.length > 0 && isMountedRef.current) {
          setSelectedRestaurant(data[0]);
        }
      }

      if (isMountedRef.current) {
        resetForm();
        fetchRestaurants();
      }

      const successMsg = editingId ? 'แก้ไขร้านค้าเรียบร้อย' : 'เพิ่มร้านค้าใหม่เรียบร้อย';
      if (Platform.OS === 'web') alert(successMsg);
      else Alert.alert('สำเร็จ', successMsg);
    } catch (error) {
      console.error('Save Store Error:', error);
      const errorMsg = error.message || 'ไม่สามารถบันทึกข้อมูลได้';
      if (Platform.OS === 'web') alert(errorMsg);
      else Alert.alert('เกิดข้อผิดพลาด', errorMsg);
    } finally {
      isSavingRef.current = false;
      if (isMountedRef.current) {
        setSubmitting(false);
      }
    }
  };

  // 3. DELETE: ลบร้านค้า
  const handleDeleteStore = (store) => {
    if (isDeletingRef.current) return;

    const confirmAction = async () => {
      if (isDeletingRef.current) return;
      try {
        isDeletingRef.current = true;
        setLoading(true);
        const { error } = await supabase
          .from('restaurants')
          .delete()
          .eq('id', store.id);

        if (error) throw error;

        if (isMountedRef.current) {
          if (selectedRestaurant?.id === store.id) {
            setSelectedRestaurant(null);
          }
          fetchRestaurants();
        }

        const msg = `ลบร้าน "${store.name}" เรียบร้อยแล้ว`;
        if (Platform.OS === 'web') alert(msg);
        else Alert.alert('สำเร็จ', msg);
      } catch (error) {
        console.error('Delete Store Error:', error);
        const errorMsg = error.message || 'ไม่สามารถลบร้านค้าได้';
        if (Platform.OS === 'web') alert(errorMsg);
        else Alert.alert('เกิดข้อผิดพลาด', errorMsg);
      } finally {
        isDeletingRef.current = false;
        if (isMountedRef.current) {
          setLoading(false);
        }
      }
    };

    if (Platform.OS === 'web') {
      if (confirm(`คุณต้องการลบร้าน "${store.name}" ใช่หรือไม่?`)) {
        confirmAction();
      }
    } else {
      Alert.alert('ยืนยันการลบ', `คุณต้องการลบร้าน "${store.name}" ใช่หรือไม่?`, [
        { text: 'ยกเลิก', style: 'cancel' },
        { text: 'ลบร้านค้า', style: 'destructive', onPress: confirmAction },
      ]);
    }
  };

  // ฟังก์ชันกดเข้าร้านค้า
  const handleEnterStore = (store) => {
    if (store?.status === 'suspended') {
      const msg = 'ร้านค้านี้ถูกระงับการใช้งานชั่วคราวโดยผู้ดูแลระบบกลาง (Super Admin) กรุณาติดต่อผู้ดูแลระบบ';
      if (Platform.OS === 'web') alert(msg);
      else Alert.alert('ถูกระงับการใช้งาน', msg);
      return;
    }
    setSelectedRestaurant(store);
    navigation?.navigate('StoreDashboard', {
      restaurantId: store.id,
      restaurantName: store.name,
      image_url: store.image_url || null,
    });
  };

  const openCreateForm = () => {
    setEditingId(null);
    setRestaurantName('');
    setImageUri(null);
    setShowForm(true);
  };

  const openEditForm = (store) => {
    setEditingId(store.id);
    setRestaurantName(store.name);
    setImageUri(store.image_url || null);
    setShowForm(true);
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setRestaurantName('');
    setImageUri(null);
  };

  const handleLogout = async () => {
    if (onLogout) {
      await onLogout();
    } else {
      await supabase.auth.signOut();
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.surface} />
      <ScrollView contentContainerStyle={styles.container}>
        
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greetingText}>ระบบจัดการร้านค้า</Text>
            <Text style={styles.userEmail}>{session?.user?.email}</Text>
          </View>
          <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.8}>
            <Icon name="log-out-outline" size={16} color={colors.danger} />
            <Text style={styles.logoutBtnText}>ออกจากระบบ</Text>
          </TouchableOpacity>
        </View>

        {/* Section Title */}
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleRow}>
            <Icon name="storefront-outline" size={20} color={colors.primary} />
            <Text style={styles.sectionTitle}>ร้านค้าของคุณ</Text>
          </View>
          <TouchableOpacity 
            onPress={() => (showForm ? resetForm() : openCreateForm())}
            style={styles.toggleAddBtn}
            activeOpacity={0.7}
          >
            <Icon
              name={showForm ? 'close' : 'add'}
              size={16}
              color={colors.primary}
            />
            <Text style={styles.actionText}>
              {showForm ? 'ยกเลิก' : 'เพิ่มร้านใหม่'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* ฟอร์ม เพิ่ม/แก้ไข ร้านค้า */}
        {showForm && (
          <View style={styles.formCard}>
            <View style={styles.formTitleRow}>
              <Icon
                name={editingId ? 'create-outline' : 'add-circle-outline'}
                size={18}
                color={colors.primaryDeep}
              />
              <Text style={styles.formTitle}>
                {editingId ? 'แก้ไขข้อมูลร้านค้า' : 'เพิ่มร้านค้าใหม่'}
              </Text>
            </View>
            
            <View style={styles.imagePickerContainer}>
              <TouchableOpacity style={styles.imagePreviewBox} onPress={pickImage} activeOpacity={0.8}>
                {imageUri ? (
                  <Image source={{ uri: imageUri }} style={styles.previewImage} />
                ) : (
                  <View style={styles.placeholderImageBox}>
                    <Icon name="camera-outline" size={28} color={colors.textMuted} />
                    <Text style={styles.placeholderImageText}>เลือกรูปโลโก้ร้าน</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.input}
              placeholder="กรอกชื่อร้านค้า..."
              placeholderTextColor={colors.textFaint}
              value={restaurantName}
              onChangeText={setRestaurantName}
            />

            <TouchableOpacity
              style={styles.saveStoreBtn}
              onPress={handleSaveStore}
              disabled={submitting}
              activeOpacity={0.85}
            >
              {submitting ? (
                <ActivityIndicator color={colors.textOnPrimary} size="small" />
              ) : (
                <Text style={styles.saveStoreBtnText}>
                  {editingId ? 'บันทึกการแก้ไข' : 'สร้างร้านค้า'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* List รายการร้านค้า */}
        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginVertical: 30 }} />
        ) : restaurants.length === 0 && !showForm ? (
          <View style={styles.noStoreBox}>
            <View style={styles.noStoreIconWrap}>
              <Icon name="storefront-outline" size={32} color={colors.textFaint} />
            </View>
            <Text style={styles.noStoreTitle}>ยังไม่มีร้านค้าในระบบ</Text>
            <Text style={styles.noStoreSubtitle}>สร้างร้านค้าของคุณเพื่อเริ่มใช้งานระบบ</Text>
            <TouchableOpacity style={styles.addFirstStoreBtn} onPress={openCreateForm} activeOpacity={0.85}>
              <Icon name="add" size={18} color={colors.textOnPrimary} />
              <Text style={styles.addFirstStoreBtnText}>สร้างร้านค้าแรก</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.storeListContainer}>
            {restaurants.map((item) => {
              const isSelected = selectedRestaurant?.id === item.id;
              return (
                <View 
                  key={item.id} 
                  style={[styles.storeCard, isSelected && styles.selectedStoreCard]}
                >
                  <TouchableOpacity
                    style={styles.storeMainInfo}
                    onPress={() => handleEnterStore(item)}
                    activeOpacity={0.7}
                  >
                    {item.image_url ? (
                      <Image source={{ uri: item.image_url }} style={styles.storeAvatar} />
                    ) : (
                      <View style={styles.storeIconBox}>
                        <Icon name="storefront-outline" size={24} color={colors.primary} />
                      </View>
                    )}
                    
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                        <Text style={[styles.storeName, isSelected && styles.selectedStoreName]}>
                          {item.name}
                        </Text>
                        {item.status === 'suspended' && (
                          <View style={{ backgroundColor: colors.dangerSoft, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12 }}>
                            <Text style={{ fontSize: 10, fontWeight: '700', color: colors.danger }}>ถูกระงับ</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.storeIdText}>ID: {item.id.substring(0, 8)}...</Text>
                    </View>

                    <Icon name="chevron-forward" size={20} color={colors.primary} />
                  </TouchableOpacity>

                  <View style={styles.cardActions}>
                    <TouchableOpacity 
                      style={styles.actionBtnEdit} 
                      onPress={() => openEditForm(item)}
                      activeOpacity={0.7}
                    >
                      <Icon name="create-outline" size={14} color={colors.info} />
                      <Text style={styles.actionBtnEditText}>แก้ไข</Text>
                    </TouchableOpacity>

                    <TouchableOpacity 
                      style={styles.actionBtnDelete} 
                      onPress={() => handleDeleteStore(item)}
                      activeOpacity={0.7}
                    >
                      <Icon name="trash-outline" size={14} color={colors.danger} />
                      <Text style={styles.actionBtnDeleteText}>ลบ</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  container: {
    padding: spacing.xl,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xxl,
    paddingBottom: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  greetingText: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.text,
  },
  userEmail: {
    fontSize: fontSize.sm + 1,
    color: colors.textMuted,
    marginTop: 2,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.dangerSoft,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
  },
  logoutBtnText: {
    color: colors.danger,
    fontWeight: '600',
    fontSize: fontSize.sm,
    marginLeft: 4,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: fontSize.lg + 2,
    fontWeight: '700',
    color: colors.text,
    marginLeft: 8,
  },
  toggleAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.sm,
  },
  actionText: {
    color: colors.primary,
    fontWeight: '700',
    fontSize: fontSize.md,
    marginLeft: 4,
  },
  formCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.xl,
    ...shadow.card,
  },
  formTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  formTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.primaryDeep,
    marginLeft: 6,
  },
  imagePickerContainer: {
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  imagePreviewBox: {
    width: 100,
    height: 100,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceMuted,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    borderStyle: 'dashed',
    overflow: 'hidden',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  placeholderImageBox: {
    alignItems: 'center',
  },
  placeholderImageText: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: 6,
  },
  input: {
    height: 46,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontSize: fontSize.md,
    backgroundColor: colors.surface,
    color: colors.text,
    marginBottom: spacing.md,
  },
  saveStoreBtn: {
    backgroundColor: colors.primary,
    height: 46,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveStoreBtnText: {
    color: colors.textOnPrimary,
    fontWeight: '700',
    fontSize: fontSize.md,
  },
  storeListContainer: {
    marginBottom: spacing.xl,
  },
  storeCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...shadow.card,
  },
  selectedStoreCard: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  storeMainInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  storeAvatar: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    marginRight: spacing.md,
  },
  storeIconBox: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  storeName: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.text,
  },
  selectedStoreName: {
    color: colors.primaryDark,
  },
  storeIdText: {
    fontSize: fontSize.sm,
    color: colors.textFaint,
    marginTop: 2,
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: spacing.md,
    paddingTop: 10,
  },
  actionBtnEdit: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.infoSoft,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.sm,
    marginRight: 8,
  },
  actionBtnEditText: {
    color: colors.info,
    fontSize: fontSize.sm,
    fontWeight: '700',
    marginLeft: 4,
  },
  actionBtnDelete: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.dangerSoft,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.sm,
  },
  actionBtnDeleteText: {
    color: colors.danger,
    fontSize: fontSize.sm,
    fontWeight: '700',
    marginLeft: 4,
  },
  noStoreBox: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xxl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.xl,
    ...shadow.card,
  },
  noStoreIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  noStoreTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 6,
  },
  noStoreSubtitle: {
    fontSize: fontSize.sm + 1,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  addFirstStoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    height: 44,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.md,
  },
  addFirstStoreBtnText: {
    color: colors.textOnPrimary,
    fontWeight: '700',
    fontSize: fontSize.md,
    marginLeft: 4,
  },
});
