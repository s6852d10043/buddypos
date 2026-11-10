// src/screens/StaffLoginScreen.js
import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  StatusBar,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
  Image,
} from 'react-native';
import { CameraView, Camera } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as Clipboard from 'expo-clipboard';
import jsQR from 'jsqr';
import { supabase } from '../lib/supabase';
import Icon from '../theme/Icon';
import { colors, spacing, radius, fontSize, shadow } from '../theme';

export default function StaffLoginScreen({ onBack, onStaffLogin }) {
  // โหมดการเข้าใช้งาน: 'scan' | 'image' | 'link'
  const [activeTab, setActiveTab] = useState('scan');

  // State สำหรับการสแกนกล้อง
  const [hasCameraPermission, setHasCameraPermission] = useState(null);
  const [facing, setFacing] = useState('back'); // 'back' | 'front'
  const [scanned, setScanned] = useState(false);

  // State สำหรับใส่ลิงก์
  const [inputLink, setInputLink] = useState('');
  const [isLinkFocused, setIsLinkFocused] = useState(false);

  // State สำหรับแนบรูปภาพ
  const [pickedImageUri, setPickedImageUri] = useState(null);
  const [decodingImage, setDecodingImage] = useState(false);

  // State การตรวจสอบข้อมูลร้าน
  const [verifying, setVerifying] = useState(false);
  const [recentStore, setRecentStore] = useState(null);

  const isMountedRef = useRef(true);
  const isSubmittingRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    requestCameraPermission();
    loadRecentStore();
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const requestCameraPermission = async () => {
    try {
      const { status } = await Camera.requestCameraPermissionsAsync();
      if (isMountedRef.current) {
        setHasCameraPermission(status === 'granted');
      }
    } catch (err) {
      console.warn('Camera permission request error:', err);
      if (isMountedRef.current) {
        setHasCameraPermission(false);
      }
    }
  };

  const loadRecentStore = async () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('buddypos_recent_staff_store');
        if (!saved) return;
        const parsed = JSON.parse(saved);
        if (!parsed?.id || !parsed?.staffToken) {
          localStorage.removeItem('buddypos_recent_staff_store');
          if (isMountedRef.current) setRecentStore(null);
          return;
        }
        const { data } = await supabase
          .from('restaurants')
          .select('id, name, image_url, staff_token')
          .eq('id', parsed.id)
          .maybeSingle();

        if (data && data.staff_token && data.staff_token === parsed.staffToken) {
          if (isMountedRef.current) {
            setRecentStore({
              ...parsed,
              name: data.name || parsed.name,
              image_url: data.image_url || parsed.image_url || null,
            });
          }
        } else {
          localStorage.removeItem('buddypos_recent_staff_store');
          if (isMountedRef.current) setRecentStore(null);
        }
      } catch (err) {
        console.warn('Load recent store error:', err);
      }
    }
  };

  const handleLoginRecentStore = async (storeObj) => {
    if (isSubmittingRef.current) return;
    if (!storeObj?.id || !storeObj?.staffToken) {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        localStorage.removeItem('buddypos_recent_staff_store');
      }
      if (isMountedRef.current) setRecentStore(null);
      showNotice(
        'ไม่สามารถเข้าสู่ระบบได้',
        'เจ้าของร้านได้เปลี่ยน QR Code พนักงานใหม่แล้ว กรุณาสแกน QR Code หรือวางลิงก์ชุดใหม่'
      );
      return;
    }

    try {
      isSubmittingRef.current = true;
      if (isMountedRef.current) setVerifying(true);
      const { data, error } = await supabase
        .from('restaurants')
        .select('id, name, image_url, staff_token, status')
        .eq('id', storeObj.id)
        .maybeSingle();

      if (data?.status === 'suspended') {
        showNotice(
          'ร้านค้าถูกระงับการใช้งาน',
          'ร้านค้านี้ถูกระงับการใช้งานชั่วคราวโดยผู้ดูแลระบบ ไม่สามารถเข้าสู่ระบบพนักงานได้'
        );
        return;
      }

      if (error || !data || data.staff_token !== storeObj.staffToken) {
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          localStorage.removeItem('buddypos_recent_staff_store');
        }
        if (isMountedRef.current) setRecentStore(null);
        showNotice(
          'QR Code เดิมถูกยกเลิกแล้ว',
          'เจ้าของร้านได้เปลี่ยน QR Code พนักงานใหม่แล้ว กรุณาสแกน QR Code หรือใส่ลิงก์ชุดใหม่จากเจ้าของร้าน'
        );
        return;
      }

      if (onStaffLogin) {
        onStaffLogin({
          ...storeObj,
          name: data.name || storeObj.name,
          image_url: data.image_url || storeObj.image_url || null,
          staffToken: data.staff_token,
        });
      }
    } catch (err) {
      console.error('Verify recent store error:', err);
      showNotice('เกิดข้อผิดพลาด', 'ไม่สามารถตรวจสอบสถานะร้านค้าได้');
    } finally {
      isSubmittingRef.current = false;
      if (isMountedRef.current) {
        setVerifying(false);
      }
    }
  };

  const saveRecentStore = (storeObj) => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      try {
        localStorage.setItem('buddypos_recent_staff_store', JSON.stringify(storeObj));
      } catch (err) {
        console.warn('Save recent store error:', err);
      }
    }
  };

  const showNotice = (title, message) => {
    if (!isMountedRef.current) return;
    if (Platform.OS === 'web') {
      alert(`${title}\n\n${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  // -------------------------------------------------------------
  // ระบบแยกและตรวจสอบข้อมูลร้านค้าจาก QR Code / ลิงก์ (Parser & Validator)
  // -------------------------------------------------------------
  const processStoreAccessData = async (rawString) => {
    if (isSubmittingRef.current) return;
    if (!rawString || !rawString.trim()) {
      showNotice('คำเตือน', 'กรุณาระบุข้อมูล QR Code หรือลิงก์ร้านค้า');
      return;
    }

    const clean = rawString.trim();

    try {
      isSubmittingRef.current = true;
      if (isMountedRef.current) setVerifying(true);

      let storeId = null;
      let token = null;
      let storeName = null;

      if (clean.startsWith('http://') || clean.startsWith('https://')) {
        try {
          const urlObj = new URL(clean);
          storeId =
            urlObj.searchParams.get('store_id') ||
            urlObj.searchParams.get('restaurant_id') ||
            urlObj.searchParams.get('id');
          token = urlObj.searchParams.get('staff_token') || urlObj.searchParams.get('token');
          storeName = urlObj.searchParams.get('store_name') || urlObj.searchParams.get('name');
        } catch {
          const matchStore = clean.match(/[?&](?:store_id|restaurant_id|id)=([^&]+)/);
          if (matchStore) storeId = decodeURIComponent(matchStore[1]);
          const matchToken = clean.match(/[?&](?:staff_token|token)=([^&]+)/);
          if (matchToken) token = decodeURIComponent(matchToken[1]);
        }
      } else if (clean.startsWith('{') && clean.endsWith('}')) {
        try {
          const parsed = JSON.parse(clean);
          storeId = parsed.store_id || parsed.restaurant_id || parsed.id;
          token = parsed.staff_token || parsed.token;
          storeName = parsed.store_name || parsed.name;
        } catch (e) {}
      } else {
        token = clean;
      }

      let verifiedRestaurant = null;

      if (storeId) {
        const { data: restData, error: restErr } = await supabase
          .from('restaurants')
          .select('id, name, image_url, staff_token, status')
          .eq('id', storeId)
          .maybeSingle();

        if (restErr || !restData) {
          throw new Error('ไม่พบข้อมูลร้านค้าในระบบ กรุณาตรวจสอบ QR Code หรือลิงก์อีกครั้ง');
        }

        if (restData.status === 'suspended') {
          throw new Error('ร้านค้านี้ถูกระงับการใช้งานชั่วคราวโดยผู้ดูแลระบบ ไม่สามารถเข้าสู่ระบบพนักงานได้');
        }

        if (!token || restData.staff_token !== token) {
          throw new Error(
            'QR Code หรือลิงก์พนักงานนี้หมดอายุหรือถูกเปลี่ยนใหม่แล้ว กรุณาขอ QR Code ชุดใหม่จากเจ้าของร้าน'
          );
        }

        verifiedRestaurant = restData;
      } else if (token) {
        const { data: restByToken } = await supabase
          .from('restaurants')
          .select('id, name, image_url, staff_token, status')
          .eq('staff_token', token)
          .maybeSingle();

        if (!restByToken) {
          throw new Error(
            'QR Code หรือลิงก์พนักงานนี้หมดอายุหรือถูกเปลี่ยนใหม่แล้ว กรุณาขอ QR Code ชุดใหม่จากเจ้าของร้าน'
          );
        }

        if (restByToken.status === 'suspended') {
          throw new Error('ร้านค้านี้ถูกระงับการใช้งานชั่วคราวโดยผู้ดูแลระบบ ไม่สามารถเข้าสู่ระบบพนักงานได้');
        }

        verifiedRestaurant = restByToken;
      }

      if (!verifiedRestaurant) {
        throw new Error('ข้อมูล QR Code ไม่ถูกต้อง กรุณาขอ QR Code พนักงานจากเจ้าของร้าน');
      }

      const resolvedStoreName =
        verifiedRestaurant.name || storeName || 'ร้านค้า BuddyPOS (พนักงาน)';

      const storePayload = {
        id: verifiedRestaurant.id,
        restaurantId: verifiedRestaurant.id,
        name: resolvedStoreName,
        image_url: verifiedRestaurant.image_url || null,
        staffToken: verifiedRestaurant.staff_token,
        role: 'staff',
        loginTime: new Date().toISOString(),
      };

      saveRecentStore(storePayload);
      showNotice('สำเร็จ!', `เข้าสู่ระบบ ${resolvedStoreName} เรียบร้อยแล้ว`);

      if (onStaffLogin) {
        onStaffLogin(storePayload);
      }
    } catch (err) {
      console.error('Process Store Access Error:', err);
      showNotice('เข้าสู่ระบบไม่สำเร็จ', err.message || 'ข้อมูล QR Code ไม่ถูกต้อง');
      if (isMountedRef.current) {
        setScanned(false);
      }
    } finally {
      isSubmittingRef.current = false;
      if (isMountedRef.current) {
        setVerifying(false);
      }
    }
  };

  // วิธีที่ 1: กล้องสแกน Barcode / QR Code
  const handleBarcodeScanned = ({ data }) => {
    if (scanned || verifying || isSubmittingRef.current) return;
    setScanned(true);
    processStoreAccessData(data);
  };

  // วิธีที่ 2: วางลิงก์จากคลิปบอร์ด
  const handlePasteClipboard = async () => {
    try {
      let clipText = '';
      if (Platform.OS === 'web' && navigator?.clipboard) {
        clipText = await navigator.clipboard.readText();
      } else {
        clipText = await Clipboard.getStringAsync();
      }

      if (clipText && clipText.trim()) {
        if (isMountedRef.current) setInputLink(clipText.trim());
      } else {
        showNotice('แจ้งเตือน', 'คลิปบอร์ดว่างเปล่า ยังไม่มีข้อความที่คัดลอกไว้');
      }
    } catch (err) {
      console.warn('Paste clipboard error:', err);
    }
  };

  // วิธีที่ 2: แนบรูปภาพ QR Code จากแกลเลอรี และถอดรหัสทันที
  const handlePickQRImage = async () => {
    if (isSubmittingRef.current) return;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 1,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }

      const selectedAsset = result.assets[0];
      if (isMountedRef.current) {
        setPickedImageUri(selectedAsset.uri);
        setDecodingImage(true);
      }

      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        const img = new window.Image();
        img.crossOrigin = 'Anonymous';
        img.onload = async () => {
          let qrResult = null;

          if ('BarcodeDetector' in window) {
            try {
              const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
              const barcodes = await detector.detect(img);
              if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
                qrResult = barcodes[0].rawValue;
              }
            } catch (detectorErr) {
              console.warn('BarcodeDetector fallback to jsQR:', detectorErr);
            }
          }

          if (!qrResult) {
            try {
              const canvas = document.createElement('canvas');
              canvas.width = img.width;
              canvas.height = img.height;
              const ctx = canvas.getContext('2d', { willReadFrequently: true });
              ctx.drawImage(img, 0, 0);
              const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
              const code = jsQR(imageData.data, imageData.width, imageData.height, {
                inversionAttempts: 'attemptBoth',
              });
              if (code && code.data) {
                qrResult = code.data;
              }
            } catch (canvasErr) {
              console.error('Canvas jsQR Decode Error:', canvasErr);
            }
          }

          if (isMountedRef.current) {
            setDecodingImage(false);
          }

          if (qrResult) {
            processStoreAccessData(qrResult);
          } else {
            showNotice(
              'ไม่พบ QR Code',
              'ไม่สามารถตรวจจับ QR Code ในรูปภาพนี้ได้ กรุณาเลือกรูปภาพที่ชัดเจน'
            );
          }
        };

        img.onerror = () => {
          if (isMountedRef.current) {
            setDecodingImage(false);
          }
          showNotice('เกิดข้อผิดพลาด', 'ไม่สามารถโหลดรูปภาพที่เลือกได้');
        };

        img.src = selectedAsset.uri;
      } else {
        if (isMountedRef.current) {
          setDecodingImage(false);
        }
        showNotice(
          'แจ้งเตือน',
          'กรุณาใช้โหมดสแกนด้วยกล้อง หรือคัดลอกลิงก์มาวางในช่องใส่ลิงก์ร้านค้า'
        );
      }
    } catch (err) {
      console.error('Pick QR Image Error:', err);
      if (isMountedRef.current) {
        setDecodingImage(false);
      }
      showNotice('เกิดข้อผิดพลาด', 'ไม่สามารถเลือกรูปภาพได้');
    }
  };

  // Component ย่อย: การ์ดร้านค้าล่าสุด
  const renderRecentStoreBanner = (showBadge = true) => {
    if (!recentStore) return null;
    return (
      <TouchableOpacity
        style={styles.quickStoreCard}
        onPress={() => handleLoginRecentStore(recentStore)}
        disabled={verifying}
        activeOpacity={0.85}
      >
        {showBadge && (
          <View style={styles.quickStoreBadgeRow}>
            <View style={styles.quickPulseDot} />
            <Text style={styles.quickStoreBadgeText}>ร้านที่เข้าทำงานล่าสุด • แตะเพื่อเข้าทันที</Text>
          </View>
        )}
        <View style={styles.quickStoreMainRow}>
          {recentStore.image_url ? (
            <Image source={{ uri: recentStore.image_url }} style={styles.quickStoreLogo} />
          ) : (
            <View style={styles.quickStoreIconBox}>
              <Icon name="storefront-outline" size={24} color={colors.primary} />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.quickStoreName} numberOfLines={1}>
              {recentStore.name}
            </Text>
            <Text style={styles.quickStoreHint}>แตะเพื่อเข้าสู่ระบบร้านนี้ทันที</Text>
          </View>
          <View style={styles.quickEnterBtn}>
            <Text style={styles.quickEnterBtnText}>เข้าร้าน</Text>
            <Icon name="arrow-forward" size={16} color="#FFFFFF" />
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  // Component ย่อย: ส่วนแสดงร้านค้าล่าสุด (ด้านบน หรือ ด้านล่าง)
  const renderRecentStoreSection = (showAsTopBanner = true) => {
    if (!recentStore) return null;
    if (showAsTopBanner) {
      return renderRecentStoreBanner(true);
    }
    return (
      <View style={styles.recentBottomSection}>
        <View style={styles.recentSectionHeader}>
          <Icon name="time-outline" size={16} color={colors.textSecondary} />
          <Text style={styles.recentSectionTitle}>ร้านค้าที่เคยเข้าใช้งานล่าสุด</Text>
        </View>
        {renderRecentStoreBanner(false)}
      </View>
    );
  };

  // Component ย่อย: แท็บเลือกโหมด 3 โหมด (สแกน / แนบรูป / ลิงก์)
  const renderSegmentedTabs = (isBottom = false) => (
    <View style={isBottom ? styles.segmentedBarBottom : styles.segmentedBar}>
      <TouchableOpacity
        style={[styles.segmentBtn, activeTab === 'scan' && styles.segmentBtnActive]}
        onPress={() => {
          setActiveTab('scan');
          setScanned(false);
        }}
        activeOpacity={0.8}
      >
        <Icon
          name="qr-code-outline"
          size={15}
          color={activeTab === 'scan' ? colors.primary : colors.textMuted}
        />
        <Text style={[styles.segmentText, activeTab === 'scan' && styles.segmentTextActive]}>
          สแกน QR
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.segmentBtn, activeTab === 'image' && styles.segmentBtnActive]}
        onPress={() => setActiveTab('image')}
        activeOpacity={0.8}
      >
        <Icon
          name="image-outline"
          size={15}
          color={activeTab === 'image' ? colors.primary : colors.textMuted}
        />
        <Text style={[styles.segmentText, activeTab === 'image' && styles.segmentTextActive]}>
          แนบรูป QR
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.segmentBtn, activeTab === 'link' && styles.segmentBtnActive]}
        onPress={() => setActiveTab('link')}
        activeOpacity={0.8}
      >
        <Icon
          name="link-outline"
          size={15}
          color={activeTab === 'link' ? colors.primary : colors.textMuted}
        />
        <Text style={[styles.segmentText, activeTab === 'link' && styles.segmentTextActive]}>
          ใส่ลิงก์ร้าน
        </Text>
      </TouchableOpacity>
    </View>
  );

  // Component ย่อย: ส่วนอัปโหลดรูปภาพ QR
  const renderImageUploadSection = () => (
    <View style={{ width: '100%' }}>
      <TouchableOpacity
        style={styles.uploadArea}
        onPress={handlePickQRImage}
        activeOpacity={0.8}
      >
        {pickedImageUri ? (
          <View style={styles.previewBox}>
            <Image source={{ uri: pickedImageUri }} style={styles.previewImage} />
            {decodingImage ? (
              <View style={styles.decodingOverlay}>
                <ActivityIndicator size="large" color={colors.textOnPrimary} />
                <Text style={styles.decodingText}>กำลังถอดรหัส QR...</Text>
              </View>
            ) : (
              <Text style={styles.changeImageText}>แตะเพื่อเปลี่ยนรูปภาพใหม่</Text>
            )}
          </View>
        ) : (
          <View style={styles.uploadPlaceholder}>
            <View style={styles.uploadIconCircle}>
              <Icon name="image-outline" size={28} color={colors.primary} />
            </View>
            <Text style={styles.uploadPrompt}>แตะเพื่อเลือกรูปภาพจากอัลบั้ม</Text>
            <Text style={styles.uploadSubPrompt}>ระบบจะสแกนและเข้าร้านให้อัตโนมัติ</Text>
          </View>
        )}
      </TouchableOpacity>
    </View>
  );

  // Component ย่อย: กล่องคำแนะนำสำหรับพนักงาน
  const renderTipsBox = () => (
    <View style={styles.tipsBox}>
      <View style={styles.tipsHeaderRow}>
        <Icon name="information-circle-outline" size={16} color="#B45309" />
        <Text style={styles.tipsTitle}>ข้อแนะนำสำหรับพนักงาน</Text>
      </View>
      <Text style={styles.tipsItem}>
        • ขอ QR Code ได้จากเจ้าของร้านในหน้า "QR พนักงาน" หรือ "จัดการโต๊ะ"
      </Text>
      <Text style={styles.tipsItem}>
        • หากเจ้าของร้านส่งรูป QR ใน LINE ให้บันทึกลงเครื่องแล้วใช้แท็บ "แนบรูป QR"
      </Text>
      <Text style={styles.tipsItem}>
        • หรือให้เจ้าของร้านกด "คัดลอกลิงก์" ส่งมาให้ แล้วนำมาวางในแท็บ "ใส่ลิงก์ร้าน" ได้ทันที
      </Text>
    </View>
  );

  // Component ย่อย: ช่องกรอกลิงก์มาตรฐาน
  const renderLinkInputSection = () => (
    <View style={{ width: '100%' }}>
      <View style={styles.labelRow}>
        <Text style={[styles.fieldLabel, isLinkFocused && styles.fieldLabelFocused]}>
          ลิงก์ร้านค้า หรือรหัสเข้าใช้งาน
        </Text>
        <TouchableOpacity
          style={styles.pasteInlineBtn}
          onPress={handlePasteClipboard}
          activeOpacity={0.7}
        >
          <Icon name="clipboard-outline" size={14} color={colors.primary} />
          <Text style={styles.pasteInlineText}>วางจากคลิปบอร์ด</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.inputBox, isLinkFocused && styles.inputBoxFocused]}>
        <View style={[styles.iconBadge, isLinkFocused && styles.iconBadgeFocused]}>
          <Icon
            name="link-outline"
            size={18}
            color={isLinkFocused ? colors.primary : colors.textMuted}
          />
        </View>
        <TextInput
          style={styles.textInput}
          placeholder="วางลิงก์ https://... หรือรหัส Token"
          placeholderTextColor={colors.textFaint}
          value={inputLink}
          onChangeText={setInputLink}
          onFocus={() => setIsLinkFocused(true)}
          onBlur={() => setIsLinkFocused(false)}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={() => processStoreAccessData(inputLink)}
        />
        {inputLink.length > 0 && (
          <TouchableOpacity
            style={styles.clearBtn}
            onPress={() => setInputLink('')}
            activeOpacity={0.7}
          >
            <Icon name="close-circle" size={17} color={colors.textFaint} />
          </TouchableOpacity>
        )}
      </View>

      <TouchableOpacity
        style={[
          styles.submitBtn,
          { marginTop: 12 },
          (!inputLink.trim() || verifying) && styles.btnDisabled,
        ]}
        onPress={() => processStoreAccessData(inputLink)}
        disabled={!inputLink.trim() || verifying}
        activeOpacity={0.85}
      >
        {verifying ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <View style={styles.btnContentRow}>
            <Icon name="log-in-outline" size={19} color="#FFFFFF" />
            <Text style={styles.submitBtnText}>เข้าสู่ระบบด้วยลิงก์</Text>
          </View>
        )}
      </TouchableOpacity>
    </View>
  );

  // Component ย่อย: กล้องสแกน QR
  const renderCameraScannerBox = () =>
    hasCameraPermission === false ? (
      <View style={styles.permissionBox}>
        <View style={styles.permissionIconWrap}>
          <Icon name="camera-outline" size={28} color={colors.textMuted} />
        </View>
        <Text style={styles.permissionTitle}>ยังไม่ได้รับอนุญาตให้ใช้กล้อง</Text>
        <Text style={styles.permissionDesc}>
          กดอนุญาตกล้องด้านล่าง หรือเลือกใช้วิธี "เลือกรูป QR" / "วางลิงก์ร้าน" แทนได้ทันที
        </Text>
        <TouchableOpacity
          style={styles.permissionBtn}
          onPress={requestCameraPermission}
          activeOpacity={0.85}
        >
          <Icon name="refresh-outline" size={16} color="#FFFFFF" />
          <Text style={styles.permissionBtnText}>ขอสิทธิ์ใช้งานกล้องใหม่</Text>
        </TouchableOpacity>
      </View>
    ) : (
      <View style={styles.cameraBox}>
        <CameraView
          facing={facing}
          onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={styles.scannerOverlay}>
          <View style={styles.scanTargetBox}>
            <View style={styles.cornerTL} />
            <View style={styles.cornerTR} />
            <View style={styles.cornerBL} />
            <View style={styles.cornerBR} />
            {verifying && (
              <View style={styles.verifyingOverlay}>
                <ActivityIndicator size="large" color="#10B981" />
                <Text style={styles.verifyingText}>กำลังตรวจสอบ...</Text>
              </View>
            )}
          </View>
          <Text style={styles.scannerGuideText}>วาง QR Code ให้อยู่ในกรอบสีเขียว</Text>
        </View>

        <TouchableOpacity
          style={styles.switchCameraBtn}
          onPress={() => setFacing(facing === 'back' ? 'front' : 'back')}
        >
          <Icon name="camera-reverse-outline" size={16} color={colors.textOnPrimary} />
          <Text style={styles.switchCameraText}>สลับกล้อง</Text>
        </TouchableOpacity>

        {scanned && !verifying && (
          <TouchableOpacity style={styles.rescanBtn} onPress={() => setScanned(false)}>
            <Text style={styles.rescanBtnText}>แตะเพื่อสแกนใหม่อีกครั้ง</Text>
          </TouchableOpacity>
        )}
      </View>
    );

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.bg} />



      {/* ปุ่มย้อนกลับซ้ายบน */}
      <View style={styles.topBar}>
        <TouchableOpacity
          style={styles.topLeftBackBtn}
          onPress={onBack}
          activeOpacity={0.75}
        >
          <Icon name="chevron-back" size={18} color={colors.textSecondary} />
          <Text style={styles.topLeftBackText}>ย้อนกลับ</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollCenter}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.inner}>
          {/* ส่วนหัวโลโก้ */}
          <View style={styles.brandHeader}>
            <View style={styles.brandLogoBox}>
              <Icon name="restaurant-outline" size={34} color="#FFFFFF" />
            </View>
            <Text style={styles.brandTitle}>BuddyPOS</Text>
            <Text style={styles.brandSub}>เข้าสู่ระบบสำหรับพนักงานหน้าร้าน</Text>
          </View>

          {/* การ์ดหลัก: เนื้อหาโหมด + แท็บสลับโหมดอยู่ด้านล่างของการ์ด */}
          <View style={styles.card}>
            <View style={styles.cardHeaderArea}>
              <Text style={styles.cardModeTitle}>
                {activeTab === 'scan' && 'สแกน QR Code เข้าร้าน'}
                {activeTab === 'image' && 'แนบรูปภาพ QR Code'}
                {activeTab === 'link' && 'ใส่ลิงก์ร้านค้า / รหัส Token'}
              </Text>
              <Text style={styles.cardModeSub}>
                {activeTab === 'scan' && 'เล็งกล้องไปที่ QR Code พนักงาน หรือ QR โต๊ะอาหาร'}
                {activeTab === 'image' && 'เลือกรูป QR Code ที่บันทึกไว้จาก LINE หรืออัลบั้มภาพ'}
                {activeTab === 'link' && 'วางลิงก์ที่ได้รับจากเจ้าของร้านเพื่อเข้าสู่ระบบ'}
              </Text>
            </View>

            {activeTab === 'scan' && renderCameraScannerBox()}
            {activeTab === 'image' && renderImageUploadSection()}
            {activeTab === 'link' && renderLinkInputSection()}

            {/* แท็บสลับโหมด 3 แท็บ วางไว้ด้านล่างของการ์ด (กดสลับด้วยนิ้วโป้งสะดวก) */}
            {renderSegmentedTabs(true)}
          </View>

          {/* แถบร้านค้าที่เคยเข้าใช้งานล่าสุด (วางใต้การ์ด) */}
          {renderRecentStoreSection(false)}

          {/* กล่องคำแนะนำสำหรับพนักงาน */}
          {renderTipsBox()}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },

  topBar: {
    width: '100%',
    paddingHorizontal: spacing.xl,
    paddingTop: 14,
    paddingBottom: 4,
    alignItems: 'flex-start',
  },
  topLeftBackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingLeft: 10,
    paddingRight: 16,
    paddingVertical: 8,
    borderRadius: radius.pill,
    ...shadow.sm,
  },
  topLeftBackText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    marginLeft: 4,
  },
  container: {
    flex: 1,
  },
  scrollCenter: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: 6,
    paddingBottom: 48,
  },
  inner: {
    width: '100%',
    maxWidth: 420,
    alignItems: 'center',
  },

  /* ส่วนหัวโลโก้ */
  brandHeader: {
    alignItems: 'center',
    marginBottom: 22,
  },
  brandLogoBox: {
    width: 66,
    height: 66,
    borderRadius: 18,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    ...shadow.raised,
  },
  brandTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.4,
    textAlign: 'center',
  },
  brandSub: {
    fontSize: 14,
    color: colors.textMuted,
    marginTop: 4,
    textAlign: 'center',
  },

  /* การ์ดร้านที่เคยเข้าล่าสุด (วางบนสุดให้กดง่าย) */
  quickStoreCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: colors.primary,
    ...shadow.card,
  },
  quickStoreBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  quickPulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  quickStoreBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primaryDark,
  },
  quickStoreMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  quickStoreLogo: {
    width: 48,
    height: 48,
    borderRadius: 12,
    marginRight: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickStoreIconBox: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  quickStoreName: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.text,
  },
  quickStoreHint: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  quickEnterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    marginLeft: 8,
  },
  quickEnterBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  /* การ์ดหลัก */
  card: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: 20,
    paddingVertical: 24,
    paddingHorizontal: 22,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  sectionHeaderTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
  },
  sectionHeaderSub: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 18,
  },


  /* แถบสลับโหมด 3 แท็บ (แบบที่ 3) */
  segmentedBar: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceSubtle,
    padding: 4,
    borderRadius: 12,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: colors.border,
  },
  segmentBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 9,
    gap: 5,
  },
  segmentBtnActive: {
    backgroundColor: '#FFFFFF',
    ...shadow.sm,
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
  },
  segmentTextActive: {
    color: colors.text,
    fontWeight: '700',
  },

  /* กล้องสแกน */
  cameraBox: {
    height: 270,
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#000000',
  },
  scannerOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  scanTargetBox: {
    width: 180,
    height: 180,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    position: 'relative',
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cornerTL: {
    position: 'absolute',
    top: -2,
    left: -2,
    width: 28,
    height: 28,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderColor: '#10B981',
    borderTopLeftRadius: radius.lg,
  },
  cornerTR: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 28,
    height: 28,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderColor: '#10B981',
    borderTopRightRadius: radius.lg,
  },
  cornerBL: {
    position: 'absolute',
    bottom: -2,
    left: -2,
    width: 28,
    height: 28,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderColor: '#10B981',
    borderBottomLeftRadius: radius.lg,
  },
  cornerBR: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 28,
    height: 28,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderColor: '#10B981',
    borderBottomRightRadius: radius.lg,
  },
  verifyingOverlay: {
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: radius.md,
    padding: spacing.lg,
    alignItems: 'center',
  },
  verifyingText: {
    color: colors.textOnPrimary,
    fontSize: fontSize.sm,
    marginTop: 8,
    fontWeight: '700',
  },
  scannerGuideText: {
    color: colors.textOnPrimary,
    fontSize: fontSize.sm,
    marginTop: spacing.lg,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: radius.md,
  },
  switchCameraBtn: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  switchCameraText: {
    color: colors.textOnPrimary,
    fontSize: fontSize.sm,
    fontWeight: '700',
    marginLeft: 4,
  },
  rescanBtn: {
    position: 'absolute',
    bottom: 12,
    alignSelf: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: 8,
    borderRadius: radius.pill,
  },
  rescanBtnText: {
    color: colors.textOnPrimary,
    fontSize: fontSize.sm + 1,
    fontWeight: '700',
  },

  /* กล่องขอสิทธิ์กล้อง */
  permissionBox: {
    paddingVertical: 24,
    paddingHorizontal: 18,
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  permissionIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  permissionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
  },
  permissionDesc: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 19,
  },
  permissionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 14,
    backgroundColor: colors.primary,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 12,
  },
  permissionBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },

  /* ช่องใส่ลิงก์ */
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  fieldLabelFocused: {
    color: colors.primary,
  },
  pasteInlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  pasteInlineText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 50,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 10,
  },
  inputBoxFocused: {
    backgroundColor: '#FFFFFF',
    borderColor: colors.primary,
    ...Platform.select({
      web: {
        boxShadow: '0 0 0 3px rgba(5, 150, 105, 0.12)',
      },
      default: {},
    }),
  },
  iconBadge: {
    width: 34,
    height: 34,
    borderRadius: 9,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: colors.borderLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  iconBadgeFocused: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primaryBorder,
  },
  textInput: {
    flex: 1,
    height: '100%',
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
    ...Platform.select({
      web: {
        outlineStyle: 'none',
      },
      default: {},
    }),
  },
  clearBtn: {
    paddingHorizontal: 6,
    paddingVertical: 6,
  },
  submitBtn: {
    height: 50,
    backgroundColor: colors.primary,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.sm,
  },
  btnContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  btnDisabled: {
    backgroundColor: colors.textFaint,
    opacity: 0.7,
  },

  /* อัปโหลดรูป */
  uploadArea: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.primaryBorder,
    borderRadius: 16,
    backgroundColor: colors.primarySoft,
    padding: 22,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 160,
  },
  uploadPlaceholder: {
    alignItems: 'center',
  },
  uploadIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  uploadPrompt: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.primaryDeep,
  },
  uploadSubPrompt: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 4,
  },
  previewBox: {
    alignItems: 'center',
    position: 'relative',
  },
  previewImage: {
    width: 130,
    height: 130,
    borderRadius: 12,
  },
  decodingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
  },
  decodingText: {
    color: colors.textOnPrimary,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 6,
  },
  changeImageText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 8,
  },


  /* แท็บสลับโหมดอยู่ด้านล่างของการ์ด */
  segmentedBarBottom: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.md,
    padding: 4,
    marginTop: spacing.lg,
    width: '100%',
    borderWidth: 1,
    borderColor: colors.borderLight,
  },

  /* หัวข้อโหมดภายในการ์ด */
  cardHeaderArea: {
    width: '100%',
    marginBottom: spacing.md,
    alignItems: 'center',
  },
  cardModeTitle: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  cardModeSub: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    textAlign: 'center',
  },

  /* ส่วนร้านค้าล่าสุดเมื่อวางด้านล่าง */
  recentBottomSection: {
    width: '100%',
    marginTop: spacing.lg,
  },
  recentSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: spacing.sm,
    paddingHorizontal: 4,
  },
  recentSectionTitle: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textSecondary,
  },

  /* กล่องคำแนะนำสำหรับพนักงาน */
  tipsBox: {
    width: '100%',
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: radius.lg,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  tipsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  tipsTitle: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: '#92400E',
  },
  tipsItem: {
    fontSize: 11,
    color: '#B45309',
    lineHeight: 17,
    marginTop: 2,
  },
});
