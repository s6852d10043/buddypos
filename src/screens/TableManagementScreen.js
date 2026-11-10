// src/screens/TableManagementScreen.js
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
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { supabase } from '../lib/supabase';
import Icon from '../theme/Icon';
import { colors, spacing, radius, fontSize, shadow } from '../theme';

export default function TableManagementScreen({ store, onBack }) {
  const restaurantId = store?.restaurantId || store?.id;
  const [restaurantName, setRestaurantName] = useState(
    store?.restaurantName || store?.name || 'ร้านค้าของคุณ'
  );
  const [storeLogoUrl, setStoreLogoUrl] = useState(store?.image_url || null);

  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);

  // State สำหรับ Modal เพิ่ม/แก้ไขเดี่ยว
  const [singleModalVisible, setSingleModalVisible] = useState(false);
  const [editingTable, setEditingTable] = useState(null);
  const [tableNumber, setTableNumber] = useState('');

  // State สำหรับ Modal สร้างทีละหลายโต๊ะ
  const [bulkModalVisible, setBulkModalVisible] = useState(false);
  const [bulkCount, setBulkCount] = useState('5');
  const [prefix, setPrefix] = useState('โต๊ะ ');

  // State สำหรับ Modal แสดง QR Code ประจำโต๊ะ
  const [qrModalVisible, setQrModalVisible] = useState(false);
  const [selectedTableForQr, setSelectedTableForQr] = useState(null);

  // State ใหม่: ระบบพิมพ์ QR Code / บาร์โค้ด
  const [printModalVisible, setPrintModalVisible] = useState(false);
  const [selectedTableIds, setSelectedTableIds] = useState([]);
  const [printWidthCm, setPrintWidthCm] = useState('5'); // ขนาดความกว้าง (cm)
  const [printHeightCm, setPrintHeightCm] = useState('5'); // ขนาดความสูง (cm)

  const [submitting, setSubmitting] = useState(false);

  // Synchronous locks & lifecycle guards
  const isMountedRef = useRef(true);
  const isSavingTableRef = useRef(false);
  const isBulkAddingRef = useRef(false);
  const isDeletingTableRef = useRef(false);
  const isResettingQrRef = useRef(false);

  const BASE_ORDER_URL = Platform.OS === 'web' && typeof window !== 'undefined'
    ? `${window.location.origin}`
    : 'https://buddypos-beta.vercel.app';

  const generateUniqueToken = () => {
    return Math.random().toString(36).substring(2, 10) + Date.now().toString(36).slice(-4);
  };

  const getTableUrl = (table) => {
    if (!table) return '';
    const token = table.qr_token || table.id;
    return `${BASE_ORDER_URL}?token=${token}`;
  };

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (restaurantId) {
      fetchStoreInfo();
      fetchTables();
    }
  }, [restaurantId]);

  const fetchStoreInfo = async () => {
    try {
      const { data } = await supabase
        .from('restaurants')
        .select('name, image_url')
        .eq('id', restaurantId)
        .maybeSingle();
      if (!isMountedRef.current) return;
      if (data?.name) setRestaurantName(data.name);
      if (data?.image_url !== undefined) setStoreLogoUrl(data.image_url || null);
    } catch (e) {
      console.warn('Fetch store info error:', e);
    }
  };

  const fetchTables = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('tables')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      if (isMountedRef.current) {
        setTables(data || []);
      }
    } catch (error) {
      console.error('Fetch Tables Error:', error);
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  };

  const openSingleModal = (table = null) => {
    if (table) {
      setEditingTable(table);
      setTableNumber(table.table_number);
    } else {
      setEditingTable(null);
      setTableNumber('');
    }
    setSingleModalVisible(true);
  };

  const openQrModal = (table) => {
    setSelectedTableForQr(table);
    setQrModalVisible(true);
  };

  // เปิด Modal เลือกพิมพ์โต๊ะ
  const openPrintModal = (table = null) => {
    if (table) {
      setSelectedTableIds([table.id]);
    } else {
      // ค่าเริ่มต้นเลือกทุกโต๊ะ
      setSelectedTableIds(tables.map((t) => t.id));
    }
    setPrintModalVisible(true);
  };

  const toggleSelectTable = (id) => {
    if (selectedTableIds.includes(id)) {
      setSelectedTableIds(selectedTableIds.filter((tId) => tId !== id));
    } else {
      setSelectedTableIds([...selectedTableIds, id]);
    }
  };

  const toggleSelectAll = () => {
    if (selectedTableIds.length === tables.length) {
      setSelectedTableIds([]);
    } else {
      setSelectedTableIds(tables.map((t) => t.id));
    }
  };

  const handleSaveSingleTable = async () => {
    if (isSavingTableRef.current) return;

    const trimmed = tableNumber.trim();
    if (!trimmed) {
      const msg = 'กรุณากรอกชื่อหรือหมายเลขโต๊ะ';
      if (Platform.OS === 'web') alert(msg);
      else Alert.alert('คำเตือน', msg);
      return;
    }

    const isDuplicate = tables.some((t) => {
      if (editingTable && t.id === editingTable.id) return false;
      return (t.table_number || '').trim().toLowerCase() === trimmed.toLowerCase();
    });

    if (isDuplicate) {
      const msg = `หมายเลขหรือชื่อโต๊ะ "${trimmed}" มีอยู่ในระบบแล้ว กรุณาใช้ชื่ออื่น`;
      if (Platform.OS === 'web') alert(msg);
      else Alert.alert('ชื่อโต๊ะซ้ำ', msg);
      return;
    }

    try {
      isSavingTableRef.current = true;
      setSubmitting(true);
      if (editingTable) {
        const { error } = await supabase
          .from('tables')
          .update({ table_number: trimmed })
          .eq('id', editingTable.id);

        if (error) throw error;
      } else {
        const { error } = await supabase.from('tables').insert([
          {
            restaurant_id: restaurantId,
            table_number: trimmed,
            status: 'available',
            qr_token: generateUniqueToken(),
          },
        ]);

        if (error) throw error;
      }

      if (isMountedRef.current) {
        setSingleModalVisible(false);
        fetchTables();
      }
    } catch (error) {
      console.error('Save Table Error:', error);
      const errorMsg = error.message || 'ไม่สามารถบันทึกข้อมูลได้';
      if (Platform.OS === 'web') alert(errorMsg);
      else Alert.alert('เกิดข้อผิดพลาด', errorMsg);
    } finally {
      isSavingTableRef.current = false;
      if (isMountedRef.current) {
        setSubmitting(false);
      }
    }
  };

  const handleBulkCreateTables = async () => {
    if (isBulkAddingRef.current) return;

    const count = parseInt(bulkCount, 10);
    if (isNaN(count) || count <= 0) {
      const msg = 'กรุณาระบุจำนวนโต๊ะที่ถูกต้อง';
      if (Platform.OS === 'web') alert(msg);
      else Alert.alert('คำเตือน', msg);
      return;
    }

    try {
      isBulkAddingRef.current = true;
      setSubmitting(true);
      const currentTotal = tables.length;
      const newTables = [];

      for (let i = 1; i <= count; i++) {
        const nextNumber = currentTotal + i;
        newTables.push({
          restaurant_id: restaurantId,
          table_number: `${prefix}${nextNumber}`,
          status: 'available',
          qr_token: generateUniqueToken(),
        });
      }

      const { error } = await supabase.from('tables').insert(newTables);
      if (error) throw error;

      if (isMountedRef.current) {
        setBulkModalVisible(false);
        fetchTables();
      }
    } catch (error) {
      console.error('Bulk Create Error:', error);
      const errorMsg = error.message || 'ไม่สามารถสร้างโต๊ะได้';
      if (Platform.OS === 'web') alert(errorMsg);
      else Alert.alert('เกิดข้อผิดพลาด', errorMsg);
    } finally {
      isBulkAddingRef.current = false;
      if (isMountedRef.current) {
        setSubmitting(false);
      }
    }
  };

  const handleDeleteTable = (table) => {
    if (isDeletingTableRef.current) return;

    if (table.status === 'occupied') {
      const msg = `ไม่สามารถลบ ${table.table_number} ได้ เนื่องจากกำลังมีลูกค้าใช้งานอยู่ (กรุณาเช็กบิลหรือเคลียร์โต๊ะก่อนลบ)`;
      if (Platform.OS === 'web') alert(msg);
      else Alert.alert('ไม่สามารถลบโต๊ะได้', msg);
      return;
    }

    const confirmAction = async () => {
      if (isDeletingTableRef.current) return;
      try {
        isDeletingTableRef.current = true;
        setLoading(true);
        const { error } = await supabase
          .from('tables')
          .delete()
          .eq('id', table.id);

        if (error) throw error;
        if (isMountedRef.current) {
          fetchTables();
        }
      } catch (error) {
        console.error('Delete Table Error:', error);
      } finally {
        isDeletingTableRef.current = false;
        if (isMountedRef.current) {
          setLoading(false);
        }
      }
    };

    if (Platform.OS === 'web') {
      if (confirm(`คุณต้องการลบ "${table.table_number}" ใช่หรือไม่?`)) {
        confirmAction();
      }
    } else {
      Alert.alert('ยืนยันการลบ', `คุณต้องการลบ "${table.table_number}" ใช่หรือไม่?`, [
        { text: 'ยกเลิก', style: 'cancel' },
        { text: 'ลบ', style: 'destructive', onPress: confirmAction },
      ]);
    }
  };

  const handleRegenerateToken = async (table) => {
    if (isResettingQrRef.current) return;

    const confirmAction = async () => {
      if (isResettingQrRef.current) return;
      try {
        isResettingQrRef.current = true;
        setSubmitting(true);
        const newToken = generateUniqueToken();

        const { error } = await supabase
          .from('tables')
          .update({ qr_token: newToken })
          .eq('id', table.id);

        if (error) throw error;

        const updatedTable = { ...table, qr_token: newToken };
        if (isMountedRef.current) {
          setSelectedTableForQr(updatedTable);
          fetchTables();
        }

        const msg = 'เปลี่ยนลิงก์ QR Code ใหม่เรียบร้อยแล้ว (ลิงก์เก่าจะไม่สามารถใช้งานได้อีก)';
        if (Platform.OS === 'web') alert(msg);
        else Alert.alert('สำเร็จ', msg);

      } catch (error) {
        console.error('Regenerate Token Error:', error);
        const errorMsg = error.message || 'ไม่สามารถเปลี่ยนลิงก์ได้';
        if (Platform.OS === 'web') alert(errorMsg);
        else Alert.alert('เกิดข้อผิดพลาด', errorMsg);
      } finally {
        isResettingQrRef.current = false;
        if (isMountedRef.current) {
          setSubmitting(false);
        }
      }
    };

    if (Platform.OS === 'web') {
      if (confirm(`คุณต้องการรีเซ็ตและสร้างลิงก์ใหม่สำหรับ "${table.table_number}" ใช่หรือไม่?\n\n* QR Code หรือลิงก์เก่าที่เคยปริ้นท์ไว้จะใช้ไม่ได้ทันที`)) {
        confirmAction();
      }
    } else {
      Alert.alert(
        'ยืนยันการเปลี่ยน QR Code',
        `คุณต้องการรีเซ็ตและสร้างลิงก์ใหม่สำหรับ "${table.table_number}" ใช่หรือไม่?\n\n(QR Code เก่าที่เคยปริ้นท์ไว้จะใช้ไม่ได้ทันที)`,
        [
          { text: 'ยกเลิก', style: 'cancel' },
          { text: 'เปลี่ยนลิงก์ใหม่', style: 'destructive', onPress: confirmAction },
        ]
      );
    }
  };

  const copyTableUrl = (table) => {
    const url = getTableUrl(table);
    if (Platform.OS === 'web' && navigator?.clipboard) {
      navigator.clipboard.writeText(url);
      alert('คัดลอกลิงก์เรียบร้อยแล้ว!');
    } else {
      Alert.alert('สำเร็จ', 'คัดลอกลิงก์เรียบร้อยแล้ว!');
    }
  };

  // ฟังก์ชันคำสั่งพิมพ์ระบบ QR Code (รองรับ Web Print)
  const handleExecutePrint = () => {
    const selectedTables = tables.filter((t) => selectedTableIds.includes(t.id));

    if (selectedTables.length === 0) {
      const msg = 'กรุณาเลือกอย่างน้อย 1 โต๊ะเพื่อทำการพิมพ์';
      if (Platform.OS === 'web') alert(msg);
      else Alert.alert('คำเตือน', msg);
      return;
    }

    const wCm = parseFloat(printWidthCm) || 5;
    const hCm = parseFloat(printHeightCm) || 5;

    if (Platform.OS === 'web') {
      // สร้างหน้าต่างพิมพ์สำหรับ Web
      const printWindow = window.open('', '_blank');
      let qrCardsHtml = '';

      const showCenterLogo = Boolean(storeLogoUrl);

      selectedTables.forEach((table) => {
        const url = getTableUrl(table);
        const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&ecc=H&data=${encodeURIComponent(url)}`;
        
        qrCardsHtml += `
          <div class="qr-card" style="width: ${wCm}cm; height: ${hCm}cm;">
            <div class="store-name">${restaurantName}</div>
            <div class="table-name">${table.table_number}</div>
            <div class="qr-wrap">
              <img src="${qrApiUrl}" class="qr-img" />
              ${showCenterLogo ? `<div class="center-logo-box"><img src="${storeLogoUrl}" class="center-logo-img" /></div>` : ''}
            </div>
            <div class="scan-tip">สแกนเพื่อสั่งอาหาร</div>
          </div>
        `;
      });

      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>พิมพ์ QR Code โต๊ะอาหาร</title>
            <style>
              @page { margin: 10mm; }
              body {
                font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
                margin: 0;
                padding: 10px;
                display: flex;
                flex-wrap: wrap;
                gap: 15px;
                background-color: #ffffff;
              }
              .qr-card {
                border: 2px dashed #333;
                border-radius: 8px;
                padding: 8px;
                box-sizing: border-box;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: space-between;
                text-align: center;
                page-break-inside: avoid;
              }
              .top-store-logo {
                width: 28px;
                height: 28px;
                border-radius: 6px;
                object-fit: cover;
                border: 1px solid #e2e8f0;
              }
              .store-name {
                font-size: 10pt;
                color: #555;
                font-weight: bold;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                max-width: 100%;
              }
              .table-name {
                font-size: 14pt;
                font-weight: bold;
                color: #000;
                margin: 2px 0;
              }
              .qr-wrap {
                position: relative;
                width: 68%;
                max-height: 56%;
                display: flex;
                align-items: center;
                justify-content: center;
              }
              .qr-img {
                width: 100%;
                height: auto;
                max-height: 100%;
                object-fit: contain;
              }
              .center-logo-box {
                position: absolute;
                width: 24%;
                height: 24%;
                background: #ffffff;
                border-radius: 6px;
                padding: 2px;
                display: flex;
                align-items: center;
                justify-content: center;
                box-sizing: border-box;
              }
              .center-logo-img {
                width: 100%;
                height: 100%;
                border-radius: 4px;
                object-fit: cover;
              }
              .scan-tip {
                font-size: 8pt;
                color: #666;
              }
            </style>
          </head>
          <body>
            ${qrCardsHtml}
            <script>
              window.onload = function() {
                setTimeout(function() {
                  window.print();
                  window.close();
                }, 600);
              };
            </script>
          </body>
        </html>
      `);
      printWindow.document.close();
    } else {
      Alert.alert(
        'สั่งพิมพ์',
        `เตรียมพิมพ์ ${selectedTables.length} โต๊ะ\nขนาด: ${wCm} x ${hCm} cm\n(ระบบพิมพ์ผ่านแอพมือถือสามารถเชื่อมต่อเครื่องพิมพ์ Thermal/Bluetooth ได้ที่นี่)`
      );
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.surface} />
      
      {/* Header */}
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
              <Icon name="grid-outline" size={20} color={colors.primary} />
              <Text style={styles.sectionTitle}>จัดการโต๊ะในร้าน</Text>
            </View>
            <Text style={styles.subTitle}>จำนวนโต๊ะทั้งหมด: {tables.length} โต๊ะ</Text>
          </View>
          
          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.printHeaderBtn} onPress={() => openPrintModal()}>
              <Icon name="print-outline" size={16} color={colors.textOnPrimary} />
              <Text style={styles.printHeaderBtnText}>พิมพ์ QR โต๊ะ</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.addBulkBtn} onPress={() => setBulkModalVisible(true)}>
              <Icon name="add-circle-outline" size={16} color={colors.textOnPrimary} />
              <Text style={styles.addBulkBtnText}>สร้างหลายโต๊ะ</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.addSingleBtn} onPress={() => openSingleModal()}>
              <Icon name="add" size={16} color={colors.textSecondary} />
              <Text style={styles.addSingleBtnText}>เพิ่มเดี่ยว</Text>
            </TouchableOpacity>
          </View>
        </View>

        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginVertical: 30 }} />
        ) : tables.length === 0 ? (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIconWrap}>
              <Icon name="grid-outline" size={28} color={colors.textFaint} />
            </View>
            <Text style={styles.emptyText}>ยังไม่มีโต๊ะในระบบ</Text>
            <TouchableOpacity style={styles.addBtnModal} onPress={() => setBulkModalVisible(true)}>
              <Icon name="add" size={16} color={colors.textOnPrimary} />
              <Text style={styles.addBtnModalText}>สร้างโต๊ะแบบรวดเร็ว</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.gridContainer}>
            {tables.map((item) => (
              <View key={item.id} style={styles.tableCard}>
                <View style={styles.tableCardHeader}>
                  <Text style={styles.tableName}>{item.table_number}</Text>
                  <View
                    style={[
                      styles.statusBadge,
                      { backgroundColor: item.status === 'occupied' ? colors.dangerSoft : colors.successSoft },
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusText,
                        { color: item.status === 'occupied' ? colors.danger : colors.primary },
                      ]}
                    >
                      {item.status === 'occupied' ? 'มีลูกค้า' : 'ว่าง'}
                    </Text>
                  </View>
                </View>

                {/* ปุ่มเปิดดู QR Code ประจำโต๊ะ */}
                <TouchableOpacity
                  style={styles.qrBtn}
                  onPress={() => openQrModal(item)}
                  activeOpacity={0.7}
                >
                  <Icon name="qr-code-outline" size={15} color={colors.textSecondary} />
                  <Text style={styles.qrBtnText}>ดู QR Code / ลิงก์</Text>
                </TouchableOpacity>

                <View style={styles.cardActions}>
                  <TouchableOpacity style={styles.actionBtnEdit} onPress={() => openSingleModal(item)}>
                    <Icon name="create-outline" size={14} color={colors.info} />
                    <Text style={styles.actionBtnEditText}>แก้ไข</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.actionBtnPrint} onPress={() => openPrintModal(item)}>
                    <Icon name="print-outline" size={14} color={colors.primary} />
                    <Text style={styles.actionBtnPrintText}>พิมพ์</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.actionBtnDelete} onPress={() => handleDeleteTable(item)}>
                    <Icon name="trash-outline" size={14} color={colors.danger} />
                    <Text style={styles.actionBtnDeleteText}>ลบ</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* ------------------------------------------------------------- */}
      {/* MODAL 1: แสดง QR Code ประจำโต๊ะ */}
      {/* ------------------------------------------------------------- */}
      <Modal visible={qrModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { alignItems: 'center' }]}>
            <View style={styles.modalTitleRow}>
              <Icon name="qr-code-outline" size={20} color={colors.primary} />
              <Text style={styles.modalTitle}>QR Code สั่งอาหาร</Text>
            </View>
            <Text style={styles.qrStoreNameText}>ร้าน: {restaurantName}</Text>
            <Text style={styles.qrTableName}>{selectedTableForQr?.table_number}</Text>

            {selectedTableForQr && (
              <View style={styles.qrContainer}>
                <View style={styles.qrInnerWrap}>
                  <QRCode
                    value={getTableUrl(selectedTableForQr)}
                    size={180}
                    ecl="H"
                  />
                  {storeLogoUrl && (
                    <View style={styles.qrCenterLogoBadge}>
                      <Image source={{ uri: storeLogoUrl }} style={styles.qrCenterLogoImg} />
                    </View>
                  )}
                </View>
              </View>
            )}

            <Text style={styles.urlLabel}>ลิงก์ประจำโต๊ะ (ปลอดภัยสูง):</Text>
            <Text style={styles.urlText} numberOfLines={2}>
              {getTableUrl(selectedTableForQr)}
            </Text>

            <View style={{ flexDirection: 'row', gap: 8, width: '100%', marginBottom: 8 }}>
              <TouchableOpacity
                style={[styles.copyBtn, { flex: 1, marginBottom: 0 }]}
                onPress={() => copyTableUrl(selectedTableForQr)}
              >
                <Icon name="copy-outline" size={16} color={colors.textOnPrimary} />
                <Text style={styles.copyBtnText}>คัดลอกลิงก์</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.copyBtn, { flex: 1, marginBottom: 0, backgroundColor: colors.primary }]}
                onPress={() => {
                  setQrModalVisible(false);
                  openPrintModal(selectedTableForQr);
                }}
              >
                <Icon name="print-outline" size={16} color={colors.textOnPrimary} />
                <Text style={styles.copyBtnText}>สั่งพิมพ์</Text>
              </TouchableOpacity>
            </View>

            {/* ปุ่มกดสุ่ม / เปลี่ยนลิงก์โต๊ะใหม่ */}
            <TouchableOpacity
              style={styles.resetTokenBtn}
              onPress={() => handleRegenerateToken(selectedTableForQr)}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color={colors.warning} size="small" />
              ) : (
                <View style={styles.resetTokenRow}>
                  <Icon name="refresh-outline" size={16} color={colors.warning} />
                  <Text style={styles.resetTokenBtnText}>สร้าง QR Code / ลิงก์ใหม่</Text>
                </View>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.closeQrBtn}
              onPress={() => setQrModalVisible(false)}
            >
              <Text style={styles.closeQrBtnText}>ปิดหน้าต่าง</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ------------------------------------------------------------- */}
      {/* MODAL 4 (NEW): ตั้งค่าและเลือโต๊ะที่จะพิมพ์ QR Code / บาร์โค้ด */}
      {/* ------------------------------------------------------------- */}
      <Modal visible={printModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalTitleRow}>
              <Icon name="print-outline" size={20} color={colors.primary} />
              <Text style={styles.modalTitle}>พิมพ์ QR Code ประจำโต๊ะ</Text>
            </View>

            {/* ส่วนที่ 1: ตั้งค่าขนาดรูปภาพพิมพ์ (cm) */}
            <Text style={styles.inputLabel}>กำหนดขนาดภาพพิมพ์ (หน่วย: ซม. / cm)</Text>
            <View style={styles.dimensionRow}>
              <View style={styles.dimensionInputContainer}>
                <Text style={styles.dimensionUnitLabel}>กว้าง (Width):</Text>
                <TextInput
                  style={styles.dimensionInput}
                  keyboardType="numeric"
                  value={printWidthCm}
                  onChangeText={setPrintWidthCm}
                  placeholder="5"
                />
                <Text style={styles.unitText}>cm</Text>
              </View>

              <Text style={{ alignSelf: 'center', fontWeight: '700', color: colors.textMuted }}>×</Text>

              <View style={styles.dimensionInputContainer}>
                <Text style={styles.dimensionUnitLabel}>สูง (Height):</Text>
                <TextInput
                  style={styles.dimensionInput}
                  keyboardType="numeric"
                  value={printHeightCm}
                  onChangeText={setPrintHeightCm}
                  placeholder="5"
                />
                <Text style={styles.unitText}>cm</Text>
              </View>
            </View>

            {/* ปุ่มลัดเลือกขนาดมาตรฐาน */}
            <View style={styles.presetContainer}>
              {[
                { label: '5x5 cm', w: '5', h: '5' },
                { label: '7x7 cm', w: '7', h: '7' },
                { label: '10x10 cm', w: '10', h: '10' },
                { label: '8x5 cm', w: '8', h: '5' },
              ].map((item) => (
                <TouchableOpacity
                  key={item.label}
                  style={styles.presetBtn}
                  onPress={() => {
                    setPrintWidthCm(item.w);
                    setPrintHeightCm(item.h);
                  }}
                >
                  <Text style={styles.presetBtnText}>{item.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* ส่วนที่ 2: เลือกโต๊ะที่ต้องการพิมพ์ */}
            <View style={styles.selectTableHeader}>
              <Text style={styles.inputLabel}>เลือกโต๊ะที่ต้องการพิมพ์ ({selectedTableIds.length}/{tables.length})</Text>
              <TouchableOpacity onPress={toggleSelectAll}>
                <Text style={styles.selectAllText}>
                  {selectedTableIds.length === tables.length ? 'ยกเลิกทั้งหมด' : 'เลือกทั้งหมด'}
                </Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.tableSelectList}>
              <View style={styles.checkboxGrid}>
                {tables.map((table) => {
                  const isSelected = selectedTableIds.includes(table.id);
                  return (
                    <TouchableOpacity
                      key={table.id}
                      style={[styles.checkboxCard, isSelected && styles.checkboxCardSelected]}
                      onPress={() => toggleSelectTable(table.id)}
                    >
                      <Icon
                        name={isSelected ? 'checkbox' : 'square-outline'}
                        size={16}
                        color={isSelected ? colors.primary : colors.textMuted}
                      />
                      <Text style={[styles.checkboxText, isSelected && styles.checkboxTextSelected]}>
                        {table.table_number}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>

            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setPrintModalVisible(false)}>
                <Text style={styles.cancelBtnText}>ยกเลิก</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.printExecuteBtn} onPress={handleExecutePrint}>
                <Icon name="print-outline" size={16} color={colors.textOnPrimary} />
                <Text style={styles.printExecuteBtnText}>ยืนยันสั่งพิมพ์</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ------------------------------------------------------------- */}
      {/* MODAL 2: สร้างหลายโต๊ะ (Bulk Create) */}
      {/* ------------------------------------------------------------- */}
      <Modal visible={bulkModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalTitleRow}>
              <Icon name="flash-outline" size={20} color={colors.primary} />
              <Text style={styles.modalTitle}>สร้างโต๊ะหลายตัวอัตโนมัติ</Text>
            </View>
            
            <Text style={styles.inputLabel}>เลือกจำนวนโต๊ะที่ต้องการสร้าง</Text>
            <View style={styles.quickSelectContainer}>
              {['1', '5', '10', '15', '20'].map((num) => (
                <TouchableOpacity
                  key={num}
                  style={[styles.quickSelectBtn, bulkCount === num && styles.quickSelectBtnActive]}
                  onPress={() => setBulkCount(num)}
                >
                  <Text style={[styles.quickSelectText, bulkCount === num && styles.quickSelectTextActive]}>
                    {num} โต๊ะ
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.inputLabel}>หรือกรอกจำนวนเอง</Text>
            <TextInput
              style={styles.input}
              placeholder="ระบุจำนวนโต๊ะ"
              placeholderTextColor={colors.textFaint}
              keyboardType="numeric"
              value={bulkCount}
              onChangeText={setBulkCount}
            />

            <Text style={styles.inputLabel}>คำนำหน้าชื่อโต๊ะ</Text>
            <TextInput
              style={styles.input}
              placeholder="เช่น โต๊ะ , T-"
              placeholderTextColor={colors.textFaint}
              value={prefix}
              onChangeText={setPrefix}
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setBulkModalVisible(false)}>
                <Text style={styles.cancelBtnText}>ยกเลิก</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.saveBtn} onPress={handleBulkCreateTables} disabled={submitting}>
                {submitting ? <ActivityIndicator color={colors.textOnPrimary} size="small" /> : <Text style={styles.saveBtnText}>ยืนยันสร้าง</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ------------------------------------------------------------- */}
      {/* MODAL 3: เพิ่มเดี่ยว / แก้ไข */}
      {/* ------------------------------------------------------------- */}
      <Modal visible={singleModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalTitleRow}>
              <Icon
                name={editingTable ? 'create-outline' : 'add-circle-outline'}
                size={20}
                color={colors.primary}
              />
              <Text style={styles.modalTitle}>
                {editingTable ? 'แก้ไขข้อมูลโต๊ะ' : 'เพิ่มโต๊ะใหม่'}
              </Text>
            </View>

            <Text style={styles.inputLabel}>ชื่อ / หมายเลขโต๊ะ</Text>
            <TextInput
              style={styles.input}
              placeholder="เช่น T-01, โต๊ะ 1, VIP 1"
              placeholderTextColor={colors.textFaint}
              value={tableNumber}
              onChangeText={setTableNumber}
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setSingleModalVisible(false)}>
                <Text style={styles.cancelBtnText}>ยกเลิก</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.saveBtn} onPress={handleSaveSingleTable} disabled={submitting}>
                {submitting ? <ActivityIndicator color={colors.textOnPrimary} size="small" /> : <Text style={styles.saveBtnText}>บันทึก</Text>}
              </TouchableOpacity>
            </View>
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
  sectionHeader: { marginBottom: spacing.xl },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center' },
  sectionTitle: { fontSize: fontSize.lg + 2, fontWeight: '700', color: colors.text, marginLeft: 6 },
  subTitle: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2, marginBottom: spacing.md },
  
  headerActions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  printHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.info,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radius.sm,
  },
  printHeaderBtnText: { color: colors.textOnPrimary, fontWeight: '700', fontSize: fontSize.sm + 1, marginLeft: 4 },
  addBulkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radius.sm,
  },
  addBulkBtnText: { color: colors.textOnPrimary, fontWeight: '700', fontSize: fontSize.sm + 1, marginLeft: 4 },
  addSingleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radius.sm,
  },
  addSingleBtnText: { color: colors.textSecondary, fontWeight: '700', fontSize: fontSize.sm + 1, marginLeft: 4 },

  gridContainer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  tableCard: {
    width: '48%',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  tableCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  tableName: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text },
  statusBadge: { paddingVertical: 2, paddingHorizontal: 8, borderRadius: radius.pill },
  statusText: { fontSize: 10, fontWeight: '700' },

  qrBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    paddingVertical: 8,
    borderRadius: radius.sm,
    marginBottom: 10,
  },
  qrBtnText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.textSecondary, marginLeft: 6 },

  cardActions: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8 },
  actionBtnEdit: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4, paddingHorizontal: 4 },
  actionBtnEditText: { color: colors.info, fontSize: 11, fontWeight: '600', marginLeft: 3 },
  actionBtnPrint: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4, paddingHorizontal: 4 },
  actionBtnPrintText: { color: colors.primary, fontSize: 11, fontWeight: '600', marginLeft: 3 },
  actionBtnDelete: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4, paddingHorizontal: 4 },
  actionBtnDeleteText: { color: colors.danger, fontSize: 11, fontWeight: '600', marginLeft: 3 },

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

  // Modal Styles
  modalOverlay: { flex: 1, backgroundColor: 'rgba(17, 24, 39, 0.5)', justifyContent: 'center', alignItems: 'center', padding: spacing.xl },
  modalContent: { width: '100%', maxWidth: 440, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.xl },
  modalTitleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  modalTitle: { fontSize: fontSize.lg + 2, fontWeight: '700', color: colors.text, marginLeft: 6 },
  
  // QR Modal Styles
  logoModeBar: {
    width: '100%',
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.md,
    padding: 8,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  logoModeLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    marginBottom: 6,
    textAlign: 'center',
  },
  logoModeTabs: {
    flexDirection: 'row',
    gap: 6,
  },
  logoModeTab: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: radius.sm,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  logoModeTabActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  logoModeTabText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  logoModeTabTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  topStoreLogo: {
    width: 56,
    height: 56,
    borderRadius: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  qrStoreNameText: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  qrTableName: { fontSize: fontSize.lg, fontWeight: '700', color: colors.primary, marginBottom: spacing.lg },
  qrContainer: { padding: 12, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.lg },
  qrInnerWrap: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrCenterLogoBadge: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    padding: 3,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.sm,
  },
  qrCenterLogoImg: {
    width: 38,
    height: 38,
    borderRadius: 8,
  },
  urlLabel: { fontSize: fontSize.sm, color: colors.textMuted, alignSelf: 'flex-start', marginBottom: 4 },
  urlText: { fontSize: 11, color: colors.text, backgroundColor: colors.surfaceMuted, padding: 8, borderRadius: 6, width: '100%', marginBottom: 12 },
  copyBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.info,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: radius.sm,
    marginBottom: 8,
    width: '100%',
  },
  copyBtnText: { color: colors.textOnPrimary, fontWeight: '700', fontSize: fontSize.sm + 1, marginLeft: 6 },
  
  resetTokenBtn: {
    backgroundColor: colors.warningSoft,
    borderWidth: 1,
    borderColor: colors.warningBorder,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: radius.sm,
    marginBottom: 12,
    width: '100%',
    alignItems: 'center',
  },
  resetTokenRow: { flexDirection: 'row', alignItems: 'center' },
  resetTokenBtnText: {
    color: colors.warning,
    fontWeight: '700',
    fontSize: fontSize.sm + 1,
    marginLeft: 6,
  },

  closeQrBtn: { paddingVertical: 8 },
  closeQrBtnText: { color: colors.textMuted, fontSize: fontSize.sm + 1, fontWeight: '600' },

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
  quickSelectContainer: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 },
  quickSelectBtn: { flex: 1, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.sm, paddingVertical: 8, alignItems: 'center', marginHorizontal: 2 },
  quickSelectBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  quickSelectText: { fontSize: fontSize.sm, color: colors.textSecondary, fontWeight: '600' },
  quickSelectTextActive: { color: colors.textOnPrimary },
  modalButtons: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 14 },
  cancelBtn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: radius.sm, marginRight: 8 },
  cancelBtnText: { color: colors.textMuted, fontWeight: '700' },
  saveBtn: { backgroundColor: colors.primary, paddingVertical: 10, paddingHorizontal: 20, borderRadius: radius.sm },
  saveBtnText: { color: colors.textOnPrimary, fontWeight: '700' },

  // Print Modal Specific Styles
  dimensionRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  dimensionInputContainer: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceMuted, borderRadius: radius.sm, paddingHorizontal: 8 },
  dimensionUnitLabel: { fontSize: 11, color: colors.textSecondary, marginRight: 4 },
  dimensionInput: { flex: 1, paddingVertical: 6, fontSize: fontSize.md, fontWeight: '700', textAlign: 'center', color: colors.text },
  unitText: { fontSize: fontSize.sm, color: colors.textMuted, fontWeight: '700', marginLeft: 4 },
  
  presetContainer: { flexDirection: 'row', gap: 6, marginBottom: 14 },
  presetBtn: { flex: 1, backgroundColor: colors.surfaceMuted, paddingVertical: 6, borderRadius: radius.sm, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  presetBtnText: { fontSize: 11, color: colors.textSecondary, fontWeight: '600' },

  selectTableHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  selectAllText: { fontSize: fontSize.sm, color: colors.primary, fontWeight: '700' },
  tableSelectList: { maxHeight: 160, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, padding: 8, marginBottom: 10 },
  checkboxGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  checkboxCard: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 10, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg },
  checkboxCardSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  checkboxText: { fontSize: fontSize.sm, color: colors.textSecondary, marginLeft: 4 },
  checkboxTextSelected: { color: colors.primaryDeep, fontWeight: '700' },

  printExecuteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: radius.sm,
  },
  printExecuteBtnText: { color: colors.textOnPrimary, fontWeight: '700', marginLeft: 6 },
});
