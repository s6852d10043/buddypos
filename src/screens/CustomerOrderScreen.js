// src/screens/CustomerOrderScreen.js
import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
  Image,
  Modal,
} from 'react-native';
import { supabase } from '../lib/supabase';
import Icon from '../theme/Icon';
import { colors, spacing, radius, fontSize, shadow } from '../theme';

export default function CustomerOrderScreen({ token, onBackToHome }) {
  const [loading, setLoading] = useState(true);
  const [tableInfo, setTableInfo] = useState(null);
  const [restaurantName, setRestaurantName] = useState('ร้านอาหาร');
  const [menuItems, setMenuItems] = useState([]);

  // มุมมองแท็บของลูกค้า: 'menu' (สั่งอาหาร) | 'my_order' (รายการที่สั่งไปแล้ว / ติดตามสถานะ)
  const [activeTab, setActiveTab] = useState('menu');

  // ตะกร้าสินค้า
  const [cart, setCart] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('ทั้งหมด');
  const [searchQuery, setSearchQuery] = useState('');

  // โมดอลหมายเหตุพิเศษของอาหาร (เช่น เผ็ดน้อย, ไม่ใส่ผัก)
  const [noteModalItem, setNoteModalItem] = useState(null);
  const [tempNoteText, setTempNoteText] = useState('');

  // โมดอลยืนยันสรุปตะกร้าก่อนส่งเข้าครัว
  const [reviewCartModalVisible, setReviewCartModalVisible] = useState(false);
  const [submittingOrder, setSubmittingOrder] = useState(false);

  // รายการออเดอร์ทุกรอบที่สั่งไปแล้วของโต๊ะนี้ (Active Orders เรียงตามรอบที่สั่ง)
  const [activeOrders, setActiveOrders] = useState([]);

  // สถานะเมื่อบิลของเซสชันนี้ชำระเงินแล้ว (ดีดลิงก์ออกเพื่อป้องกันการสั่งซ้ำและเปิดโต๊ะให้ลูกค้าคนถัดไป)
  const [sessionBillClosed, setSessionBillClosed] = useState(false);
  const [closedOrderDetails, setClosedOrderDetails] = useState(null);
  const trackedOrderIdsRef = useRef([]);
  const sessionBillClosedRef = useRef(false);
  const hasClaimedTableRef = useRef(false);
  const sessionScannedAtRef = useRef(Date.now());
  const isMountedRef = useRef(true);
  const isSubmittingOrderRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // ระยะเวลาหมดอายุอัตโนมัติกรณีสแกน QR แล้วไม่สั่งอาหารภายใน 15 นาที
  const IDLE_TABLE_TIMEOUT_MS = 15 * 60 * 1000;

  // ยอดรวมสุทธิจากออเดอร์ทุกรอบของโต๊ะนี้
  const activeGrandTotal = useMemo(() => {
    return activeOrders.reduce((sum, ord) => sum + Number(ord.total_amount || 0), 0);
  }, [activeOrders]);

  const handleTerminateCustomerSession = (closedOrder) => {
    sessionBillClosedRef.current = true;
    if (!isMountedRef.current) return;
    setClosedOrderDetails(closedOrder);
    setSessionBillClosed(true);
    setActiveOrders([]);
    setCart([]);
    setReviewCartModalVisible(false);
    setNoteModalItem(null);

    // ลบพารามิเตอร์ ?token=... ออกจาก URL บนเบราว์เซอร์เพื่อดีดลิงก์ออกจากเซสชันเดิม
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      try {
        window.history.replaceState(null, '', window.location.pathname);
      } catch (e) {}
    }
  };

  useEffect(() => {
    if (token) {
      initCustomerSession();
    } else {
      setLoading(false);
    }
  }, [token]);

  // รับการอัปเดต Realtime สถานะอาหารที่สั่ง และตรวจจับเมื่อชำระเงินเสร็จเพื่อดีดลิงก์ออกทันที
  useEffect(() => {
    if (!tableInfo || sessionBillClosed) return;

    const parsedTableNum = parseInt(tableInfo.table_number.replace(/\D/g, '') || 1, 10);

    const ordersSub = supabase
      .channel(`customer-orders-${tableInfo.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        () => {
          if (!isMountedRef.current) return;
          fetchActiveOrderForTable(parsedTableNum, tableInfo.restaurant_id);
        }
      )
      .subscribe();

    const tablesSub = supabase
      .channel(`customer-tables-${tableInfo.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'tables', filter: `id=eq.${tableInfo.id}` },
        (payload) => {
          if (!isMountedRef.current) return;
          if (payload.new && payload.new.status === 'available') {
            if (trackedOrderIdsRef.current.length > 0) {
              fetchActiveOrderForTable(parsedTableNum, tableInfo.restaurant_id);
            } else if (hasClaimedTableRef.current) {
              // พนักงานกดเคลียร์โต๊ะว่าง หรือหมดเวลา 15 นาทีขณะที่ยังไม่ได้สั่งอาหาร -> ดีดลิงก์ออกทันที
              handleTerminateCustomerSession({ status: 'cleared_idle' });
            }
          }
        }
      )
      .subscribe();

    // ตรวจสอบสถานะทุก 3 วินาที เผื่อกรณีมือถือพักหน้าจอแล้ว WebSocket ถูกตัด หรือครบกำหนด 15 นาทีโดยไม่สั่งอาหาร
    const pollTimer = setInterval(async () => {
      if (!isMountedRef.current || sessionBillClosedRef.current) return;

      // กรณีสแกนแล้วยังไม่สั่งอาหารเกิน 15 นาที -> คืนสถานะโต๊ะเป็น 'available' อัตโนมัติ และดีดลิงก์ออก
      if (
        trackedOrderIdsRef.current.length === 0 &&
        Date.now() - sessionScannedAtRef.current >= IDLE_TABLE_TIMEOUT_MS
      ) {
        await supabase
          .from('tables')
          .update({ status: 'available', occupied_at: null })
          .eq('id', tableInfo.id);
        if (isMountedRef.current) {
          handleTerminateCustomerSession({ status: 'timeout_idle' });
        }
        return;
      }

      // ตรวจสอบสถานะโต๊ะจากฐานข้อมูลเผื่อพนักงานกดเคลียร์โต๊ะว่างขณะยังไม่ได้สั่งอาหาร
      if (trackedOrderIdsRef.current.length === 0 && hasClaimedTableRef.current) {
        const { data: latestTable } = await supabase
          .from('tables')
          .select('status')
          .eq('id', tableInfo.id)
          .maybeSingle();

        if (latestTable && latestTable.status === 'available') {
          if (isMountedRef.current) {
            handleTerminateCustomerSession({ status: 'cleared_idle' });
          }
          return;
        }
      }

      if (isMountedRef.current) {
        fetchActiveOrderForTable(parsedTableNum, tableInfo.restaurant_id);
      }
    }, 3000);

    return () => {
      supabase.removeChannel(ordersSub);
      supabase.removeChannel(tablesSub);
      clearInterval(pollTimer);
    };
  }, [tableInfo, sessionBillClosed]);

  // โหลดข้อมูลโต๊ะ เมนู และตรวจสอบว่ามีบิลเดิมค้างอยู่หรือไม่
  const initCustomerSession = async () => {
    try {
      if (isMountedRef.current) {
        setLoading(true);
      }

      // 1. ค้นหาข้อมูลโต๊ะจาก qr_token
      let { data: tableData, error: tableErr } = await supabase
        .from('tables')
        .select('*')
        .eq('qr_token', token)
        .limit(1)
        .maybeSingle();

      // ถ้าไม่เจอด้วย qr_token ให้ลองหาด้วย id เผื่อส่งมาเป็น table id
      if (!tableData) {
        const { data: byId } = await supabase
          .from('tables')
          .select('*')
          .eq('id', token)
          .limit(1)
          .maybeSingle();
        tableData = byId;
      }

      if (!isMountedRef.current) return;

      if (!tableData) {
        throw new Error('ไม่พบข้อมูลโต๊ะอาหารสำหรับ QR Code นี้');
      }

      // 1.5 ดึงข้อมูลร้านอาหารและตรวจสอบสถานะก่อนเปิดโต๊ะ
      if (tableData.restaurant_id) {
        const { data: restData } = await supabase
          .from('restaurants')
          .select('name, image_url, status')
          .eq('id', tableData.restaurant_id)
          .maybeSingle();

        if (restData?.status === 'suspended') {
          throw new Error('ร้านค้านี้ปิดให้บริการชั่วคราว (ถูกระงับการใช้งานโดยผู้ดูแลระบบ)');
        }
        if (isMountedRef.current && restData?.name) {
          setRestaurantName(restData.name);
        }
      }

      // ทันทีที่ลูกค้าสแกน QR เข้ามา ให้ปรับสถานะโต๊ะเป็น 'occupied' (มีลูกค้า) ทันที!
      const nowIso = new Date().toISOString();
      sessionScannedAtRef.current = Date.now();
      if (tableData.status !== 'occupied' || !tableData.occupied_at) {
        await supabase
          .from('tables')
          .update({ status: 'occupied', occupied_at: nowIso })
          .eq('id', tableData.id);
        tableData = { ...tableData, status: 'occupied', occupied_at: nowIso };
      }
      hasClaimedTableRef.current = true;

      if (!isMountedRef.current) return;
      setTableInfo(tableData);

      // 2. ดึงรายการอาหารของร้านค้านี้โดยเฉพาะ (แยกเด็ดขาด ไม่ปนกับร้านอื่น)
      const { data: menuData, error: menuErr } = await supabase
        .from('menu_items')
        .select('*')
        .eq('restaurant_id', tableData.restaurant_id)
        .eq('is_available', true)
        .order('category', { ascending: true });

      if (menuErr) throw menuErr;
      if (!isMountedRef.current) return;
      setMenuItems(menuData || []);

      // 3. ตรวจสอบวงจรชีวิตของบิล (Active Bill Check):
      //    ถ้าบิลเดิมจ่ายเงินแล้ว ('paid') -> ลูกค้าใหม่จะได้บิลใหม่เอี่ยม!
      //    ถ้าบิลเดิมยังไม่จ่าย ('pending', 'cooking', 'served') -> ลูกค้ากลุ่มเดิมสั่งเพิ่มได้!
      const parsedTableNum = parseInt(tableData.table_number.replace(/\D/g, '') || 1, 10);
      await fetchActiveOrderForTable(parsedTableNum, tableData.restaurant_id);

    } catch (err) {
      console.error('Init Customer Session Error:', err);
      if (isMountedRef.current) {
        showNotice('ขออภัย', err.message || 'ไม่สามารถโหลดข้อมูลเมนูได้');
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  };

  // ตรวจสอบว่าโต๊ะนี้มีออเดอร์ค้างอยู่หรือไม่ และตรวจสอบว่าบิลของเซสชันนี้ถูกชำระเงินหรือยัง
  const fetchActiveOrderForTable = async (tableNum, restId = tableInfo?.restaurant_id) => {
    if (!isMountedRef.current || sessionBillClosedRef.current) return;
    try {
      // ค้นหาออเดอร์ทุกรอบที่ยังเปิดอยู่ของโต๊ะนี้ (เรียงจากรอบแรกไปรอบล่าสุด)
      let query = supabase
        .from('orders')
        .select(`
          id,
          restaurant_id,
          table_id,
          total_amount,
          payment_method,
          status,
          notes,
          created_at,
          order_items (
            id,
            quantity,
            price_per_item,
            notes,
            menu_item_id,
            item_name,
            category
          )
        `)
        .eq('table_id', tableNum)
        .in('status', ['pending', 'cooking', 'ready', 'served'])
        .order('created_at', { ascending: true });

      if (restId) {
        query = query.eq('restaurant_id', restId);
      }

      const { data: openOrders, error } = await query;
      if (!isMountedRef.current) return;

      if (!error && openOrders && openOrders.length > 0) {
        // บันทึก ID ของทุกรอบบิลในเซสชันนี้ไว้ตรวจสอบเมื่อเช็กบิล
        const mergedIds = Array.from(new Set([...trackedOrderIdsRef.current, ...openOrders.map((o) => o.id)]));
        trackedOrderIdsRef.current = mergedIds;
        if (isMountedRef.current) {
          setActiveOrders(openOrders);
        }
        return;
      }

      // หากไม่เหลือออเดอร์ที่ยังเปิดอยู่เลย แต่เซสชันนี้เคยมีออเดอร์มาก่อน -> แปลว่าชำระเงิน/ปิดบิลแล้ว!
      if (trackedOrderIdsRef.current.length > 0) {
        const { data: closedRows, error: closedErr } = await supabase
          .from('orders')
          .select('id, total_amount, payment_method, status')
          .in('id', trackedOrderIdsRef.current);

        if (!isMountedRef.current) return;

        if (!closedErr && closedRows && closedRows.length > 0) {
          const allClosed = closedRows.every((r) => r.status === 'paid' || r.status === 'cancelled');
          if (allClosed) {
            const combinedTotal = closedRows.reduce((sum, r) => sum + Number(r.total_amount || 0), 0);
            const primaryMethod = closedRows[closedRows.length - 1]?.payment_method || 'cash';
            const finalStatus = closedRows.some((r) => r.status === 'paid') ? 'paid' : 'cancelled';
            handleTerminateCustomerSession({
              id: closedRows.map((r) => r.id).join(', #'),
              total_amount: combinedTotal,
              payment_method: primaryMethod,
              status: finalStatus,
            });
            return;
          }
        }
      }

      if (isMountedRef.current) {
        setActiveOrders([]);
      }
    } catch (err) {
      console.warn('Fetch active order warning:', err);
    }
  };

  const showNotice = (title, message) => {
    if (Platform.OS === 'web') alert(`${title}\n\n${message}`);
    else Alert.alert(title, message);
  };

  // -------------------------------------------------------------
  // ระบบตะกร้าสินค้า (Cart Actions)
  // -------------------------------------------------------------
  const handleAddToCart = (item) => {
    setCart((prev) => {
      const index = prev.findIndex((i) => i.id === item.id);
      if (index > -1) {
        const next = [...prev];
        next[index].qty += 1;
        return next;
      }
      return [...prev, { ...item, qty: 1, note: '' }];
    });
  };

  const handleUpdateCartQty = (itemId, delta) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.id === itemId) {
            const newQty = item.qty + delta;
            return newQty > 0 ? { ...item, qty: newQty } : null;
          }
          return item;
        })
        .filter(Boolean)
    );
  };

  const handleSaveItemNote = () => {
    if (!noteModalItem) return;
    setCart((prev) =>
      prev.map((i) => (i.id === noteModalItem.id ? { ...i, note: tempNoteText.trim() } : i))
    );
    setNoteModalItem(null);
    setTempNoteText('');
  };

  const cartTotalAmount = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  }, [cart]);

  const totalCartCount = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.qty, 0);
  }, [cart]);

  // -------------------------------------------------------------
  // ส่งออเดอร์เข้าห้องครัว (Submit Order - แยกใบออเดอร์ใหม่เข้าครัวทุกรอบที่สั่งเพิ่ม)
  // -------------------------------------------------------------
  const handleSubmitCustomerOrder = async () => {
    if (isSubmittingOrderRef.current) return;
    if (cart.length === 0 || !tableInfo || sessionBillClosed || sessionBillClosedRef.current) return;

    try {
      isSubmittingOrderRef.current = true;
      if (isMountedRef.current) {
        setSubmittingOrder(true);
      }
      const rawNumber = tableInfo.table_number.replace(/\D/g, '');
      const parsedTableNum = rawNumber ? parseInt(rawNumber, 10) : 1;

      // 1. ตรวจสอบออเดอร์ที่ยังเปิดอยู่ของโต๊ะนี้ในฐานข้อมูลล่าสุด
      const { data: currentOpenOrders } = await supabase
        .from('orders')
        .select('id, status, total_amount, payment_method')
        .eq('restaurant_id', tableInfo.restaurant_id)
        .eq('table_id', parsedTableNum)
        .in('status', ['pending', 'cooking', 'ready', 'served'])
        .order('created_at', { ascending: true });

      // หากก่อนหน้านี้มีบิลที่ติดตามอยู่ แต่ตอนนี้ไม่มีบิลเปิดอยู่เลย แปลว่าพนักงานเพิ่งเช็กบิลไปแล้ว
      if (trackedOrderIdsRef.current.length > 0 && (!currentOpenOrders || currentOpenOrders.length === 0)) {
        const { data: closedRows } = await supabase
          .from('orders')
          .select('id, total_amount, payment_method, status')
          .in('id', trackedOrderIdsRef.current);

        const combinedTotal = (closedRows || []).reduce((sum, r) => sum + Number(r.total_amount || 0), 0);
        handleTerminateCustomerSession({
          id: (closedRows || []).map((r) => r.id).join(', #'),
          total_amount: combinedTotal,
          payment_method: closedRows?.[closedRows.length - 1]?.payment_method || 'cash',
          status: 'paid',
        });
        return;
      }

      // 2. คำนวณรอบการสั่งอาหาร:
      //    - รอบแรก (roundNumber = 1): ออเดอร์เปิดโต๊ะปกติ
      //    - รอบถัดไป (roundNumber >= 2): สร้างใบออเดอร์ใหม่เข้าครัวพร้อมป้ายกำกับ "สั่งเพิ่ม #2", "สั่งเพิ่ม #3", ...
      const existingCount = currentOpenOrders ? currentOpenOrders.length : activeOrders.length;
      const roundNumber = existingCount + 1;
      const roundBadgeNote = roundNumber > 1 ? `สั่งเพิ่ม #${roundNumber}` : null;

      const { data: newOrder, error: orderErr } = await supabase
        .from('orders')
        .insert([
          {
            restaurant_id: tableInfo.restaurant_id,
            table_id: parsedTableNum,
            subtotal: cartTotalAmount,
            total_amount: cartTotalAmount,
            status: 'pending',
            payment_method: 'cash',
            notes: roundBadgeNote,
          },
        ])
        .select()
        .single();

      if (orderErr) throw orderErr;

      const orderId = newOrder.id;
      trackedOrderIdsRef.current = Array.from(new Set([...trackedOrderIdsRef.current, orderId]));

      // 3. บันทึกรายการอาหารเฉพาะที่สั่งในรอบนี้ลง order_items
      const itemsPayload = cart.map((item) => ({
        order_id: orderId,
        menu_item_id: item.id && item.id.length === 36 ? item.id : null,
        item_name: item.name,
        category: item.category || 'ทั่วไป',
        quantity: item.qty,
        price_per_item: item.price,
        notes: item.note || null,
        status: 'pending',
      }));

      const { error: itemsErr } = await supabase.from('order_items').insert(itemsPayload);
      if (itemsErr) {
        // Recovery: Cancel the empty orphan order so it does not linger active
        await supabase
          .from('orders')
          .update({ status: 'cancelled' })
          .eq('id', orderId);
        trackedOrderIdsRef.current = trackedOrderIdsRef.current.filter((id) => id !== orderId);
        throw itemsErr;
      }

      // 4. อัปเดตสถานะโต๊ะเป็น 'occupied' (มีลูกค้า)
      await supabase
        .from('tables')
        .update({ status: 'occupied', occupied_at: new Date().toISOString() })
        .eq('id', tableInfo.id);

      if (isMountedRef.current) {
        showNotice(
          'สำเร็จ!',
          roundNumber > 1
            ? `ส่งรายการ (${roundBadgeNote}) เป็นใบออเดอร์ใหม่เข้าห้องครัวเรียบร้อยแล้วครับ`
            : 'ส่งออเดอร์เข้าห้องครัวเรียบร้อยแล้ว กำลังเตรียมอาหารให้ครับ'
        );
        setCart([]);
        setReviewCartModalVisible(false);
      }

      // โหลดออเดอร์ล่าสุด และสลับไปหน้าติดตามสถานะ
      await fetchActiveOrderForTable(parsedTableNum, tableInfo.restaurant_id);
      if (isMountedRef.current) {
        setActiveTab('my_order');
      }

    } catch (err) {
      console.error('Submit order error:', err);
      if (isMountedRef.current) {
        showNotice('เกิดข้อผิดพลาด', err.message || 'ไม่สามารถส่งออเดอร์ได้');
      }
    } finally {
      isSubmittingOrderRef.current = false;
      if (isMountedRef.current) {
        setSubmittingOrder(false);
      }
    }
  };

  // สร้างหมวดหมู่ไดนามิกจากเมนูของร้านนี้เท่านั้น
  const dynamicCategories = useMemo(() => {
    const cats = new Set(['ทั้งหมด']);
    menuItems.forEach((m) => {
      if (m.category && m.category.trim()) cats.add(m.category.trim());
    });
    return Array.from(cats);
  }, [menuItems]);

  // กรองเมนูตามหมวดหมู่และคำค้นหา
  const filteredMenuItems = useMemo(() => {
    return menuItems.filter((item) => {
      const matchCat = selectedCategory === 'ทั้งหมด' || item.category === selectedCategory;
      const matchSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
      return matchCat && matchSearch;
    });
  }, [menuItems, selectedCategory, searchQuery]);

  if (loading) {
    return (
      <SafeAreaView style={styles.centerBox}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>กำลังเปิดเมนูอาหารประจำโต๊ะ...</Text>
      </SafeAreaView>
    );
  }

  if (sessionBillClosed) {
    const isIdleClosed =
      closedOrderDetails?.status === 'cleared_idle' || closedOrderDetails?.status === 'timeout_idle';

    return (
      <SafeAreaView style={styles.closedSessionContainer}>
        <StatusBar barStyle="dark-content" backgroundColor={colors.primarySoft} />
        <View style={styles.closedSessionCard}>
          <View style={styles.closedIconCircle}>
            <Icon
              name={isIdleClosed ? 'time-outline' : 'checkmark-circle'}
              size={48}
              color={colors.primary}
            />
          </View>
          <View style={styles.closedStatusPill}>
            <Text style={styles.closedStatusPillText}>
              {closedOrderDetails?.status === 'timeout_idle'
                ? 'หมดเวลาเลือกเมนู (เกิน 15 นาที)'
                : closedOrderDetails?.status === 'cleared_idle'
                ? 'พนักงานเคลียร์สถานะโต๊ะแล้ว'
                : closedOrderDetails?.status === 'cancelled'
                ? 'บิลถูกยกเลิกแล้ว'
                : 'ชำระเงินเรียบร้อย • ปิดบิลแล้ว'}
            </Text>
          </View>
          <Text style={styles.closedTitle}>
            {isIdleClosed ? 'เซสชันของโต๊ะนี้สิ้นสุดแล้ว' : 'ขอบคุณที่ใช้บริการครับ'}
          </Text>
          <Text style={styles.closedStoreName}>{restaurantName}</Text>
          <Text style={styles.closedTableSub}>
            {tableInfo?.table_number} {closedOrderDetails?.id ? `• บิล #${closedOrderDetails.id}` : ''}
          </Text>

          {closedOrderDetails && !isIdleClosed && (
            <View style={styles.closedSummaryBox}>
              <View style={styles.closedSummaryRow}>
                <Text style={styles.closedSummaryLabel}>ยอดชำระสุทธิ</Text>
                <Text style={styles.closedSummaryAmount}>
                  ฿{Number(closedOrderDetails.total_amount || 0).toFixed(2)}
                </Text>
              </View>
              <View style={[styles.closedSummaryRow, { marginTop: 6 }]}>
                <Text style={styles.closedSummarySubLabel}>ช่องทางชำระเงิน</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Icon
                    name={closedOrderDetails.payment_method === 'promptpay' ? 'qr-code-outline' : 'cash-outline'}
                    size={14}
                    color={colors.textSecondary}
                  />
                  <Text style={styles.closedSummarySubVal}>
                    {closedOrderDetails.payment_method === 'promptpay' ? 'สแกน QR พร้อมเพย์' : 'เงินสด'}
                  </Text>
                </View>
              </View>
            </View>
          )}

          <View style={styles.closedLockNotice}>
            <View style={styles.closedLockHeaderRow}>
              <Icon name="lock-closed-outline" size={16} color={colors.warning} />
              <Text style={styles.closedLockText}>
                {isIdleClosed
                  ? 'ระบบได้คืนสถานะโต๊ะเป็น "โต๊ะว่าง" แล้ว เนื่องจากไม่มีการสั่งอาหารภายในเวลาที่กำหนด หรือพนักงานได้เคลียร์โต๊ะแล้ว'
                  : 'ระบบได้ตัดการเชื่อมต่อลิงก์ของรอบบิลนี้แล้ว เพื่อเปิดโต๊ะว่างให้ลูกค้าท่านถัดไปใช้งาน'}
              </Text>
            </View>
            <Text style={styles.closedLockSubText}>
              (ไม่สามารถสั่งอาหารจากหน้าจอนี้ได้ หากต้องการใช้งานโต๊ะนี้ กรุณาสแกน QR Code ที่โต๊ะใหม่อีกครั้ง)
            </Text>
          </View>

          {onBackToHome && (
            <TouchableOpacity style={styles.btnBackHome} onPress={onBackToHome}>
              <Text style={styles.btnBackHomeText}>กลับหน้าหลัก</Text>
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>
    );
  }

  if (!tableInfo) {
    return (
      <SafeAreaView style={styles.centerBox}>
        <View style={styles.errorIconCircle}>
          <Icon name="warning-outline" size={38} color={colors.warning} />
        </View>
        <Text style={styles.errorTitle}>ไม่พบโต๊ะอาหาร</Text>
        <Text style={styles.errorSubtitle}>
          กรุณาสแกน QR Code ที่ติดอยู่บนโต๊ะอาหารใหม่อีกครั้ง
        </Text>
        {onBackToHome && (
          <TouchableOpacity style={styles.btnBackHome} onPress={onBackToHome}>
            <Text style={styles.btnBackHomeText}>กลับหน้าหลัก</Text>
          </TouchableOpacity>
        )}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.surface} />

      {/* Header Bar ประจำโต๊ะ */}
      <View style={styles.header}>
        <View style={styles.tableBadge}>
          <View style={styles.tableIconCircle}>
            <Icon name="restaurant-outline" size={20} color={colors.primary} />
          </View>
          <View>
            <Text style={styles.tableName}>{tableInfo.table_number}</Text>
            <Text style={styles.tableSub}>สั่งอาหารผ่านมือถือ</Text>
          </View>
        </View>

        {/* ปุ่มแท็บสลับ เมนู / อาหารที่สั่งไปแล้ว */}
        <View style={styles.tabToggleGroup}>
          <TouchableOpacity
            style={[styles.tabToggleBtn, activeTab === 'menu' && styles.tabToggleBtnActive]}
            onPress={() => setActiveTab('menu')}
          >
            <Text style={[styles.tabToggleText, activeTab === 'menu' && styles.tabToggleTextActive]}>
              เมนูอาหาร
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabToggleBtn, activeTab === 'my_order' && styles.tabToggleBtnActive]}
            onPress={() => setActiveTab('my_order')}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={[styles.tabToggleText, activeTab === 'my_order' && styles.tabToggleTextActive]}>
                บิลของคุณ
              </Text>
              {activeOrders.length > 0 && (
                <View style={styles.tabOrderBadge}>
                  <Text style={styles.tabOrderBadgeText}>{activeOrders.length}</Text>
                </View>
              )}
            </View>
          </TouchableOpacity>
        </View>
      </View>

      {/* ========================================================= */}
      {/* แท็บที่ 1: เมนูอาหาร (Digital Menu) */}
      {/* ========================================================= */}
      {activeTab === 'menu' && (
        <View style={{ flex: 1 }}>
          {/* แจ้งเตือนกรณีมีบิลค้างอยู่ (สั่งเพิ่มได้) */}
          {activeOrders.length > 0 && (
            <TouchableOpacity
              style={styles.activeBillBanner}
              onPress={() => setActiveTab('my_order')}
            >
              <View style={styles.activeBillRow}>
                <Icon name="receipt-outline" size={16} color={colors.warning} />
                <Text style={styles.activeBillBannerText}>
                  โต๊ะนี้สั่งแล้ว {activeOrders.length} รอบ (รวม ฿{activeGrandTotal.toFixed(2)}) — สั่งเพิ่มจะส่งใบใหม่เข้าครัวทันที
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={styles.activeBillBannerLink}>ดูบิล</Text>
                <Icon name="chevron-forward" size={14} color={colors.warning} />
              </View>
            </TouchableOpacity>
          )}

          {/* ช่องค้นหา & หมวดหมู่ */}
          <View style={styles.searchAndCatBox}>
            <View style={styles.searchInputWrap}>
              <Icon name="search-outline" size={18} color={colors.textFaint} />
              <TextInput
                style={styles.searchInput}
                placeholder="ค้นหาเมนู เช่น กะเพรา, ชาไทย, ต้มยำ..."
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
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginTop: 10 }}>
              {dynamicCategories.map((cat) => (
                <TouchableOpacity
                  key={cat}
                  style={[styles.catChip, selectedCategory === cat && styles.catChipActive]}
                  onPress={() => setSelectedCategory(cat)}
                >
                  <Text style={[styles.catChipText, selectedCategory === cat && styles.catChipTextActive]}>
                    {cat}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* ตารางแสดงเมนูอาหาร */}
          <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 110 }}>
            {filteredMenuItems.length === 0 ? (
              <View style={styles.emptyBox}>
                <View style={styles.emptyIconCircle}>
                  <Icon name="restaurant-outline" size={32} color={colors.textFaint} />
                </View>
                <Text style={styles.emptyTitle}>
                  {menuItems.length === 0 ? 'ร้านนี้ยังไม่มีรายการอาหาร' : 'ไม่พบเมนูอาหารที่ค้นหา'}
                </Text>
                <Text style={styles.emptySub}>
                  {menuItems.length === 0
                    ? 'กรุณารอทางร้านเพิ่มเมนูอาหาร หรือติดต่อพนักงานประจำร้านครับ'
                    : 'ลองค้นหาด้วยคำอื่น หรือเลือกหมวดหมู่อื่นดูนะครับ'}
                </Text>
              </View>
            ) : (
              <View style={styles.menuGrid}>
                {filteredMenuItems.map((item) => {
                  const inCart = cart.find((c) => c.id === item.id);

                  return (
                    <View key={item.id} style={styles.menuCard}>
                      {item.image_url ? (
                        <Image source={{ uri: item.image_url }} style={styles.menuImg} />
                      ) : (
                        <View style={styles.menuImgPlaceholder}>
                          <Icon name="fast-food-outline" size={32} color={colors.textFaint} />
                        </View>
                      )}

                      <View style={styles.menuCardContent}>
                        <Text style={styles.menuTitle} numberOfLines={1}>
                          {item.name}
                        </Text>
                        <Text style={styles.menuPrice}>฿{item.price}</Text>

                        {inCart ? (
                          <View style={styles.qtyControlRow}>
                            <TouchableOpacity
                              style={styles.qtyBtn}
                              onPress={() => handleUpdateCartQty(item.id, -1)}
                            >
                              <Icon name="remove" size={16} color={colors.textOnPrimary} />
                            </TouchableOpacity>
                            <Text style={styles.qtyText}>{inCart.qty}</Text>
                            <TouchableOpacity
                              style={styles.qtyBtn}
                              onPress={() => handleUpdateCartQty(item.id, 1)}
                            >
                              <Icon name="add" size={16} color={colors.textOnPrimary} />
                            </TouchableOpacity>
                          </View>
                        ) : (
                          <TouchableOpacity
                            style={styles.btnAdd}
                            activeOpacity={0.8}
                            onPress={() => handleAddToCart(item)}
                          >
                            <Icon name="add" size={15} color={colors.primary} />
                            <Text style={styles.btnAddText}>สั่งเมนูนี้</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </ScrollView>

          {/* แถบตะกร้าสินค้าลอยด้านล่าง (Bottom Cart Bar) */}
          {cart.length > 0 && (
            <View style={styles.floatingCartBar}>
              <View style={{ flex: 1 }}>
                <Text style={styles.floatingCartCount}>
                  เลือกแล้ว {totalCartCount} จาน
                </Text>
                <Text style={styles.floatingCartTotal}>
                  ฿{cartTotalAmount.toFixed(2)}
                </Text>
              </View>

              <TouchableOpacity
                style={styles.btnOpenReview}
                onPress={() => setReviewCartModalVisible(true)}
                activeOpacity={0.85}
              >
                <Icon name="cart-outline" size={18} color={colors.textOnPrimary} />
                <Text style={styles.btnOpenReviewText}>ดูตะกร้า & ส่งออเดอร์</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {/* ========================================================= */}
      {/* แท็บที่ 2: บิลของคุณ / ติดตามสถานะ (My Order Tracking) */}
      {/* ========================================================= */}
      {activeTab === 'my_order' && (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          <View style={styles.myOrderHeader}>
            <Text style={styles.myOrderTitle}>รายการอาหารของ {tableInfo.table_number}</Text>
            <Text style={styles.myOrderSub}>
              {activeOrders.length > 0
                ? `สั่งแล้วทั้งหมด ${activeOrders.length} รอบ • รวมทุกรอบในบิลเดียว`
                : 'ยังไม่มีออเดอร์ที่ค้างอยู่ สั่งอาหารจากแท็บ "เมนูอาหาร" ได้เลยครับ'}
            </Text>
          </View>

          {activeOrders.length > 0 ? (
            <View style={styles.activeOrderCard}>
              {activeOrders.map((ord, roundIdx) => {
                const roundNum = roundIdx + 1;
                const isAddOn = roundNum > 1;
                return (
                  <View
                    key={ord.id}
                    style={[
                      styles.roundSectionBox,
                      roundIdx > 0 && { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.border },
                    ]}
                  >
                    <View style={styles.roundHeaderRow}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={styles.orderedItemsTitle}>
                          รอบที่ {roundNum} {isAddOn ? `(สั่งเพิ่ม #${roundNum})` : '(ออเดอร์เปิดโต๊ะ)'}
                        </Text>
                        <Text style={{ fontSize: 11, color: colors.textMuted }}>• #{ord.id}</Text>
                      </View>
                      <View
                        style={[
                          styles.roundStatusPill,
                          ord.status === 'pending' && { backgroundColor: colors.warningSoft },
                          ord.status === 'cooking' && { backgroundColor: colors.infoSoft },
                          ord.status === 'ready' && { backgroundColor: colors.orangeSoft },
                          ord.status === 'served' && { backgroundColor: colors.successSoft },
                        ]}
                      >
                        <Icon
                          name={
                            ord.status === 'pending'
                              ? 'time-outline'
                              : ord.status === 'cooking'
                              ? 'flame-outline'
                              : ord.status === 'ready'
                              ? 'notifications-outline'
                              : 'checkmark-circle-outline'
                          }
                          size={13}
                          color={
                            ord.status === 'pending'
                              ? colors.warning
                              : ord.status === 'cooking'
                              ? colors.info
                              : ord.status === 'ready'
                              ? colors.orange
                              : colors.success
                          }
                        />
                        <Text
                          style={[
                            styles.roundStatusPillText,
                            ord.status === 'pending' && { color: colors.warning },
                            ord.status === 'cooking' && { color: colors.info },
                            ord.status === 'ready' && { color: colors.orange },
                            ord.status === 'served' && { color: colors.success },
                          ]}
                        >
                          {ord.status === 'pending' && 'รอครัวรับออเดอร์'}
                          {ord.status === 'cooking' && 'กำลังปรุงอาหาร'}
                          {ord.status === 'ready' && 'ครัวทำเสร็จแล้ว (รอเสิร์ฟ)'}
                          {ord.status === 'served' && 'เสิร์ฟแล้ว'}
                        </Text>
                      </View>
                    </View>

                    {(ord.order_items || []).map((oi, idx) => (
                      <View key={oi.id || idx} style={styles.orderedItemRow}>
                        <View style={{ flex: 2 }}>
                          <Text style={styles.orderedItemName}>
                            • {oi.item_name || (oi.notes ? oi.notes.split(' (')[0] : `เมนู #${idx + 1}`)}
                          </Text>
                          {oi.notes && (
                            <Text style={styles.orderedItemNote}>หมายเหตุ: {oi.notes}</Text>
                          )}
                        </View>
                        <Text style={styles.orderedItemQty}>x{oi.quantity}</Text>
                        <Text style={styles.orderedItemPrice}>
                          ฿{(oi.price_per_item * oi.quantity).toFixed(2)}
                        </Text>
                      </View>
                    ))}
                  </View>
                );
              })}

              <View style={styles.divider} />

              <View style={styles.orderTotalRow}>
                <Text style={styles.orderTotalLabel}>
                  ยอดรวมค่าอาหารทั้งหมด ({activeOrders.length} รอบ):
                </Text>
                <Text style={styles.orderTotalVal}>
                  ฿{activeGrandTotal.toFixed(2)}
                </Text>
              </View>

              <View style={styles.payTipRow}>
                <Icon name="information-circle-outline" size={15} color={colors.textMuted} />
                <Text style={styles.payTipText}>
                  เมื่อทานเสร็จ สามารถเรียกพนักงานเพื่อเช็กบิลรวมทุกรอบ (เงินสด / สแกนพร้อมเพย์) ได้เลยครับ
                </Text>
              </View>

              {/* ปุ่มสั่งเพิ่ม */}
              <TouchableOpacity
                style={styles.btnAddMore}
                onPress={() => setActiveTab('menu')}
              >
                <Icon name="add-circle-outline" size={16} color={colors.primary} />
                <Text style={styles.btnAddMoreText}>สั่งอาหารหรือเครื่องดื่มเพิ่ม (ส่งใบใหม่เข้าครัว)</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.emptyOrderBox}>
              <View style={styles.emptyIconCircle}>
                <Icon name="receipt-outline" size={32} color={colors.textFaint} />
              </View>
              <Text style={styles.emptyOrderTitle}>โต๊ะนี้ยังไม่มีรายการสั่งอาหาร</Text>
              <Text style={styles.emptyOrderSub}>
                เลือกเมนูอาหารที่ต้องการแล้วกด "ส่งออเดอร์" ได้เลยครับ
              </Text>
              <TouchableOpacity
                style={styles.btnStartOrder}
                onPress={() => setActiveTab('menu')}
              >
                <Text style={styles.btnStartOrderText}>ดูเมนูอาหารเลย</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      )}

      {/* ========================================================= */}
      {/* MODAL: ตรวจสอบและระบุหมายเหตุพิเศษ (Review Cart Modal) */}
      {/* ========================================================= */}
      <Modal visible={reviewCartModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.reviewModalCard}>
            <View style={styles.reviewModalHeader}>
              <Text style={styles.reviewModalTitle}>สรุปรายการสั่งอาหาร</Text>
              <Text style={styles.reviewModalSub}>{tableInfo.table_number}</Text>
            </View>

            <ScrollView style={{ maxHeight: 280, marginVertical: 10 }}>
              {cart.map((cItem) => (
                <View key={cItem.id} style={styles.reviewItemRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.reviewItemName}>{cItem.name}</Text>
                    <Text style={styles.reviewItemPrice}>฿{cItem.price} / จาน</Text>
                    {cItem.note ? (
                      <Text style={styles.reviewItemNote}>หมายเหตุ: {cItem.note}</Text>
                    ) : null}
                    <TouchableOpacity
                      style={styles.editNoteLinkRow}
                      onPress={() => {
                        setNoteModalItem(cItem);
                        setTempNoteText(cItem.note || '');
                      }}
                    >
                      <Icon name="create-outline" size={13} color={colors.primary} />
                      <Text style={styles.editNoteLink}>
                        {cItem.note ? 'แก้ไขหมายเหตุ' : 'เพิ่มหมายเหตุ (เผ็ดน้อย, ไม่ใส่ผัก)'}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.qtyControlRow}>
                    <TouchableOpacity
                      style={styles.qtyBtn}
                      onPress={() => handleUpdateCartQty(cItem.id, -1)}
                    >
                      <Icon name="remove" size={16} color={colors.textOnPrimary} />
                    </TouchableOpacity>
                    <Text style={[styles.qtyText, { marginHorizontal: 10 }]}>{cItem.qty}</Text>
                    <TouchableOpacity
                      style={styles.qtyBtn}
                      onPress={() => handleUpdateCartQty(cItem.id, 1)}
                    >
                      <Icon name="add" size={16} color={colors.textOnPrimary} />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </ScrollView>

            <View style={styles.divider} />

            <View style={styles.orderTotalRow}>
              <Text style={styles.orderTotalLabel}>ยอดรวมในครั้งนี้:</Text>
              <Text style={styles.orderTotalVal}>฿{cartTotalAmount.toFixed(2)}</Text>
            </View>

            <View style={styles.modalActionRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setReviewCartModalVisible(false)}
              >
                <Text style={styles.modalCancelBtnText}>สั่งเพิ่มอีก</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalSubmitBtn}
                disabled={submittingOrder}
                onPress={handleSubmitCustomerOrder}
              >
                {submittingOrder ? (
                  <ActivityIndicator color={colors.textOnPrimary} />
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Icon name="checkmark-circle-outline" size={16} color={colors.textOnPrimary} />
                    <Text style={styles.modalSubmitBtnText}>ยืนยันส่งเข้าครัว</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL ย่อย: ใส่หมายเหตุพิเศษ */}
      <Modal visible={!!noteModalItem} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.noteModalCard}>
            <Text style={styles.noteModalTitle}>ระบุหมายเหตุ: {noteModalItem?.name}</Text>
            <TextInput
              style={styles.noteInput}
              placeholder="เช่น เผ็ดน้อย, หวาน 50%, ไม่ใส่ผัก..."
              placeholderTextColor={colors.textFaint}
              value={tempNoteText}
              onChangeText={setTempNoteText}
              autoFocus
            />
            <View style={styles.modalActionRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setNoteModalItem(null)}
              >
                <Text style={styles.modalCancelBtnText}>ยกเลิก</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalSubmitBtn}
                onPress={handleSaveItemNote}
              >
                <Text style={styles.modalSubmitBtnText}>บันทึก</Text>
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
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tableBadge: { flexDirection: 'row', alignItems: 'center' },
  tableIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  tableName: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text },
  tableSub: { fontSize: 11, color: colors.primary, fontWeight: '600' },

  tabToggleGroup: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.sm,
    padding: 3,
  },
  tabToggleBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  tabToggleBtnActive: {
    backgroundColor: colors.primary,
  },
  tabToggleText: { fontSize: fontSize.sm, color: colors.textSecondary, fontWeight: '600' },
  tabToggleTextActive: { color: colors.textOnPrimary, fontWeight: '700' },
  tabOrderBadge: {
    backgroundColor: colors.danger,
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },
  tabOrderBadgeText: { color: colors.textOnPrimary, fontSize: 10, fontWeight: '700' },

  activeBillBanner: {
    backgroundColor: colors.warningSoft,
    paddingHorizontal: 14,
    paddingVertical: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.warningBorder,
  },
  activeBillRow: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 },
  activeBillBannerText: { fontSize: fontSize.sm, color: colors.warning, fontWeight: '600', marginLeft: 6, flex: 1 },
  activeBillBannerLink: { fontSize: fontSize.sm, color: colors.warning, fontWeight: '700' },

  searchAndCatBox: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  searchInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    height: 40,
    backgroundColor: colors.bg,
  },
  searchInput: {
    flex: 1,
    fontSize: fontSize.sm + 1,
    color: colors.text,
    marginLeft: 8,
  },
  catChip: {
    paddingVertical: 5,
    paddingHorizontal: 12,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.pill,
  },
  catChipActive: { backgroundColor: colors.primary },
  catChipText: { fontSize: fontSize.sm, color: colors.textSecondary, fontWeight: '600' },
  catChipTextActive: { color: colors.textOnPrimary, fontWeight: '700' },

  menuGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  menuCard: {
    width: '48%',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    ...shadow.card,
  },
  menuImg: { width: '100%', height: 110 },
  menuImgPlaceholder: {
    width: '100%',
    height: 110,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuCardContent: { padding: 10 },
  menuTitle: { fontSize: fontSize.sm + 1, fontWeight: '700', color: colors.text },
  menuPrice: { fontSize: fontSize.sm + 1, fontWeight: '700', color: colors.primary, marginVertical: 4 },
  btnAdd: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    paddingVertical: 6,
    borderRadius: 6,
    marginTop: 4,
  },
  btnAddText: { color: colors.primary, fontSize: fontSize.sm, fontWeight: '700', marginLeft: 3 },
  qtyControlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  qtyBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyText: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },

  floatingCartBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.dark,
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  floatingCartCount: { fontSize: fontSize.sm, color: colors.primaryBorder },
  floatingCartTotal: { fontSize: 18, fontWeight: '700', color: colors.textOnPrimary },
  btnOpenReview: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: radius.sm,
  },
  btnOpenReviewText: { color: colors.textOnPrimary, fontSize: fontSize.sm + 1, fontWeight: '700', marginLeft: 6 },

  // My Order Tab
  myOrderHeader: { marginBottom: 14 },
  myOrderTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text },
  myOrderSub: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2 },
  activeOrderCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  roundSectionBox: { paddingVertical: 2 },
  roundHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  roundStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  roundStatusPillText: {
    fontSize: 11,
    fontWeight: '700',
    marginLeft: 4,
  },
  orderedItemsTitle: { fontSize: fontSize.sm + 1, fontWeight: '700', color: colors.textSecondary },
  orderedItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  orderedItemName: { fontSize: fontSize.sm + 1, color: colors.text, fontWeight: '500' },
  orderedItemNote: { fontSize: 11, color: colors.danger, fontStyle: 'italic', marginTop: 1 },
  orderedItemQty: { fontSize: fontSize.sm + 1, fontWeight: '700', color: colors.primary, width: 36, textAlign: 'center' },
  orderedItemPrice: { fontSize: fontSize.sm + 1, fontWeight: '600', color: colors.text },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 12 },
  orderTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  orderTotalLabel: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  orderTotalVal: { fontSize: 18, fontWeight: '700', color: colors.primary },
  payTipRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  payTipText: { fontSize: 11, color: colors.textMuted, textAlign: 'center', marginLeft: 4 },
  btnAddMore: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    paddingVertical: 12,
    borderRadius: radius.sm,
    marginTop: 14,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  btnAddMoreText: { color: colors.primary, fontSize: fontSize.sm + 1, fontWeight: '700', marginLeft: 6 },

  emptyOrderBox: { padding: 40, alignItems: 'center' },
  emptyOrderTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.textSecondary, marginTop: 10 },
  emptyOrderSub: { fontSize: fontSize.sm, color: colors.textFaint, textAlign: 'center', marginTop: 4 },
  btnStartOrder: {
    backgroundColor: colors.primary,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: radius.sm,
    marginTop: 16,
  },
  btnStartOrderText: { color: colors.textOnPrimary, fontSize: fontSize.sm + 1, fontWeight: '700' },

  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(17,24,39,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  reviewModalCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 18,
  },
  reviewModalHeader: { alignItems: 'center', marginBottom: 8 },
  reviewModalTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text },
  reviewModalSub: { fontSize: fontSize.sm, color: colors.primary, fontWeight: '700', marginTop: 2 },
  reviewItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  reviewItemName: { fontSize: fontSize.sm + 1, fontWeight: '700', color: colors.text },
  reviewItemPrice: { fontSize: 11, color: colors.textMuted },
  reviewItemNote: { fontSize: 11, color: colors.danger, fontStyle: 'italic', marginTop: 2 },
  editNoteLinkRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  editNoteLink: { fontSize: 11, color: colors.primary, fontWeight: '600', marginLeft: 3 },
  modalActionRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  modalCancelBtn: {
    flex: 1,
    backgroundColor: colors.surfaceMuted,
    paddingVertical: 12,
    borderRadius: radius.sm,
    alignItems: 'center',
  },
  modalCancelBtnText: { color: colors.textSecondary, fontSize: fontSize.sm + 1, fontWeight: '700' },
  modalSubmitBtn: {
    flex: 2,
    backgroundColor: colors.primary,
    paddingVertical: 12,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSubmitBtnText: { color: colors.textOnPrimary, fontSize: fontSize.sm + 1, fontWeight: '700', marginLeft: 4 },

  noteModalCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 18,
  },
  noteModalTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.text, marginBottom: 12 },
  noteInput: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.sm,
    padding: 10,
    fontSize: fontSize.sm + 1,
    color: colors.text,
    marginBottom: 8,
  },

  centerBox: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl, backgroundColor: colors.bg },
  loadingText: { marginTop: 12, fontSize: fontSize.sm + 1, color: colors.textMuted },
  errorIconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: colors.warningSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  errorTitle: { fontSize: 18, fontWeight: '700', color: colors.text, marginTop: 4 },
  errorSubtitle: { fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center', marginTop: 4 },
  btnBackHome: {
    marginTop: 16,
    backgroundColor: colors.primary,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: radius.sm,
  },
  btnBackHomeText: { color: colors.textOnPrimary, fontSize: fontSize.sm + 1, fontWeight: '700' },
  emptyBox: { padding: 40, alignItems: 'center' },
  emptyIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: colors.textSecondary, marginTop: 4 },
  emptySub: { fontSize: fontSize.sm, color: colors.textFaint, textAlign: 'center', marginTop: 4 },

  // Closed Session / Kicked Out Screen Styles
  closedSessionContainer: {
    flex: 1,
    backgroundColor: colors.primarySoft,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  closedSessionCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    ...shadow.raised,
  },
  closedIconCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: colors.successSoft,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  closedStatusPill: {
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: radius.pill,
    marginBottom: 12,
  },
  closedStatusPillText: {
    color: colors.textOnPrimary,
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  closedTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.primaryDeep,
    textAlign: 'center',
  },
  closedStoreName: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textSecondary,
    marginTop: 4,
  },
  closedTableSub: {
    fontSize: fontSize.sm + 1,
    color: colors.textMuted,
    marginTop: 2,
    marginBottom: 18,
  },
  closedSummaryBox: {
    width: '100%',
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 18,
  },
  closedSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  closedSummaryLabel: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.text,
  },
  closedSummaryAmount: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.primary,
  },
  closedSummarySubLabel: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  closedSummarySubVal: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textSecondary,
    marginLeft: 4,
  },
  closedLockNotice: {
    width: '100%',
    backgroundColor: colors.warningSoft,
    borderRadius: radius.md,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.warningBorder,
  },
  closedLockHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  closedLockText: {
    flex: 1,
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.warning,
    lineHeight: 18,
    marginLeft: 6,
  },
  closedLockSubText: {
    fontSize: 11,
    color: colors.warning,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 16,
  },
});
