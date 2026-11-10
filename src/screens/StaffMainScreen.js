// src/screens/StaffMainScreen.js
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
  Modal,
  Image,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { supabase } from '../lib/supabase';
import Icon from '../theme/Icon';
import { colors, spacing, radius, fontSize, shadow } from '../theme';
import {
  generatePromptPayPayload,
  formatPromptPayDisplay,
  calculateBillBreakdown,
} from '../utils/promptpay';

// Helper: เสียงกระดิ่งแจ้งเตือนเมื่อมีออเดอร์ใหม่เข้าครัว (Web Audio API Synthesizer)
const playChimeSound = () => {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        const now = ctx.currentTime;

        // โน้ตตัวที่ 1 (D5)
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(587.33, now);
        gain1.gain.setValueAtTime(0.25, now);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        osc1.connect(gain1);
        gain1.connect(ctx.destination);
        osc1.start(now);
        osc1.stop(now + 0.4);

        // โน้ตตัวที่ 2 (A5)
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(880, now + 0.12);
        gain2.gain.setValueAtTime(0.25, now + 0.12);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.start(now + 0.12);
        osc2.stop(now + 0.6);
      }
    } catch (e) {
      console.warn('Audio chime warning:', e);
    }
  }
};

export default function StaffMainScreen({ store, onBack }) {
  const restaurantId = store?.restaurantId || store?.id;
  const restaurantName = store?.restaurantName || store?.name || 'ร้านค้าของคุณ';

  // แท็บหลักของพนักงาน: 'kitchen' (ครัว) | 'cashier' (แคชเชียร์) | 'take_order' (รับออเดอร์) | 'tables' (ผังโต๊ะ)
  const [activeTab, setActiveTab] = useState('kitchen');

  // ข้อมูลหลัก
  const [tables, setTables] = useState([]);
  const [menus, setMenus] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);

  // ตัวกรองห้องครัว: 'all' | 'pending' | 'cooking'
  const [kitchenFilter, setKitchenFilter] = useState('all');

  // แท็บย่อยของหน้าแคชเชียร์: 'serve' (1. รอเสิร์ฟ) | 'billing' (2. คิดเงิน)
  const [cashierSubTab, setCashierSubTab] = useState('serve');

  // ตะกร้ารับออเดอร์หน้าร้าน (Take Order)
  const [selectedTableForOrder, setSelectedTableForOrder] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState('ทั้งหมด');
  const [searchMenuQuery, setSearchMenuQuery] = useState('');
  const [cart, setCart] = useState([]);
  const [itemNoteModal, setItemNoteModal] = useState(null); // สำหรับระบุหมายเหตุ เช่น เผ็ดน้อย
  const [tempNoteText, setTempNoteText] = useState('');
  const [submittingOrder, setSubmittingOrder] = useState(false);

  // แคชเชียร์ & เช็กบิลเต็ม
  const [selectedOrderForPayment, setSelectedOrderForPayment] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('promptpay'); // 'cash' | 'promptpay'
  const [cashReceived, setCashReceived] = useState('');
  const [processingPayment, setProcessingPayment] = useState(false);
  const [restaurantPaymentInfo, setRestaurantPaymentInfo] = useState(null);
  const [receiptModalVisible, setReceiptModalVisible] = useState(false);
  const [lastCompletedReceipt, setLastCompletedReceipt] = useState(null);

  // ระบบสมาชิกกลาง (Global Member) ตอนเช็กบิล
  const [memberPhoneInput, setMemberPhoneInput] = useState('');
  const [selectedMember, setSelectedMember] = useState(null);
  const [memberNotFound, setMemberNotFound] = useState(false);
  const [newMemberNameInput, setNewMemberNameInput] = useState('');
  const [searchingMember, setSearchingMember] = useState(false);
  const isMemberActionRef = useRef(false);

  // ระบบย้ายโต๊ะ / รวมโต๊ะ
  const [moveTableModalVisible, setMoveTableModalVisible] = useState(false);
  const [sourceTable, setSourceTable] = useState(null);
  const [targetTableId, setTargetTableId] = useState(null);
  const [movingTable, setMovingTable] = useState(false);

  // ระบบแยกบิล (Split Bill)
  const [splitBillModalVisible, setSplitBillModalVisible] = useState(false);
  const [selectedOrderForSplit, setSelectedOrderForSplit] = useState(null);
  const [splitMode, setSplitMode] = useState('equal'); // 'equal' (หารเท่า) | 'item' (แยกตามจาน)
  const [splitPersonCount, setSplitPersonCount] = useState(2);
  const [paidSplitsCount, setPaidSplitsCount] = useState(0);
  const [selectedItemIdsForSplit, setSelectedItemIdsForSplit] = useState([]);
  const [splitPayMethod, setSplitPayMethod] = useState('promptpay');

  // โมดอลยืนยันการเคลียร์โต๊ะว่าง
  const [tableToClear, setTableToClear] = useState(null);
  const [clearingTable, setClearingTable] = useState(false);

  const prevOrdersCountRef = useRef(0);
  const kickedOutRef = useRef(false);
  const isMountedRef = useRef(true);
  const isSubmittingStaffOrderRef = useRef(false);
  const isProcessingPaymentRef = useRef(false);
  const isProcessingSplitRef = useRef(false);
  const isMovingTableRef = useRef(false);
  const isClearingTableRef = useRef(false);
  const updatingOrderIdsRef = useRef(new Set());

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const handleKickOutInvalidToken = () => {
    if (kickedOutRef.current) return;
    kickedOutRef.current = true;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      try {
        localStorage.removeItem('buddypos_recent_staff_store');
      } catch (e) {}
      alert('QR Code พนักงานถูกเปลี่ยนใหม่\n\nเจ้าของร้านได้สร้าง QR Code พนักงานชุดใหม่แล้ว กรุณาสแกนเข้าสู่ระบบใหม่อีกครั้ง');
      if (onBack) onBack();
    } else {
      Alert.alert(
        'QR Code พนักงานถูกเปลี่ยนใหม่',
        'เจ้าของร้านได้สร้าง QR Code พนักงานชุดใหม่แล้ว กรุณาสแกนเข้าสู่ระบบใหม่อีกครั้ง',
        [{ text: 'ตกลง', onPress: () => onBack && onBack() }]
      );
    }
  };

  const verifyStaffTokenSession = async () => {
    if (!restaurantId) return false;
    if (!store?.staffToken) {
      handleKickOutInvalidToken();
      return false;
    }
    try {
      const { data, error } = await supabase
        .from('restaurants')
        .select('id, name, status, staff_token, promptpay_id, promptpay_type, promptpay_name, bank_name, bank_account_no, bank_account_name, vat_rate, service_charge_rate')
        .eq('id', restaurantId)
        .maybeSingle();

      if (error || !data || data.staff_token !== store.staffToken || data.status === 'suspended') {
        handleKickOutInvalidToken();
        return false;
      }

      if (isMountedRef.current) {
        setRestaurantPaymentInfo({
          name: data.name,
          promptpay_id: data.promptpay_id,
          promptpay_type: data.promptpay_type || 'phone',
          promptpay_name: data.promptpay_name,
          bank_name: data.bank_name,
          bank_account_no: data.bank_account_no,
          bank_account_name: data.bank_account_name,
          vat_rate: Number(data.vat_rate) || 0,
          service_charge_rate: Number(data.service_charge_rate) || 0,
        });
      }
      return true;
    } catch (e) {
      return true;
    }
  };

  useEffect(() => {
    fetchInitialData();

    // เปิดรับข้อมูล Realtime จากตาราง orders
    const ordersChannel = supabase
      .channel('staff-orders-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        (payload) => {
          if (!isMountedRef.current) return;
          if (payload.eventType === 'INSERT') {
            if (soundEnabled) playChimeSound();
          }
          fetchOrders();
          fetchTables();
        }
      )
      .subscribe();

    // เปิดรับข้อมูล Realtime จากตาราง tables
    const tablesChannel = supabase
      .channel('staff-tables-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tables' },
        () => {
          if (!isMountedRef.current) return;
          fetchTables();
        }
      )
      .subscribe();

    // เปิดรับข้อมูล Realtime จากตาราง restaurants เพื่อตรวจสอบเมื่อเจ้าของร้านเปลี่ยน staff_token
    const restaurantChannel = supabase
      .channel(`staff-restaurant-token-${restaurantId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'restaurants',
          filter: `id=eq.${restaurantId}`,
        },
        (payload) => {
          if (!isMountedRef.current) return;
          if (payload.new && (payload.new.staff_token !== store?.staffToken || payload.new.status === 'suspended')) {
            handleKickOutInvalidToken();
          } else if (payload.new) {
            setRestaurantPaymentInfo({
              name: payload.new.name,
              promptpay_id: payload.new.promptpay_id,
              promptpay_type: payload.new.promptpay_type || 'phone',
              promptpay_name: payload.new.promptpay_name,
              bank_name: payload.new.bank_name,
              bank_account_no: payload.new.bank_account_no,
              bank_account_name: payload.new.bank_account_name,
              vat_rate: Number(payload.new.vat_rate) || 0,
              service_charge_rate: Number(payload.new.service_charge_rate) || 0,
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ordersChannel);
      supabase.removeChannel(tablesChannel);
      supabase.removeChannel(restaurantChannel);
    };
  }, [restaurantId, soundEnabled, store?.staffToken]);

  // โหลดข้อมูลเริ่มต้น: ตรวจสอบ Token, โต๊ะ, เมนู, ออเดอร์
  const fetchInitialData = async () => {
    try {
      if (isMountedRef.current) setLoading(true);
      const isValid = await verifyStaffTokenSession();
      if (!isValid) return;
      await Promise.all([fetchTables(), fetchMenus(), fetchOrders()]);
    } catch (err) {
      console.error('Initial data error:', err);
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  };

  const fetchTables = async () => {
    try {
      const { data, error } = await supabase
        .from('tables')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .order('table_number', { ascending: true });

      if (!isMountedRef.current) return;

      if (!error && data) {
        const sortedTables = [...data].sort((a, b) => {
          const numA = parseInt((a.table_number || '').replace(/\D/g, '') || '999', 10);
          const numB = parseInt((b.table_number || '').replace(/\D/g, '') || '999', 10);
          return numA - numB;
        });
        setTables(sortedTables);
        if (!selectedTableForOrder && sortedTables.length > 0) {
          setSelectedTableForOrder(sortedTables[0]);
        }
      }
    } catch (err) {
      console.warn('Fetch tables error:', err);
    }
  };

  const fetchMenus = async () => {
    try {
      const { data, error } = await supabase
        .from('menu_items')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .eq('is_available', true)
        .order('name', { ascending: true });

      if (!isMountedRef.current) return;
      if (error) throw error;
      setMenus(data || []);
    } catch (err) {
      console.warn('Fetch menus error:', err);
      if (isMountedRef.current) {
        setMenus([]);
      }
    }
  };

  const fetchOrders = async () => {
    try {
      // ดึงออเดอร์เฉพาะร้านนี้โดยตรงด้วย restaurant_id
      const { data, error } = await supabase
        .from('orders')
        .select(`
          id,
          restaurant_id,
          table_id,
          total_amount,
          status,
          notes,
          created_at,
          payment_method,
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
        .eq('restaurant_id', restaurantId)
        .in('status', ['pending', 'cooking', 'ready', 'served'])
        .order('created_at', { ascending: true });

      if (!isMountedRef.current) return;
      if (!error && data) {
        setOrders(data);
        prevOrdersCountRef.current = data.length;
      }
    } catch (err) {
      console.warn('Fetch orders error:', err);
    }
  };

  const showNotice = (title, msg) => {
    if (Platform.OS === 'web') alert(`${title}\n\n${msg}`);
    else Alert.alert(title, msg);
  };

  // แมปชื่อโต๊ะจาก table_id
  const getTableName = (tableId) => {
    const found = tables.find((t) => t.id === tableId || t.table_number === `โต๊ะ ${tableId}`);
    return found ? found.table_number : `โต๊ะ ${tableId || '-'}`;
  };

  // Helper คำนวณเวลาที่สั่ง (เช่น "5 นาทีที่แล้ว")
  const getTimeElapsed = (dateString) => {
    if (!dateString) return '';
    const diffMin = Math.floor((new Date() - new Date(dateString)) / 60000);
    if (diffMin <= 0) return 'เมื่อสักครู่';
    if (diffMin < 60) return `${diffMin} นาทีที่แล้ว`;
    return `${Math.floor(diffMin / 60)} ชม. ที่แล้ว`;
  };

  // ฟังก์ชันเคลียร์สถานะโต๊ะกลับเป็น 'available' (ว่าง) โดยค้นหา UUID ของโต๊ะจากหมายเลขโต๊ะ
  const releaseTableByOrder = async (tableIdOrNum) => {
    if (!tableIdOrNum) return;
    try {
      // ตรวจสอบก่อนว่าโต๊ะนี้ยังมีออเดอร์อื่นที่ยังไม่ชำระเงินค้างอยู่หรือไม่
      const { data: remainingOrders } = await supabase
        .from('orders')
        .select('id')
        .eq('restaurant_id', restaurantId)
        .eq('table_id', Number(tableIdOrNum))
        .in('status', ['pending', 'cooking', 'ready', 'served']);

      if (remainingOrders && remainingOrders.length > 0) {
        return;
      }

      // ค้นหาโต๊ะจากรายการโต๊ะของร้านนี้ที่ตรงกับเลขโต๊ะ
      const matchedTables = tables.filter((t) => {
        const raw = t.table_number ? t.table_number.replace(/\D/g, '') : '';
        const tNum = raw ? parseInt(raw, 10) : null;
        return t.id === tableIdOrNum || tNum === Number(tableIdOrNum);
      });

      if (matchedTables.length > 0) {
        const ids = matchedTables.map((t) => t.id);
        await supabase.from('tables').update({ status: 'available', occupied_at: null }).in('id', ids);
      } else {
        await supabase
          .from('tables')
          .update({ status: 'available', occupied_at: null })
          .eq('restaurant_id', restaurantId)
          .eq('table_number', `โต๊ะ ${tableIdOrNum}`);
      }
    } catch (err) {
      console.warn('Release table error:', err);
    }
  };

  // เปิดหน้าต่างยืนยันก่อนเคลียร์โต๊ะ
  const handleOpenClearTableModal = (table, tableOrders = [], tableTotal = 0) => {
    if (!table) return;
    setTableToClear({ table, tableOrders, tableTotal });
  };

  // ยืนยันเคลียร์โต๊ะว่าง (รองรับทุกโต๊ะ ทั้งที่กำลังเลือกเมนูและที่สั่งอาหารแล้ว)
  const handleConfirmClearTable = async () => {
    if (isClearingTableRef.current) return;
    if (!tableToClear?.table) return;
    const { table, tableOrders } = tableToClear;
    try {
      isClearingTableRef.current = true;
      if (isMountedRef.current) {
        setClearingTable(true);
      }

      // 1. หากโต๊ะนี้มีออเดอร์ค้างอยู่ ให้เปลี่ยนสถานะออเดอร์เหล่านั้นเป็น 'cancelled'
      if (tableOrders && tableOrders.length > 0) {
        const orderIds = tableOrders.map((o) => o.id);
        const { error: cancelErr } = await supabase
          .from('orders')
          .update({ status: 'cancelled' })
          .in('id', orderIds);
        if (cancelErr) throw cancelErr;
      }

      // 2. ปรับสถานะโต๊ะกลับเป็น 'available' (ว่าง) และล้างเวลา occupied_at
      const { error: tblErr } = await supabase
        .from('tables')
        .update({ status: 'available', occupied_at: null })
        .eq('id', table.id);

      if (tblErr) throw tblErr;

      if (isMountedRef.current) {
        setTableToClear(null);
      }
      await Promise.all([fetchOrders(), fetchTables()]);
      if (isMountedRef.current) {
        showNotice(
          'เคลียร์โต๊ะสำเร็จ',
          `ปรับสถานะ ${table.table_number} กลับเป็น "โต๊ะว่าง" และตัดลิงก์ลูกค้าเรียบร้อยแล้ว`
        );
      }
    } catch (err) {
      if (isMountedRef.current) {
        showNotice('เกิดข้อผิดพลาด', err.message || 'ไม่สามารถเคลียร์โต๊ะได้');
      }
    } finally {
      isClearingTableRef.current = false;
      if (isMountedRef.current) {
        setClearingTable(false);
      }
    }
  };

  // ตรวจสอบโต๊ะที่ถูกสแกน QR ค้างไว้แต่ไม่สั่งอาหารเกิน 15 นาที เพื่อคืนสถานะเป็น "ว่าง" อัตโนมัติ
  useEffect(() => {
    const IDLE_LIMIT_MS = 15 * 60 * 1000;
    const timer = setInterval(async () => {
      if (!isMountedRef.current || !tables || tables.length === 0) return;
      const now = Date.now();

      for (const t of tables) {
        if (t.status === 'occupied' && t.occupied_at) {
          const raw = t.table_number ? t.table_number.replace(/\D/g, '') : '';
          const tNum = raw ? parseInt(raw, 10) : null;
          const hasActiveOrder = orders.some((o) => Number(o.table_id) === tNum);

          if (!hasActiveOrder) {
            const elapsed = now - new Date(t.occupied_at).getTime();
            if (elapsed >= IDLE_LIMIT_MS) {
              await supabase
                .from('tables')
                .update({ status: 'available', occupied_at: null })
                .eq('id', t.id);
              if (isMountedRef.current) {
                fetchTables();
              }
            }
          }
        }
      }
    }, 10000);

    return () => clearInterval(timer);
  }, [tables, orders]);

  // -------------------------------------------------------------
  // ระบบห้องครัว (Kitchen KDS)
  // -------------------------------------------------------------
  const updateOrderStatus = async (orderId, newStatus) => {
    if (updatingOrderIdsRef.current.has(orderId)) return;
    try {
      updatingOrderIdsRef.current.add(orderId);
      const targetOrder = orders.find((o) => o.id === orderId);
      const { error } = await supabase
        .from('orders')
        .update({ status: newStatus })
        .eq('id', orderId);

      if (error) throw error;

      if (newStatus === 'cancelled' && targetOrder?.table_id) {
        await releaseTableByOrder(targetOrder.table_id);
      }

      await Promise.all([fetchOrders(), fetchTables()]);
    } catch (err) {
      if (isMountedRef.current) {
        showNotice('เกิดข้อผิดพลาด', err.message);
      }
    } finally {
      updatingOrderIdsRef.current.delete(orderId);
    }
  };

  // คำนวณลำดับรอบของออเดอร์แต่ละโต๊ะสำหรับแสดงป้าย "สั่งเพิ่ม #2" บนการ์ดห้องครัว
  const tableOrderRoundMap = useMemo(() => {
    const map = {};
    const countsByTable = {};
    orders.forEach((o) => {
      const tKey = String(o.table_id);
      countsByTable[tKey] = (countsByTable[tKey] || 0) + 1;
      const roundNum = countsByTable[tKey];
      const hasNoteAddOn = o.notes && o.notes.includes('สั่งเพิ่ม');
      const isAddOn = roundNum > 1 || hasNoteAddOn;
      map[o.id] = {
        roundNum,
        isAddOn,
        badgeText: hasNoteAddOn ? o.notes : roundNum > 1 ? `สั่งเพิ่ม #${roundNum}` : null,
      };
    });
    return map;
  }, [orders]);

  // รวมบิลทุกรอบของโต๊ะเดียวกันให้เป็น 1 บิลรวมของโต๊ะในหน้าแคชเชียร์ (พร้อมแยกสถานะและปุ่มเสิร์ฟรายรอบ)
  const cashierTableBills = useMemo(() => {
    const grouped = {};
    orders.forEach((order) => {
      const tKey = String(order.table_id);
      if (!grouped[tKey]) {
        grouped[tKey] = {
          id: order.id,
          orderIds: [],
          table_id: order.table_id,
          restaurant_id: order.restaurant_id,
          total_amount: 0,
          created_at: order.created_at,
          ordersCount: 0,
          unservedCount: 0,
          readyToServeCount: 0,
          rounds: [],
          order_items: [],
        };
      }
      const group = grouped[tKey];
      group.orderIds.push(order.id);
      group.ordersCount += 1;
      group.total_amount += Number(order.total_amount || 0);
      if (order.status !== 'served') {
        group.unservedCount += 1;
      }
      if (order.status === 'ready') {
        group.readyToServeCount += 1;
      }
      const roundNum = group.ordersCount;
      const hasNoteAddOn = order.notes && order.notes.includes('สั่งเพิ่ม');
      const roundLabel = hasNoteAddOn
        ? order.notes
        : roundNum > 1
        ? `สั่งเพิ่ม #${roundNum}`
        : 'ออเดอร์เปิดโต๊ะ';

      group.rounds.push({
        id: order.id,
        roundNum,
        roundLabel,
        status: order.status,
        total_amount: order.total_amount,
        created_at: order.created_at,
        order_items: order.order_items || [],
      });

      (order.order_items || []).forEach((item) => {
        group.order_items.push({
          ...item,
          roundNum,
          orderId: order.id,
          orderStatus: order.status,
        });
      });
    });
    return Object.values(grouped);
  }, [orders]);

  // รายการออเดอร์ที่ครัวกดยืนยันพร้อมเสิร์ฟแล้ว ('ready') สำหรับแท็บย่อย "1. รอเสิร์ฟ" ในหน้าแคชเชียร์
  const readyToServeOrders = useMemo(() => {
    return orders.filter((o) => o.status === 'ready');
  }, [orders]);

  // คิวงานหลักของห้องครัว: แสดงเฉพาะออเดอร์ที่รอทำ ('pending') และกำลังปรุง ('cooking')
  // เมื่อครัวกด "ยืนยันพร้อมเสิร์ฟ" ('ready') การ์ดจะออกจากคิวห้องครัวทันทีเพื่อไปรอเสิร์ฟที่หน้าแคชเชียร์
  const activeKitchenOrders = useMemo(() => {
    return orders.filter((o) => o.status === 'pending' || o.status === 'cooking');
  }, [orders]);

  const kitchenOrders = useMemo(() => {
    const list =
      kitchenFilter === 'all'
        ? [...activeKitchenOrders]
        : activeKitchenOrders.filter((o) => o.status === kitchenFilter);
    const statusWeight = { pending: 1, cooking: 2 };
    return list.sort((a, b) => {
      const wA = statusWeight[a.status] || 9;
      const wB = statusWeight[b.status] || 9;
      if (wA !== wB) return wA - wB;
      return new Date(a.created_at) - new Date(b.created_at);
    });
  }, [activeKitchenOrders, kitchenFilter]);

  // -------------------------------------------------------------
  // ระบบแคชเชียร์ & เช็กบิล (Cashier & Checkout - รวมทุกรอบของโต๊ะเดียวกัน)
  // -------------------------------------------------------------
  const currentCheckoutBreakdown = useMemo(() => {
    if (!selectedOrderForPayment) return { subtotal: 0, serviceCharge: 0, vat: 0, grandTotal: 0 };
    const subtotal = Number(selectedOrderForPayment.total_amount || 0);
    const vatRate = Number(restaurantPaymentInfo?.vat_rate || 0);
    const serviceRate = Number(restaurantPaymentInfo?.service_charge_rate || 0);
    return calculateBillBreakdown(subtotal, vatRate, serviceRate);
  }, [selectedOrderForPayment, restaurantPaymentInfo]);

  const handleOpenPaymentModal = (orderOrTableBill) => {
    setSelectedOrderForPayment(orderOrTableBill);
    setPaymentMethod('promptpay');
    setCashReceived('');
    setMemberPhoneInput('');
    setSelectedMember(null);
    setMemberNotFound(false);
    setNewMemberNameInput('');
  };

  const handleLookupMember = async () => {
    if (isMemberActionRef.current) return;
    const cleanPhone = (memberPhoneInput || '').replace(/[^0-9]/g, '');
    if (cleanPhone.length !== 10 || !cleanPhone.startsWith('0')) {
      showNotice('คำเตือน', 'กรุณาระบุเบอร์โทรศัพท์สมาชิก 10 หลัก (ขึ้นต้นด้วย 0)');
      return;
    }

    try {
      isMemberActionRef.current = true;
      if (isMountedRef.current) setSearchingMember(true);

      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('phone', cleanPhone)
        .maybeSingle();

      if (error) throw error;

      if (isMountedRef.current) {
        if (data) {
          setSelectedMember(data);
          setMemberNotFound(false);
        } else {
          setSelectedMember(null);
          setMemberNotFound(true);
          setNewMemberNameInput('');
        }
      }
    } catch (err) {
      if (isMountedRef.current) {
        showNotice('เกิดข้อผิดพลาด', 'ค้นหาสมาชิกไม่สำเร็จ: ' + err.message);
      }
    } finally {
      isMemberActionRef.current = false;
      if (isMountedRef.current) setSearchingMember(false);
    }
  };

  const handleQuickRegisterMember = async () => {
    if (isMemberActionRef.current) return;
    const cleanPhone = (memberPhoneInput || '').replace(/[^0-9]/g, '');
    if (cleanPhone.length !== 10 || !cleanPhone.startsWith('0')) {
      showNotice('คำเตือน', 'เบอร์โทรศัพท์ต้องมี 10 หลัก');
      return;
    }

    const cleanName = newMemberNameInput.trim() || 'ลูกค้าสมาชิก';

    try {
      isMemberActionRef.current = true;
      if (isMountedRef.current) setSearchingMember(true);

      const { data, error } = await supabase
        .from('customers')
        .insert([{ phone: cleanPhone, name: cleanName }])
        .select()
        .single();

      if (error) throw error;

      if (isMountedRef.current && data) {
        setSelectedMember(data);
        setMemberNotFound(false);
      }
    } catch (err) {
      if (isMountedRef.current) {
        showNotice('เกิดข้อผิดพลาด', 'ไม่สามารถสมัครสมาชิกได้: ' + err.message);
      }
    } finally {
      isMemberActionRef.current = false;
      if (isMountedRef.current) setSearchingMember(false);
    }
  };

  const handleConfirmPayment = async () => {
    if (isProcessingPaymentRef.current) return;
    if (!selectedOrderForPayment) return;

    const subtotal = Number(selectedOrderForPayment.total_amount || 0);
    const vatRate = Number(restaurantPaymentInfo?.vat_rate || 0);
    const serviceRate = Number(restaurantPaymentInfo?.service_charge_rate || 0);
    const breakdown = calculateBillBreakdown(subtotal, vatRate, serviceRate);
    const targetGrandTotal = breakdown.grandTotal;

    if (paymentMethod === 'cash') {
      const received = parseFloat(cashReceived);
      if (isNaN(received) || received < targetGrandTotal) {
        showNotice('คำเตือน', 'กรุณาระบุจำนวนเงินที่รับมาให้ครบตามยอดชำระ');
        return;
      }
    }

    try {
      isProcessingPaymentRef.current = true;
      if (isMountedRef.current) {
        setProcessingPayment(true);
      }

      const targetOrderIds = selectedOrderForPayment.orderIds || [selectedOrderForPayment.id];
      const primaryOrderId = targetOrderIds[0];
      const secondaryOrderIds = targetOrderIds.slice(1);
      const received =
        paymentMethod === 'cash'
          ? parseFloat(cashReceived) || targetGrandTotal
          : targetGrandTotal;
      const change = Math.max(0, received - targetGrandTotal);

      // 1. หากโต๊ะนี้มีออเดอร์สั่งเพิ่มหลายรอบ ให้ย้ายรายการอาหารมารวมที่บิลหลักใบแรก
      //    และปิดบิลย่อยด้วยยอด 0 เพื่อไม่ให้รายงานยอดขายและประวัติสมาชิกนับยอดซ้ำซ้อน
      if (secondaryOrderIds.length > 0) {
        await supabase
          .from('order_items')
          .update({ order_id: primaryOrderId })
          .in('order_id', secondaryOrderIds);

        const { error: secErr } = await supabase
          .from('orders')
          .update({
            status: 'paid',
            payment_method: paymentMethod,
            payment_amount: 0,
            change_amount: 0,
            subtotal: 0,
            vat_amount: 0,
            service_charge_amount: 0,
            total_amount: 0,
            customer_id: null,
            customer_phone: null,
            customer_name: null,
          })
          .in('id', secondaryOrderIds);

        if (secErr) throw secErr;
      }

      // 1.1 อัปเดตบิลหลักของโต๊ะนี้เป็น 'paid' พร้อมรายละเอียดการชำระเงินและข้อมูลสมาชิกครบถ้วน
      const { error: orderError } = await supabase
        .from('orders')
        .update({
          status: 'paid',
          payment_method: paymentMethod,
          payment_amount: received,
          change_amount: change,
          subtotal: breakdown.subtotal,
          vat_amount: breakdown.vat,
          service_charge_amount: breakdown.serviceCharge,
          total_amount: targetGrandTotal,
          customer_id: selectedMember ? selectedMember.id : null,
          customer_phone: selectedMember ? selectedMember.phone : null,
          customer_name: selectedMember ? selectedMember.name : null,
        })
        .eq('id', primaryOrderId);

      if (orderError) throw orderError;

      // 1.1 บันทึกประวัติยอดซื้อและจำนวนครั้งที่มาใช้บริการของสมาชิก (Global Member)
      if (selectedMember?.id) {
        await supabase.rpc('record_customer_visit', {
          p_customer_id: selectedMember.id,
          p_amount: targetGrandTotal,
        });
      }

      // 2. เคลียร์สถานะโต๊ะกลับเป็น 'available' (ว่าง) ด้วย UUID ของโต๊ะที่ถูกต้อง
      if (selectedOrderForPayment.table_id) {
        await releaseTableByOrder(selectedOrderForPayment.table_id);
      }

      const receiptData = {
        storeName: restaurantPaymentInfo?.name || restaurantName,
        tableNumber: getTableName(selectedOrderForPayment.table_id),
        orderIds: targetOrderIds,
        date: new Date().toLocaleString('th-TH'),
        items: selectedOrderForPayment.order_items || [],
        subtotal: breakdown.subtotal,
        serviceCharge: breakdown.serviceCharge,
        serviceChargeRate: serviceRate,
        vat: breakdown.vat,
        vatRate: vatRate,
        grandTotal: targetGrandTotal,
        paymentMethod: paymentMethod,
        paymentAmount: received,
        changeAmount: change,
        memberName: selectedMember ? selectedMember.name : null,
        memberPhone: selectedMember ? selectedMember.phone : null,
        memberVisits: selectedMember ? (Number(selectedMember.visit_count) || 0) + 1 : null,
        memberTotalSpent: selectedMember
          ? (Number(selectedMember.total_spent) || 0) + targetGrandTotal
          : null,
      };

      if (isMountedRef.current) {
        setSelectedOrderForPayment(null);
        setLastCompletedReceipt(receiptData);
        setReceiptModalVisible(true);
      }
      await Promise.all([fetchOrders(), fetchTables()]);
    } catch (err) {
      if (isMountedRef.current) {
        showNotice('เกิดข้อผิดพลาด', err.message);
      }
    } finally {
      isProcessingPaymentRef.current = false;
      if (isMountedRef.current) {
        setProcessingPayment(false);
      }
    }
  };

  // -------------------------------------------------------------
  // ระบบแยกบิล (Split Bill)
  // -------------------------------------------------------------
  const handleOpenSplitBillModal = (orderOrTableBill) => {
    setSelectedOrderForSplit(orderOrTableBill);
    setSplitMode('equal');
    setSplitPersonCount(2);
    setPaidSplitsCount(0);
    setSelectedItemIdsForSplit([]);
    setSplitPayMethod('promptpay');
    setSplitBillModalVisible(true);
  };

  // คำนวณยอดสุทธิรวม VAT & Service Charge สำหรับโหมดแยกบิล
  const currentSplitBreakdown = useMemo(() => {
    if (!selectedOrderForSplit) return { subtotal: 0, serviceCharge: 0, vat: 0, grandTotal: 0 };
    const subtotal = Number(selectedOrderForSplit.total_amount || 0);
    const vatRate = Number(restaurantPaymentInfo?.vat_rate || 0);
    const serviceRate = Number(restaurantPaymentInfo?.service_charge_rate || 0);
    return calculateBillBreakdown(subtotal, vatRate, serviceRate);
  }, [selectedOrderForSplit, restaurantPaymentInfo]);

  // บันทึกการจ่ายของ 1 คน (กรณีหารเท่า)
  const handlePayOneEqualSplit = async () => {
    if (isProcessingSplitRef.current) return;
    if (!selectedOrderForSplit) return;

    try {
      isProcessingSplitRef.current = true;
      const nextCount = paidSplitsCount + 1;
      if (isMountedRef.current) {
        setPaidSplitsCount(nextCount);
      }

      if (nextCount >= splitPersonCount) {
        const targetOrderIds = selectedOrderForSplit.orderIds || [selectedOrderForSplit.id];
        const primaryOrderId = targetOrderIds[0];
        const secondaryOrderIds = targetOrderIds.slice(1);

        if (secondaryOrderIds.length > 0) {
          await supabase
            .from('order_items')
            .update({ order_id: primaryOrderId })
            .in('order_id', secondaryOrderIds);

          await supabase
            .from('orders')
            .update({
              status: 'paid',
              payment_method: splitPayMethod,
              payment_amount: 0,
              change_amount: 0,
              subtotal: 0,
              vat_amount: 0,
              service_charge_amount: 0,
              total_amount: 0,
            })
            .in('id', secondaryOrderIds);
        }

        // ครบทุกคนแล้ว -> ปิดบิลหลักของโต๊ะนี้สมบูรณ์พร้อมบันทึก VAT/Service Charge
        await supabase
          .from('orders')
          .update({
            status: 'paid',
            payment_method: splitPayMethod,
            subtotal: currentSplitBreakdown.subtotal,
            vat_amount: currentSplitBreakdown.vat,
            service_charge_amount: currentSplitBreakdown.serviceCharge,
            total_amount: currentSplitBreakdown.grandTotal,
            payment_amount: currentSplitBreakdown.grandTotal,
            change_amount: 0,
          })
          .eq('id', primaryOrderId);
        if (selectedOrderForSplit.table_id) {
          await releaseTableByOrder(selectedOrderForSplit.table_id);
        }
        if (isMountedRef.current) {
          showNotice('ชำระครบแล้ว!', `ชำระเงินครบทั้ง ${splitPersonCount} คนแล้ว โต๊ะนี้ว่างพร้อมรับลูกค้าใหม่ครับ`);
          setSplitBillModalVisible(false);
        }
        await Promise.all([fetchOrders(), fetchTables()]);
      } else {
        if (isMountedRef.current) {
          showNotice(
            'บันทึกสำเร็จ',
            `คนที่ ${nextCount} ชำระเงินเรียบร้อย (เหลืออีก ${splitPersonCount - nextCount} คน)`
          );
        }
      }
    } catch (err) {
      if (isMountedRef.current) {
        showNotice('เกิดข้อผิดพลาดในการแยกบิล', err.message);
      }
    } finally {
      isProcessingSplitRef.current = false;
    }
  };

  // ยอดต่อคนกรณีหารเท่า (คิดจากยอดสุทธิรวม VAT & Service Charge)
  const splitAmountPerPerson = useMemo(() => {
    if (!selectedOrderForSplit || splitPersonCount <= 0) return 0;
    return (currentSplitBreakdown.grandTotal / splitPersonCount).toFixed(2);
  }, [selectedOrderForSplit, currentSplitBreakdown, splitPersonCount]);

  // -------------------------------------------------------------
  // ระบบรับออเดอร์หน้าร้าน (Take Order)
  // -------------------------------------------------------------
  const handleAddToCart = (menuItem) => {
    setCart((prev) => {
      const index = prev.findIndex((i) => i.id === menuItem.id);
      if (index > -1) {
        const next = [...prev];
        next[index].qty += 1;
        return next;
      }
      return [...prev, { ...menuItem, qty: 1, note: '' }];
    });
  };

  const handleUpdateCartQty = (itemId, delta) => {
    setCart((prev) => {
      return prev
        .map((item) => {
          if (item.id === itemId) {
            const newQty = item.qty + delta;
            return newQty > 0 ? { ...item, qty: newQty } : null;
          }
          return item;
        })
        .filter(Boolean);
    });
  };

  const cartTotalAmount = cart.reduce((sum, item) => sum + item.price * item.qty, 0);

  const handleSubmitStaffOrder = async () => {
    if (isSubmittingStaffOrderRef.current) return;
    if (!selectedTableForOrder) {
      showNotice('คำเตือน', 'กรุณาเลือกโต๊ะอาหารก่อนส่งออเดอร์');
      return;
    }
    if (cart.length === 0) {
      showNotice('คำเตือน', 'กรุณาเลือกรายการอาหารอย่างน้อย 1 รายการ');
      return;
    }

    try {
      isSubmittingStaffOrderRef.current = true;
      if (isMountedRef.current) {
        setSubmittingOrder(true);
      }

      const rawNumber = selectedTableForOrder.table_number.replace(/\D/g, '');
      const parsedTableNum = rawNumber ? parseInt(rawNumber, 10) : 1;

      // ตรวจสอบว่าโต๊ะนี้มีออเดอร์ค้างอยู่กี่รอบแล้ว เพื่อติดป้าย "สั่งเพิ่ม #2", "สั่งเพิ่ม #3", ...
      const existingForTable = orders.filter((o) => Number(o.table_id) === parsedTableNum);
      const roundNumber = existingForTable.length + 1;
      const roundBadgeNote = roundNumber > 1 ? `สั่งเพิ่ม #${roundNumber}` : null;

      // 1. สร้างใบออเดอร์ใหม่ในตาราง orders เสมอ (เพื่อให้เด้งเป็นการ์ดใหม่ในห้องครัว)
      const { data: newOrder, error: orderErr } = await supabase
        .from('orders')
        .insert([
          {
            restaurant_id: restaurantId,
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

      // 2. บันทึกรายการอาหารใน order_items (พร้อม menu_item_id และ item_name)
      const orderItemsPayload = cart.map((item) => ({
        order_id: newOrder.id,
        menu_item_id: item.id && item.id.length === 36 ? item.id : null,
        item_name: item.name,
        category: item.category || 'ทั่วไป',
        quantity: item.qty,
        price_per_item: item.price,
        notes: item.note || null,
        status: 'pending',
      }));

      const { error: itemsErr } = await supabase.from('order_items').insert(orderItemsPayload);
      if (itemsErr) {
        // Recovery: Cancel the empty orphan order so it does not linger active
        await supabase
          .from('orders')
          .update({ status: 'cancelled' })
          .eq('id', newOrder.id);
        throw itemsErr;
      }

      // 3. อัปเดตสถานะโต๊ะเป็น 'occupied' (มีลูกค้า)
      await supabase
        .from('tables')
        .update({ status: 'occupied', occupied_at: new Date().toISOString() })
        .eq('id', selectedTableForOrder.id);

      if (soundEnabled) playChimeSound();

      if (isMountedRef.current) {
        showNotice('สำเร็จ!', `ส่งออเดอร์ของ ${selectedTableForOrder.table_number} เข้าห้องครัวแล้ว`);
        setCart([]);
        setActiveTab('kitchen'); // สลับไปดูจอครัว
      }
      await Promise.all([fetchOrders(), fetchTables()]);
    } catch (err) {
      if (isMountedRef.current) {
        showNotice('เกิดข้อผิดพลาดในการส่งออเดอร์', err.message);
      }
    } finally {
      isSubmittingStaffOrderRef.current = false;
      if (isMountedRef.current) {
        setSubmittingOrder(false);
      }
    }
  };

  // -------------------------------------------------------------
  // ระบบย้ายโต๊ะ / รวมโต๊ะ (Move Table)
  // -------------------------------------------------------------
  const handleOpenMoveTable = (tbl) => {
    setSourceTable(tbl);
    setTargetTableId(null);
    setMoveTableModalVisible(true);
  };

  const handleExecuteMoveTable = async () => {
    if (isMovingTableRef.current) return;
    if (!sourceTable || !targetTableId) {
      showNotice('คำเตือน', 'กรุณาเลือกโต๊ะปลายทางที่ต้องการย้ายไป');
      return;
    }

    const targetTableObj = tables.find((t) => t.id === targetTableId);
    if (!targetTableObj) return;

    try {
      isMovingTableRef.current = true;
      if (isMountedRef.current) {
        setMovingTable(true);
      }

      const targetNumber = targetTableObj.table_number.replace(/\D/g, '') || 1;
      const sourceNumber = sourceTable.table_number.replace(/\D/g, '') || 1;

      // 1. อัปเดต table_id ในออเดอร์ที่ค้างอยู่ของโต๊ะเดิมไปยังโต๊ะใหม่ (เฉพาะร้านนี้)
      await supabase
        .from('orders')
        .update({ table_id: parseInt(targetNumber, 10) })
        .eq('restaurant_id', restaurantId)
        .eq('table_id', parseInt(sourceNumber, 10))
        .in('status', ['pending', 'cooking', 'ready', 'served']);

      // 2. ปรับสถานะโต๊ะเดิมเป็น 'available' และโต๊ะใหม่เป็น 'occupied'
      await supabase.from('tables').update({ status: 'available', occupied_at: null }).eq('id', sourceTable.id);
      await supabase
        .from('tables')
        .update({ status: 'occupied', occupied_at: new Date().toISOString() })
        .eq('id', targetTableId);

      if (isMountedRef.current) {
        showNotice('สำเร็จ', `ย้ายจาก ${sourceTable.table_number} ไปยัง ${targetTableObj.table_number} เรียบร้อยแล้ว`);
        setMoveTableModalVisible(false);
      }
      await Promise.all([fetchTables(), fetchOrders()]);
    } catch (err) {
      if (isMountedRef.current) {
        showNotice('ย้ายโต๊ะไม่สำเร็จ', err.message);
      }
    } finally {
      isMovingTableRef.current = false;
      if (isMountedRef.current) {
        setMovingTable(false);
      }
    }
  };

  // สร้างหมวดหมู่ไดนามิกจากเมนูของร้านนี้เท่านั้น
  const dynamicCategories = useMemo(() => {
    const cats = new Set(['ทั้งหมด']);
    menus.forEach((m) => {
      if (m.category && m.category.trim()) cats.add(m.category.trim());
    });
    return Array.from(cats);
  }, [menus]);

  // เมนูที่ผ่านการกรองค้นหา & หมวดหมู่
  const filteredMenuItems = useMemo(() => {
    return menus.filter((m) => {
      const matchCat = selectedCategory === 'ทั้งหมด' || m.category === selectedCategory;
      const matchQuery = m.name.toLowerCase().includes(searchMenuQuery.toLowerCase());
      return matchCat && matchQuery;
    });
  }, [menus, selectedCategory, searchMenuQuery]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.surface} />

      {/* Top Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack} activeOpacity={0.7}>
          <Icon name="chevron-back" size={16} color={colors.textSecondary} />
          <Text style={styles.backBtnText}>ออกจากร้าน</Text>
        </TouchableOpacity>

        <View style={styles.storeInfoBox}>
          <Text style={styles.storeTitle} numberOfLines={1}>
            {restaurantName}
          </Text>
          <View style={styles.roleBadge}>
            <View style={styles.greenPulseDot} />
            <Text style={styles.roleBadgeText}>โหมดพนักงานหน้าร้าน (Staff Mode)</Text>
          </View>
        </View>

        {/* ปุ่มเปิด/ปิดเสียงแจ้งเตือน */}
        <TouchableOpacity
          style={[styles.soundBtn, soundEnabled ? styles.soundBtnOn : styles.soundBtnOff]}
          onPress={() => setSoundEnabled(!soundEnabled)}
          activeOpacity={0.8}
        >
          <Icon
            name={soundEnabled ? 'volume-high-outline' : 'volume-mute-outline'}
            size={15}
            color={soundEnabled ? colors.primaryDeep : colors.danger}
          />
          <Text style={[styles.soundBtnText, !soundEnabled && { color: colors.danger }]}>
            {soundEnabled ? 'เสียงเปิด' : 'ปิดเสียง'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* แถบ Tab หลัก 4 โหมด */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'kitchen' && styles.tabItemActive]}
          onPress={() => setActiveTab('kitchen')}
        >
          <Icon
            name="flame-outline"
            size={18}
            color={activeTab === 'kitchen' ? colors.primary : colors.textMuted}
          />
          <Text style={[styles.tabLabel, activeTab === 'kitchen' && styles.tabLabelActive]}>
            ห้องครัว
          </Text>
          {orders.filter((o) => o.status === 'pending' || o.status === 'cooking').length > 0 && (
            <View style={styles.badgeCount}>
              <Text style={styles.badgeCountText}>
                {orders.filter((o) => o.status === 'pending' || o.status === 'cooking').length}
              </Text>
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'cashier' && styles.tabItemActive]}
          onPress={() => setActiveTab('cashier')}
        >
          <Icon
            name="cash-outline"
            size={18}
            color={activeTab === 'cashier' ? colors.primary : colors.textMuted}
          />
          <Text style={[styles.tabLabel, activeTab === 'cashier' && styles.tabLabelActive]}>
            แคชเชียร์
          </Text>
          {cashierTableBills.length > 0 && (
            <View style={[styles.badgeCount, { backgroundColor: colors.info }]}>
              <Text style={styles.badgeCountText}>{cashierTableBills.length}</Text>
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'take_order' && styles.tabItemActive]}
          onPress={() => setActiveTab('take_order')}
        >
          <Icon
            name="create-outline"
            size={18}
            color={activeTab === 'take_order' ? colors.primary : colors.textMuted}
          />
          <Text style={[styles.tabLabel, activeTab === 'take_order' && styles.tabLabelActive]}>
            รับออเดอร์
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'tables' && styles.tabItemActive]}
          onPress={() => setActiveTab('tables')}
        >
          <Icon
            name="grid-outline"
            size={18}
            color={activeTab === 'tables' ? colors.primary : colors.textMuted}
          />
          <Text style={[styles.tabLabel, activeTab === 'tables' && styles.tabLabelActive]}>
            ผังโต๊ะ
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>กำลังเชื่อมต่อข้อมูลร้านค้าแบบ Realtime...</Text>
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          {/* ========================================================= */}
          {/* TAB 1: ห้องครัว (Kitchen Display KDS) */}
          {/* ========================================================= */}
          {activeTab === 'kitchen' && (
            <View style={{ flex: 1, padding: 16 }}>
              {/* ตัวกรองสถานะในครัว (เฉพาะรอทำและกำลังปรุง เมื่อกดยืนยันพร้อมเสิร์ฟจะย้ายไปรอเสิร์ฟที่หน้าแคชเชียร์ทันที) */}
              <View style={styles.filterRow}>
                {[
                  { id: 'all', icon: 'list-outline', label: `คิวทำอาหาร (${activeKitchenOrders.length})` },
                  { id: 'pending', icon: 'time-outline', label: `รอทำ (${orders.filter((o) => o.status === 'pending').length})` },
                  { id: 'cooking', icon: 'flame-outline', label: `กำลังปรุง (${orders.filter((o) => o.status === 'cooking').length})` },
                ].map((chip) => (
                  <TouchableOpacity
                    key={chip.id}
                    style={[styles.filterChip, kitchenFilter === chip.id && styles.filterChipActive]}
                    onPress={() => setKitchenFilter(chip.id)}
                  >
                    <Icon
                      name={chip.icon}
                      size={14}
                      color={kitchenFilter === chip.id ? colors.textOnPrimary : colors.textSecondary}
                    />
                    <Text
                      style={[
                        styles.filterChipText,
                        kitchenFilter === chip.id && styles.filterChipTextActive,
                      ]}
                    >
                      {chip.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
                {kitchenOrders.length === 0 ? (
                  <View style={styles.emptyState}>
                    <View style={styles.emptyIconCircle}>
                      <Icon name="restaurant-outline" size={32} color={colors.textFaint} />
                    </View>
                    <Text style={styles.emptyTitle}>ไม่มีออเดอร์ค้างในห้องครัว</Text>
                    <Text style={styles.emptySubtitle}>
                      เมื่อมีออเดอร์ใหม่เข้ามา รายการจะแสดงขึ้นที่นี่อัตโนมัติ (ออเดอร์ที่ยืนยันพร้อมเสิร์ฟแล้วจะส่งต่อให้หน้าแคชเชียร์ทันที)
                    </Text>
                  </View>
                ) : (
                  kitchenOrders.map((order) => {
                    const isPending = order.status === 'pending';
                    const isCooking = order.status === 'cooking';
                    const roundInfo = tableOrderRoundMap[order.id];

                    return (
                      <View
                        key={order.id}
                        style={[
                          styles.kitchenCard,
                          isPending && styles.cardPending,
                          isCooking && styles.cardCooking,
                        ]}
                      >
                        <View style={styles.kitchenCardHeader}>
                          <View style={{ flex: 1, paddingRight: 8 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                              <Text style={styles.tableName}>
                                {getTableName(order.table_id)}
                                {roundInfo?.isAddOn ? ` (${roundInfo.badgeText})` : ''} • ออเดอร์ #{order.id}
                              </Text>
                              {roundInfo?.isAddOn && (
                                <View style={styles.addOnBadge}>
                                  <Icon name="add-circle-outline" size={12} color={colors.danger} />
                                  <Text style={styles.addOnBadgeText}>{roundInfo.badgeText}</Text>
                                </View>
                              )}
                            </View>
                            <Text style={styles.orderTime}>{getTimeElapsed(order.created_at)}</Text>
                          </View>

                          <View
                            style={[
                              styles.statusTag,
                              isPending && styles.statusPendingTag,
                              isCooking && styles.statusCookingTag,
                            ]}
                          >
                            <Text
                              style={[
                                styles.statusTagText,
                                isPending && styles.statusPendingText,
                                isCooking && styles.statusCookingText,
                              ]}
                            >
                              {isPending && 'รอเริ่มทำ'}
                              {isCooking && 'กำลังปรุง'}
                            </Text>
                          </View>
                        </View>

                        <View style={styles.divider} />

                        {/* รายการอาหาร */}
                        <View style={styles.itemsList}>
                          {(order.order_items || []).map((sub, sIdx) => (
                            <View key={sIdx} style={styles.orderItemRow}>
                              <Text style={styles.orderItemName}>
                                • {sub.item_name || (sub.notes ? sub.notes.split(' (')[0] : `เมนู #${sIdx + 1}`)}
                              </Text>
                              <Text style={styles.orderItemQty}>x{sub.quantity}</Text>
                              {sub.notes && (
                                <Text style={styles.orderItemNote}>({sub.notes})</Text>
                              )}
                            </View>
                          ))}
                        </View>

                        {/* ปุ่มเปลี่ยนสถานะของห้องครัว (รับออเดอร์ -> ยืนยันพร้อมเสิร์ฟ แล้วส่งต่อให้หน้าแคชเชียร์ทันที) */}
                        <View style={styles.actionBtnRow}>
                          {isPending && (
                            <TouchableOpacity
                              style={styles.btnStartCook}
                              onPress={() => updateOrderStatus(order.id, 'cooking')}
                            >
                              <Icon name="flame-outline" size={16} color={colors.textOnPrimary} />
                              <Text style={styles.btnActionText}>รับออเดอร์ / เริ่มปรุงอาหาร</Text>
                            </TouchableOpacity>
                          )}

                          {isCooking && (
                            <TouchableOpacity
                              style={styles.btnFinishCook}
                              onPress={() => updateOrderStatus(order.id, 'ready')}
                            >
                              <Icon name="checkmark-circle-outline" size={16} color={colors.textOnPrimary} />
                              <Text style={styles.btnActionText}>ยืนยันพร้อมเสิร์ฟ (ส่งต่อหน้าแคชเชียร์)</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      </View>
                    );
                  })
                )}
              </ScrollView>
            </View>
          )}

          {/* ========================================================= */}
          {/* TAB 2: แคชเชียร์ (แบ่งเป็น 2 ส่วน: 1. รอเสิร์ฟ | 2. คิดเงิน) */}
          {/* ========================================================= */}
          {activeTab === 'cashier' && (
            <View style={{ flex: 1, padding: 16 }}>
              {/* แถบปุ่มสลับ 2 ส่วนในหน้าแคชเชียร์: 1. รอเสิร์ฟ | 2. คิดเงิน */}
              <View style={styles.cashierSubTabBar}>
                <TouchableOpacity
                  style={[
                    styles.cashierSubTabBtn,
                    cashierSubTab === 'serve' && styles.cashierSubTabBtnActiveServe,
                  ]}
                  onPress={() => setCashierSubTab('serve')}
                >
                  <Icon
                    name="notifications-outline"
                    size={16}
                    color={cashierSubTab === 'serve' ? colors.textOnPrimary : colors.textSecondary}
                  />
                  <Text
                    style={[
                      styles.cashierSubTabText,
                      cashierSubTab === 'serve' && styles.cashierSubTabTextActive,
                    ]}
                  >
                    1. รอเสิร์ฟ ({readyToServeOrders.length})
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.cashierSubTabBtn,
                    cashierSubTab === 'billing' && styles.cashierSubTabBtnActiveBilling,
                  ]}
                  onPress={() => setCashierSubTab('billing')}
                >
                  <Icon
                    name="wallet-outline"
                    size={16}
                    color={cashierSubTab === 'billing' ? colors.textOnPrimary : colors.textSecondary}
                  />
                  <Text
                    style={[
                      styles.cashierSubTabText,
                      cashierSubTab === 'billing' && styles.cashierSubTabTextActive,
                    ]}
                  >
                    2. คิดเงิน ({cashierTableBills.length})
                  </Text>
                </TouchableOpacity>
              </View>

              {/* --------------------------------------------------------- */}
              {/* ส่วนที่ 1: รอเสิร์ฟ (แสดงเฉพาะใบออเดอร์ที่ครัวยืนยันพร้อมเสิร์ฟแล้ว) */}
              {/* --------------------------------------------------------- */}
              {cashierSubTab === 'serve' && (
                <ScrollView contentContainerStyle={{ paddingBottom: 30 }}>
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>รายการอาหารพร้อมเสิร์ฟ (รอเดินเสิร์ฟ)</Text>
                    <Text style={styles.sectionSub}>
                      มีทั้งหมด {readyToServeOrders.length} ใบออเดอร์ที่ครัวทำเสร็จแล้ว รอกดยืนยันเสิร์ฟ
                    </Text>
                  </View>

                  {readyToServeOrders.length === 0 ? (
                    <View style={styles.emptyState}>
                      <View style={styles.emptyIconCircle}>
                        <Icon name="restaurant-outline" size={32} color={colors.textFaint} />
                      </View>
                      <Text style={styles.emptyTitle}>ไม่มีรายการรอเสิร์ฟในขณะนี้</Text>
                      <Text style={styles.emptySubtitle}>
                        เมื่อห้องครัวกด "ยืนยันพร้อมเสิร์ฟ" ใบออเดอร์จะเด้งขึ้นมาที่นี่ทันที
                      </Text>
                    </View>
                  ) : (
                    readyToServeOrders.map((order) => {
                      const roundInfo = tableOrderRoundMap[order.id];

                      return (
                        <View
                          key={`serve-order-${order.id}`}
                          style={[styles.kitchenCard, { borderLeftColor: colors.orangeStrong }]}
                        >
                          <View style={styles.kitchenCardHeader}>
                            <View style={{ flex: 1, paddingRight: 8 }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                                <Text style={styles.tableName}>
                                  {getTableName(order.table_id)}
                                  {roundInfo?.isAddOn ? ` (${roundInfo.badgeText})` : ''} • ออเดอร์ #{order.id}
                                </Text>
                                {roundInfo?.isAddOn ? (
                                  <View style={styles.addOnBadge}>
                                    <Icon name="add-circle-outline" size={12} color={colors.danger} />
                                    <Text style={styles.addOnBadgeText}>{roundInfo.badgeText}</Text>
                                  </View>
                                ) : (
                                  <View style={styles.cashierRoundTag}>
                                    <Text style={styles.cashierRoundTagText}>รอบที่ 1 (ออเดอร์เปิดโต๊ะ)</Text>
                                  </View>
                                )}
                              </View>
                              <Text style={styles.orderTime}>{getTimeElapsed(order.created_at)}</Text>
                            </View>

                            <View style={[styles.statusTag, { backgroundColor: colors.orangeSoft }]}>
                              <Icon name="notifications-outline" size={12} color={colors.orange} />
                              <Text style={[styles.statusTagText, { color: colors.orange, marginLeft: 4 }]}>
                                พร้อมเสิร์ฟ!
                              </Text>
                            </View>
                          </View>

                          <View style={styles.divider} />

                          <View style={styles.itemsList}>
                            {(order.order_items || []).map((sub, sIdx) => (
                              <View key={sub.id || sIdx} style={styles.orderItemRow}>
                                <Text style={styles.orderItemName}>
                                  • {sub.item_name || (sub.notes ? sub.notes.split(' (')[0] : `เมนู #${sIdx + 1}`)}
                                </Text>
                                <Text style={styles.orderItemQty}>x{sub.quantity}</Text>
                                {sub.notes && (
                                  <Text style={styles.orderItemNote}>({sub.notes})</Text>
                                )}
                              </View>
                            ))}
                          </View>

                          <View style={styles.actionBtnRow}>
                            <TouchableOpacity
                              style={styles.btnConfirmServeRound}
                              onPress={() => updateOrderStatus(order.id, 'served')}
                            >
                              <Icon name="checkmark-done-outline" size={16} color={colors.textOnPrimary} />
                              <Text style={styles.btnConfirmServeRoundText}>
                                กดยืนยัน: เสิร์ฟออเดอร์แล้ว
                              </Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      );
                    })
                  )}
                </ScrollView>
              )}

              {/* --------------------------------------------------------- */}
              {/* ส่วนที่ 2: คิดเงิน (แสดงทุกโต๊ะที่มีบิลเปิดอยู่ รวมบิลตามโต๊ะ) */}
              {/* --------------------------------------------------------- */}
              {cashierSubTab === 'billing' && (
                <ScrollView contentContainerStyle={{ paddingBottom: 30 }}>
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>รายการรอชำระเงิน (รวมบิลตามโต๊ะ)</Text>
                    <Text style={styles.sectionSub}>
                      มีทั้งหมด {cashierTableBills.length} โต๊ะที่ยังไม่ปิดยอด (จาก {orders.length} รอบออเดอร์)
                    </Text>
                  </View>

                  {cashierTableBills.length === 0 ? (
                    <View style={styles.emptyState}>
                      <View style={styles.emptyIconCircle}>
                        <Icon name="receipt-outline" size={32} color={colors.textFaint} />
                      </View>
                      <Text style={styles.emptyTitle}>ไม่มีบิลค้างชำระ</Text>
                      <Text style={styles.emptySubtitle}>ทุกโต๊ะชำระเงินเรียบร้อยแล้ว</Text>
                    </View>
                  ) : (
                    cashierTableBills.map((bill) => (
                      <View key={`table-bill-${bill.table_id}`} style={styles.cashierCard}>
                        <View style={styles.cashierCardHeader}>
                          <View style={{ flex: 1, paddingRight: 8 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              <Text style={styles.cashierTableTitle}>{getTableName(bill.table_id)}</Text>
                              {bill.ordersCount > 1 && (
                                <View style={styles.cashierRoundTag}>
                                  <Text style={styles.cashierRoundTagText}>
                                    รวม {bill.ordersCount} รอบออเดอร์
                                  </Text>
                                </View>
                              )}
                            </View>
                            <Text style={styles.cashierOrderSub}>
                              {bill.ordersCount > 1
                                ? `ออเดอร์ #${bill.orderIds.join(', #')} • เปิดโต๊ะ ${getTimeElapsed(bill.created_at)}`
                                : `บิล #${bill.id} • ${getTimeElapsed(bill.created_at)}`}
                            </Text>
                          </View>
                          <Text style={styles.cashierTotalAmount}>฿{Number(bill.total_amount).toFixed(2)}</Text>
                        </View>

                        <View style={styles.divider} />

                        {/* แสดงรายการอาหารแยกตามรอบ พร้อมสถานะของแต่ละรอบ */}
                        {(bill.rounds || []).map((round, rIdx) => {
                          const isRoundPending = round.status === 'pending';
                          const isRoundCooking = round.status === 'cooking';
                          const isRoundReady = round.status === 'ready';
                          const isRoundServed = round.status === 'served';

                          return (
                            <View
                              key={round.id}
                              style={[
                                styles.cashierRoundBox,
                                rIdx > 0 && { marginTop: 10 },
                                isRoundReady && styles.cashierRoundBoxReady,
                              ]}
                            >
                              <View style={styles.cashierRoundHeader}>
                                <Text style={styles.cashierRoundTitle}>
                                  รอบที่ {round.roundNum} ({round.roundLabel}) • #{round.id}
                                </Text>

                                {isRoundPending && (
                                  <View style={[styles.statusTag, styles.statusPendingTag]}>
                                    <Icon name="time-outline" size={12} color={colors.warning} />
                                    <Text style={[styles.statusTagText, styles.statusPendingText, { marginLeft: 4 }]}>
                                      รอครัวรับออเดอร์
                                    </Text>
                                  </View>
                                )}

                                {isRoundCooking && (
                                  <View style={[styles.statusTag, styles.statusCookingTag]}>
                                    <Icon name="flame-outline" size={12} color={colors.info} />
                                    <Text style={[styles.statusTagText, styles.statusCookingText, { marginLeft: 4 }]}>
                                      ครัวกำลังปรุง
                                    </Text>
                                  </View>
                                )}

                                {isRoundReady && (
                                  <TouchableOpacity
                                    style={[styles.statusTag, { backgroundColor: colors.orangeSoft }]}
                                    onPress={() => setCashierSubTab('serve')}
                                  >
                                    <Icon name="notifications-outline" size={12} color={colors.orange} />
                                    <Text style={[styles.statusTagText, { color: colors.orange, marginLeft: 4 }]}>
                                      รอเสิร์ฟ (ไปแท็บรอเสิร์ฟ)
                                    </Text>
                                  </TouchableOpacity>
                                )}

                                {isRoundServed && (
                                  <View style={[styles.statusTag, styles.statusServedTag]}>
                                    <Icon name="checkmark-circle-outline" size={12} color={colors.success} />
                                    <Text style={[styles.statusTagText, styles.statusServedText, { marginLeft: 4 }]}>
                                      เสิร์ฟออเดอร์แล้ว
                                    </Text>
                                  </View>
                                )}
                              </View>

                              {(round.order_items || []).map((item, idx) => (
                                <View key={item.id || idx} style={styles.cashierItemRow}>
                                  <Text style={styles.cashierItemName} numberOfLines={1}>
                                    • {item.item_name || (item.notes ? item.notes.split(' (')[0] : `เมนู #${idx + 1}`)}
                                    {item.notes ? ` (${item.notes})` : ''}
                                  </Text>
                                  <Text style={styles.cashierItemQty}>x{item.quantity}</Text>
                                  <Text style={styles.cashierItemPrice}>
                                    ฿{(item.price_per_item * item.quantity).toFixed(2)}
                                  </Text>
                                </View>
                              ))}
                            </View>
                          );
                        })}

                        <View style={styles.divider} />

                        {/* แถบแจ้งสถานะภาพรวมการเสิร์ฟของโต๊ะนี้ก่อนคิดเงิน */}
                        {bill.unservedCount > 0 ? (
                          <View style={styles.unservedWarningBanner}>
                            <Icon name="warning-outline" size={15} color={colors.warning} />
                            <Text style={styles.unservedWarningText}>
                              มีออเดอร์ยังเสิร์ฟไม่ครบ ({bill.unservedCount} รอบจาก {bill.ordersCount} รอบ)
                              {bill.readyToServeCount > 0
                                ? ` • รอกดเสิร์ฟ ${bill.readyToServeCount} รอบ`
                                : ' • กำลังทำในครัว'}
                            </Text>
                          </View>
                        ) : (
                          <View style={styles.allServedBanner}>
                            <Icon name="checkmark-circle-outline" size={15} color={colors.primaryDeep} />
                            <Text style={styles.allServedBannerText}>
                              เสิร์ฟอาหารครบทุกรอบแล้ว พร้อมคิดเงิน
                            </Text>
                          </View>
                        )}

                        {/* 3 ปุ่มการทำงาน: ย้ายโต๊ะ, แยกบิล, และคิดเงินเต็ม (กดคิดเงินได้ตลอดเวลา) */}
                        <View style={styles.cashierActionRow}>
                          <TouchableOpacity
                            style={styles.btnMoveTableQuick}
                            onPress={() => {
                              const tblObj = tables.find(
                                (t) =>
                                  t.id === bill.table_id ||
                                  t.table_number === `โต๊ะ ${bill.table_id}` ||
                                  parseInt((t.table_number || '').replace(/\D/g, '') || 0, 10) === Number(bill.table_id)
                              );
                              handleOpenMoveTable(
                                tblObj || { table_number: getTableName(bill.table_id), id: bill.table_id }
                              );
                            }}
                          >
                            <Icon name="swap-horizontal-outline" size={14} color={colors.textSecondary} />
                            <Text style={styles.btnMoveTableQuickText}>ย้าย</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={styles.btnSplitBillQuick}
                            onPress={() => handleOpenSplitBillModal(bill)}
                          >
                            <Icon name="git-branch-outline" size={14} color={colors.warning} />
                            <Text style={styles.btnSplitBillQuickText}>แยกบิล</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={styles.btnCheckout}
                            onPress={() => handleOpenPaymentModal(bill)}
                          >
                            <Icon name="wallet-outline" size={15} color={colors.textOnPrimary} />
                            <Text style={styles.btnCheckoutText}>คิดเงินเต็ม</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))
                  )}
                </ScrollView>
              )}
            </View>
          )}

          {/* ========================================================= */}
          {/* TAB 3: รับออเดอร์หน้าร้าน (Take Order) */}
          {/* ========================================================= */}
          {activeTab === 'take_order' && (
            <View style={{ flex: 1 }}>
              {/* แถบเลือกโต๊ะอาหาร */}
              <View style={styles.tableSelectorBar}>
                <Text style={styles.tableSelectorLabel}>เลือกโต๊ะที่สั่ง:</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  {tables.map((t) => {
                    const isSelected = selectedTableForOrder?.id === t.id;
                    const isOccupied = t.status === 'occupied';

                    return (
                      <TouchableOpacity
                        key={t.id}
                        style={[
                          styles.tableChip,
                          isSelected && styles.tableChipSelected,
                          isOccupied && !isSelected && styles.tableChipOccupied,
                        ]}
                        onPress={() => setSelectedTableForOrder(t)}
                      >
                        {isOccupied && (
                          <View
                            style={[
                              styles.tableOccupiedDot,
                              isSelected && { backgroundColor: colors.textOnPrimary },
                            ]}
                          />
                        )}
                        <Text
                          style={[
                            styles.tableChipText,
                            isSelected && styles.tableChipTextSelected,
                            isOccupied && !isSelected && styles.tableChipTextOccupied,
                          ]}
                        >
                          {t.table_number}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              {/* หมวดหมู่อาหาร & ช่องค้นหา */}
              <View style={styles.menuFilterBar}>
                <View style={styles.searchInputWrap}>
                  <Icon name="search-outline" size={16} color={colors.textFaint} />
                  <TextInput
                    style={styles.searchMenuInput}
                    placeholder="ค้นหาเมนูอาหาร..."
                    placeholderTextColor={colors.textFaint}
                    value={searchMenuQuery}
                    onChangeText={setSearchMenuQuery}
                  />
                  {searchMenuQuery !== '' && (
                    <TouchableOpacity onPress={() => setSearchMenuQuery('')}>
                      <Icon name="close-circle" size={16} color={colors.textFaint} />
                    </TouchableOpacity>
                  )}
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginTop: 8 }}>
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

              {/* รายการเมนูให้กดสั่ง */}
              <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 100 }}>
                {filteredMenuItems.length === 0 ? (
                  <View style={{ alignItems: 'center', paddingVertical: 48 }}>
                    <View style={styles.emptyIconCircle}>
                      <Icon name="restaurant-outline" size={32} color={colors.textFaint} />
                    </View>
                    <Text style={styles.emptyText}>
                      {menus.length === 0
                        ? 'ร้านนี้ยังไม่มีรายการอาหาร กรุณาเพิ่มเมนูในหน้าจัดการเมนู'
                        : 'ไม่พบเมนูอาหารในหมวดนี้'}
                    </Text>
                  </View>
                ) : (
                  <View style={styles.menuGrid}>
                    {filteredMenuItems.map((item) => (
                      <TouchableOpacity
                        key={item.id}
                        style={styles.menuCard}
                        activeOpacity={0.8}
                        onPress={() => handleAddToCart(item)}
                      >
                        {item.image_url ? (
                          <Image source={{ uri: item.image_url }} style={styles.menuImage} />
                        ) : (
                          <View style={styles.menuImagePlaceholder}>
                            <Icon name="fast-food-outline" size={26} color={colors.textFaint} />
                          </View>
                        )}
                        <View style={styles.menuCardBody}>
                          <Text style={styles.menuName} numberOfLines={1}>
                            {item.name}
                          </Text>
                          <Text style={styles.menuPrice}>฿{item.price}</Text>
                          <View style={styles.btnAddMenu}>
                            <Icon name="add" size={14} color={colors.primary} />
                            <Text style={styles.btnAddMenuText}>เพิ่ม</Text>
                          </View>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </ScrollView>

              {/* แถบตะกร้าด้านล่าง (Bottom Cart Bar) */}
              {cart.length > 0 && (
                <View style={styles.cartBottomBar}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cartBarTable}>
                      {selectedTableForOrder?.table_number || 'ยังไม่ได้เลือกโต๊ะ'}
                    </Text>
                    <Text style={styles.cartBarSummary}>
                      รวม {cart.reduce((s, i) => s + i.qty, 0)} รายการ • ฿{cartTotalAmount.toFixed(2)}
                    </Text>
                  </View>

                  <TouchableOpacity
                    style={styles.btnSubmitOrder}
                    disabled={submittingOrder}
                    onPress={handleSubmitStaffOrder}
                  >
                    {submittingOrder ? (
                      <ActivityIndicator color={colors.textOnPrimary} />
                    ) : (
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Icon name="send-outline" size={15} color={colors.textOnPrimary} />
                        <Text style={styles.btnSubmitOrderText}>ส่งเข้าครัว</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          {/* ========================================================= */}
          {/* TAB 4: ผังโต๊ะอาหาร (Tables Overview) */}
          {/* ========================================================= */}
          {activeTab === 'tables' && (
            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 30 }}>
              <View style={styles.tableLegendRow}>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: colors.primary }]} />
                  <Text style={styles.legendText}>โต๊ะว่าง</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: colors.danger }]} />
                  <Text style={styles.legendText}>มีลูกค้า (กำลังเลือกเมนู / สั่งอาหารแล้ว)</Text>
                </View>
              </View>

              <View style={styles.tableGrid}>
                {tables.map((table) => {
                  const rawNum = table.table_number ? table.table_number.replace(/\D/g, '') : '';
                  const parsedNum = rawNum ? parseInt(rawNum, 10) : null;
                  const tableOrders = orders.filter((o) => Number(o.table_id) === parsedNum);
                  const hasOrders = tableOrders.length > 0;
                  const isOccupied = table.status === 'occupied' || hasOrders;
                  const tableTotal = tableOrders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0);

                  return (
                    <TouchableOpacity
                      key={table.id}
                      style={[styles.tableBlock, isOccupied ? styles.tableBlockOccupied : styles.tableBlockAvailable]}
                      onPress={() => {
                        setSelectedTableForOrder(table);
                        setActiveTab('take_order');
                      }}
                    >
                      <Text style={styles.tableBlockNumber}>{table.table_number}</Text>
                      <View style={styles.tableCapacityRow}>
                        <Icon name="people-outline" size={13} color={colors.textMuted} />
                        <Text style={styles.tableBlockCapacity}>{table.capacity || 4} ที่นั่ง</Text>
                      </View>
                      <View
                        style={[
                          styles.tableBlockBadge,
                          isOccupied ? styles.tableBadgeOccupied : styles.tableBadgeAvailable,
                        ]}
                      >
                        <View
                          style={[
                            styles.tableBadgeDot,
                            { backgroundColor: isOccupied ? colors.danger : colors.primary },
                          ]}
                        />
                        <Text
                          style={[
                            styles.tableBadgeText,
                            isOccupied ? styles.tableBadgeTextOccupied : styles.tableBadgeTextAvailable,
                          ]}
                        >
                          {isOccupied ? 'มีลูกค้า' : 'ว่าง'}
                        </Text>
                      </View>

                      {/* ข้อความย่อยแสดงสถานะ: กำลังเลือกเมนู vs สั่งอาหารแล้ว */}
                      {isOccupied && hasOrders && (
                        <View style={styles.tableSubStatusOrdered}>
                          <Icon name="restaurant-outline" size={11} color={colors.primaryDeep} />
                          <Text style={styles.tableSubStatusOrderedText}>
                            สั่งอาหารแล้ว ({tableOrders.length} รอบ • ฿{tableTotal.toFixed(0)})
                          </Text>
                        </View>
                      )}

                      {isOccupied && !hasOrders && (
                        <View style={{ alignItems: 'center', width: '100%', marginTop: 6 }}>
                          <View style={styles.tableSubStatusBrowsing}>
                            <Icon name="phone-portrait-outline" size={11} color={colors.warning} />
                            <Text style={styles.tableSubStatusBrowsingText}>
                              กำลังเลือกเมนู {table.occupied_at ? `(${getTimeElapsed(table.occupied_at)})` : ''}
                            </Text>
                          </View>
                        </View>
                      )}

                      {/* ปุ่มเคลียร์โต๊ะว่าง แสดงในทุกโต๊ะที่มีลูกค้า */}
                      {isOccupied && (
                        <TouchableOpacity
                          style={styles.btnClearIdleTable}
                          onPress={(e) => {
                            if (e && e.stopPropagation) e.stopPropagation();
                            handleOpenClearTableModal(table, tableOrders, tableTotal);
                          }}
                        >
                          <Icon name="refresh-outline" size={12} color={colors.danger} />
                          <Text style={styles.btnClearIdleTableText}>เคลียร์โต๊ะว่าง</Text>
                        </TouchableOpacity>
                      )}

                      <Text style={styles.tableTapHint}>แตะเพื่อรับออเดอร์</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
          )}
        </View>
      )}

      {/* ========================================================= */}
      {/* MODAL 1: ชำระเงินเต็มจำนวน (Full Checkout Modal) */}
      {/* ========================================================= */}
      <Modal visible={!!selectedOrderForPayment} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>รับชำระเงินเต็มจำนวน (เช็กบิล)</Text>
            <Text style={styles.modalSubtitle}>
              {getTableName(selectedOrderForPayment?.table_id)} • ออเดอร์ #
              {(selectedOrderForPayment?.orderIds || [selectedOrderForPayment?.id]).join(', #')}
            </Text>

            {selectedOrderForPayment?.unservedCount > 0 && (
              <View style={styles.unservedWarningBanner}>
                <Icon name="warning-outline" size={15} color={colors.warning} />
                <Text style={styles.unservedWarningText}>
                  แจ้งเตือน: โต๊ะนี้ยังมีออเดอร์ที่ยังเสิร์ฟไม่ครบ ({selectedOrderForPayment.unservedCount} รอบ)
                </Text>
              </View>
            )}

            {/* สรุปยอดรวมและภาษี/บริการ */}
            <View style={styles.modalAmountBox}>
              <View style={styles.amountBreakdownRow}>
                <Text style={styles.modalSubAmountLabel}>ยอดรวมอาหาร:</Text>
                <Text style={styles.modalSubAmountVal}>
                  ฿{currentCheckoutBreakdown.subtotal.toFixed(2)}
                </Text>
              </View>
              {currentCheckoutBreakdown.serviceCharge > 0 && (
                <View style={styles.amountBreakdownRow}>
                  <Text style={styles.modalSubAmountLabel}>
                    Service Charge ({restaurantPaymentInfo?.service_charge_rate}%):
                  </Text>
                  <Text style={styles.modalSubAmountVal}>
                    +฿{currentCheckoutBreakdown.serviceCharge.toFixed(2)}
                  </Text>
                </View>
              )}
              {currentCheckoutBreakdown.vat > 0 && (
                <View style={styles.amountBreakdownRow}>
                  <Text style={styles.modalSubAmountLabel}>
                    VAT ({restaurantPaymentInfo?.vat_rate}%):
                  </Text>
                  <Text style={styles.modalSubAmountVal}>
                    +฿{currentCheckoutBreakdown.vat.toFixed(2)}
                  </Text>
                </View>
              )}
              <View style={styles.grandTotalDivider} />
              <View style={styles.amountBreakdownRow}>
                <Text style={styles.modalAmountLabel}>ยอดสุทธิที่ต้องชำระ:</Text>
                <Text style={styles.modalAmountVal}>
                  ฿{currentCheckoutBreakdown.grandTotal.toFixed(2)}
                </Text>
              </View>
            </View>

            {/* ระบบสมาชิกกลาง (Global Member) สะสมประวัติยอดซื้อและจำนวนครั้ง */}
            <View style={styles.memberCheckoutBox}>
              <View style={styles.memberHeaderRow}>
                <Icon name="people-outline" size={15} color={colors.primary} />
                <Text style={styles.memberBoxTitle}>สมาชิก (Global Member - ไม่บังคับ)</Text>
              </View>

              {selectedMember ? (
                <View style={styles.memberLinkedCard}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.memberLinkedName}>
                      {selectedMember.name} ({formatPromptPayDisplay(selectedMember.phone)})
                    </Text>
                    <Text style={styles.memberLinkedMeta}>
                      มาใช้บริการแล้ว {selectedMember.visit_count || 0} ครั้ง • ยอดสะสมรวม ฿
                      {Number(selectedMember.total_spent || 0).toFixed(0)}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.memberUnlinkBtn}
                    onPress={() => {
                      setSelectedMember(null);
                      setMemberPhoneInput('');
                    }}
                  >
                    <Icon name="close-circle-outline" size={18} color={colors.danger} />
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  <View style={styles.memberSearchRow}>
                    <TextInput
                      style={styles.memberPhoneInput}
                      placeholder="เบอร์โทรสมาชิก 10 หลัก..."
                      placeholderTextColor={colors.textFaint}
                      keyboardType="numeric"
                      maxLength={10}
                      value={memberPhoneInput}
                      onChangeText={(txt) => {
                        setMemberPhoneInput(txt);
                        if (memberNotFound) setMemberNotFound(false);
                      }}
                    />
                    <TouchableOpacity
                      style={styles.memberLookupBtn}
                      disabled={searchingMember}
                      onPress={handleLookupMember}
                    >
                      {searchingMember ? (
                        <ActivityIndicator size="small" color={colors.textOnPrimary} />
                      ) : (
                        <Text style={styles.memberLookupBtnText}>ค้นหา</Text>
                      )}
                    </TouchableOpacity>
                  </View>

                  {memberNotFound && (
                    <View style={styles.memberQuickRegBox}>
                      <Text style={styles.memberQuickRegLabel}>
                        ยังไม่พบเบอร์นี้ในระบบ • สมัครสมาชิกใหม่ทันที:
                      </Text>
                      <View style={styles.memberSearchRow}>
                        <TextInput
                          style={styles.memberPhoneInput}
                          placeholder="ระบุชื่อลูกค้า (เช่น คุณสมชาย)"
                          placeholderTextColor={colors.textFaint}
                          value={newMemberNameInput}
                          onChangeText={setNewMemberNameInput}
                        />
                        <TouchableOpacity
                          style={[styles.memberLookupBtn, { backgroundColor: colors.primaryDeep }]}
                          disabled={searchingMember}
                          onPress={handleQuickRegisterMember}
                        >
                          <Text style={styles.memberLookupBtnText}>สมัครผูกบิล</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                </>
              )}
            </View>

            {/* วิธีการชำระเงิน */}
            <View style={styles.payMethodToggle}>
              <TouchableOpacity
                style={[styles.payMethodBtn, paymentMethod === 'promptpay' && styles.payMethodBtnActive]}
                onPress={() => setPaymentMethod('promptpay')}
              >
                <Icon
                  name="qr-code-outline"
                  size={15}
                  color={paymentMethod === 'promptpay' ? colors.textOnPrimary : colors.textSecondary}
                />
                <Text
                  style={[
                    styles.payMethodBtnText,
                    paymentMethod === 'promptpay' && { color: colors.textOnPrimary },
                  ]}
                >
                  สแกน QR พร้อมเพย์
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.payMethodBtn, paymentMethod === 'cash' && styles.payMethodBtnActive]}
                onPress={() => setPaymentMethod('cash')}
              >
                <Icon
                  name="cash-outline"
                  size={15}
                  color={paymentMethod === 'cash' ? colors.textOnPrimary : colors.textSecondary}
                />
                <Text
                  style={[
                    styles.payMethodBtnText,
                    paymentMethod === 'cash' && { color: colors.textOnPrimary },
                  ]}
                >
                  เงินสด (Cash)
                </Text>
              </TouchableOpacity>
            </View>

            {paymentMethod === 'promptpay' ? (
              <View style={styles.promptpayBox}>
                {restaurantPaymentInfo?.promptpay_id ? (
                  <>
                    <View style={styles.qrCardContainer}>
                      <QRCode
                        value={
                          generatePromptPayPayload(
                            restaurantPaymentInfo.promptpay_id,
                            currentCheckoutBreakdown.grandTotal
                          ) || `PROMPTPAY|${restaurantId}|${currentCheckoutBreakdown.grandTotal}`
                        }
                        size={160}
                      />
                    </View>
                    <Text style={styles.qrPromptHint}>
                      ให้ลูกค้าสแกนเพื่อจ่ายเงินผ่านแอปธนาคาร
                    </Text>
                    <View style={styles.promptpayDetailsCard}>
                      <View style={styles.promptpayDetailRow}>
                        <Text style={styles.promptpayDetailLabel}>พร้อมเพย์:</Text>
                        <Text style={styles.promptpayDetailVal}>
                          {formatPromptPayDisplay(restaurantPaymentInfo.promptpay_id)}
                        </Text>
                      </View>
                      {restaurantPaymentInfo.promptpay_name ? (
                        <View style={styles.promptpayDetailRow}>
                          <Text style={styles.promptpayDetailLabel}>ชื่อบัญชี:</Text>
                          <Text style={styles.promptpayDetailVal}>
                            {restaurantPaymentInfo.promptpay_name}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  </>
                ) : (
                  <View style={styles.noPromptPayWarningBox}>
                    <Icon name="alert-circle-outline" size={24} color={colors.warning} />
                    <Text style={styles.noPromptPayWarningTitle}>ยังไม่ได้ตั้งค่าพร้อมเพย์</Text>
                    <Text style={styles.noPromptPayWarningDesc}>
                      ร้านค้านี้ยังไม่ได้ระบุหมายเลขพร้อมเพย์ กรุณาแจ้งผู้จัดการร้านให้ตั้งค่าในเมนู "ตั้งค่าการรับเงิน"
                    </Text>
                  </View>
                )}

                {restaurantPaymentInfo?.bank_account_no ? (
                  <View style={styles.bankTransferBox}>
                    <Text style={styles.bankTransferTitle}>หรือโอนผ่านบัญชีธนาคาร:</Text>
                    <Text style={styles.bankTransferText}>
                      {restaurantPaymentInfo.bank_name} {restaurantPaymentInfo.bank_account_no}
                    </Text>
                    {restaurantPaymentInfo.bank_account_name ? (
                      <Text style={styles.bankTransferNameText}>
                        ({restaurantPaymentInfo.bank_account_name})
                      </Text>
                    ) : null}
                  </View>
                ) : null}
              </View>
            ) : (
              <View style={styles.cashBox}>
                <Text style={styles.inputLabel}>ระบุจำนวนเงินที่รับมา (บาท):</Text>
                <TextInput
                  style={styles.cashInput}
                  placeholder="เช่น 500, 1000"
                  placeholderTextColor={colors.textFaint}
                  keyboardType="numeric"
                  value={cashReceived}
                  onChangeText={setCashReceived}
                />
                {parseFloat(cashReceived) >= currentCheckoutBreakdown.grandTotal ? (
                  <View style={styles.changeBox}>
                    <Text style={styles.changeLabel}>เงินทอน:</Text>
                    <Text style={styles.changeAmount}>
                      ฿{(parseFloat(cashReceived) - currentCheckoutBreakdown.grandTotal).toFixed(2)}
                    </Text>
                  </View>
                ) : (
                  parseFloat(cashReceived) > 0 && (
                    <Text style={styles.cashShortageWarning}>
                      ยังขาดอีก ฿{(currentCheckoutBreakdown.grandTotal - parseFloat(cashReceived)).toFixed(2)}
                    </Text>
                  )
                )}
              </View>
            )}

            <View style={styles.modalActionRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setSelectedOrderForPayment(null)}
              >
                <Text style={styles.modalCancelBtnText}>ยกเลิก</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalConfirmBtn}
                disabled={processingPayment}
                onPress={handleConfirmPayment}
              >
                {processingPayment ? (
                  <ActivityIndicator color={colors.textOnPrimary} />
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Icon name="checkmark-circle-outline" size={16} color={colors.textOnPrimary} />
                    <Text style={styles.modalConfirmBtnText}>ยืนยันปิดบิล</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ========================================================= */}
      {/* MODAL 2: ย้ายโต๊ะ / รวมโต๊ะ (Move Table Modal) */}
      {/* ========================================================= */}
      <Modal visible={moveTableModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeaderCenterRow}>
              <Icon name="swap-horizontal-outline" size={20} color={colors.primary} />
              <Text style={[styles.modalTitle, { marginLeft: 6 }]}>ย้ายโต๊ะอาหาร</Text>
            </View>
            <Text style={styles.modalSubtitle}>
              ย้ายออเดอร์จาก: <Text style={{ fontWeight: '700' }}>{sourceTable?.table_number}</Text>
            </Text>

            <Text style={styles.inputLabel}>เลือกโต๊ะปลายทางที่ต้องการย้ายไป:</Text>
            <ScrollView style={{ maxHeight: 200, marginVertical: 10 }}>
              {tables
                .filter((t) => t.id !== sourceTable?.id)
                .map((tbl) => {
                  const isTarget = targetTableId === tbl.id;
                  return (
                    <TouchableOpacity
                      key={tbl.id}
                      style={[styles.moveTargetRow, isTarget && styles.moveTargetRowSelected]}
                      onPress={() => setTargetTableId(tbl.id)}
                    >
                      <Text style={[styles.moveTargetText, isTarget && styles.moveTargetTextSelected]}>
                        {tbl.table_number} ({tbl.status === 'occupied' ? 'รวมโต๊ะ' : 'โต๊ะว่าง'})
                      </Text>
                      {isTarget && <Icon name="checkmark" size={18} color={colors.primary} />}
                    </TouchableOpacity>
                  );
                })}
            </ScrollView>

            <View style={styles.modalActionRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setMoveTableModalVisible(false)}
              >
                <Text style={styles.modalCancelBtnText}>ยกเลิก</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalConfirmBtn}
                disabled={movingTable}
                onPress={handleExecuteMoveTable}
              >
                {movingTable ? (
                  <ActivityIndicator color={colors.textOnPrimary} />
                ) : (
                  <Text style={styles.modalConfirmBtnText}>ยืนยันย้ายโต๊ะ</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ========================================================= */}
      {/* MODAL 3: แยกบิลชำระเงิน (Split Bill Modal) */}
      {/* ========================================================= */}
      <Modal visible={splitBillModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeaderCenterRow}>
              <Icon name="git-branch-outline" size={20} color={colors.primary} />
              <Text style={[styles.modalTitle, { marginLeft: 6 }]}>แยกบิลชำระเงิน (Split Bill)</Text>
            </View>
            <Text style={styles.modalSubtitle}>
              {getTableName(selectedOrderForSplit?.table_id)} • ยอดสุทธิ ฿{Number(currentSplitBreakdown.grandTotal || 0).toFixed(2)}
            </Text>

            {selectedOrderForSplit?.unservedCount > 0 && (
              <View style={styles.unservedWarningBanner}>
                <Icon name="warning-outline" size={15} color={colors.warning} />
                <Text style={styles.unservedWarningText}>
                  แจ้งเตือน: โต๊ะนี้ยังมีออเดอร์ที่ยังเสิร์ฟไม่ครบ ({selectedOrderForSplit.unservedCount} รอบ)
                </Text>
              </View>
            )}

            {/* โหมดแยกบิล: หารเท่ากัน */}
            <View style={styles.splitBox}>
              <Text style={styles.splitBoxLabel}>จำนวนคนที่ต้องการหาร:</Text>
              <View style={styles.personCounterRow}>
                <TouchableOpacity
                  style={styles.personCountBtn}
                  onPress={() => setSplitPersonCount(Math.max(2, splitPersonCount - 1))}
                >
                  <Icon name="remove" size={18} color={colors.text} />
                </TouchableOpacity>

                <Text style={styles.personCountText}>{splitPersonCount} คน</Text>

                <TouchableOpacity
                  style={styles.personCountBtn}
                  onPress={() => setSplitPersonCount(Math.min(10, splitPersonCount + 1))}
                >
                  <Icon name="add" size={18} color={colors.text} />
                </TouchableOpacity>
              </View>

              {/* ยอดที่ต้องจ่ายต่อคน */}
              <View style={styles.splitPerPersonBox}>
                <Text style={styles.splitPerPersonLabel}>ยอดที่ต้องชำระต่อคน:</Text>
                <Text style={styles.splitPerPersonAmount}>฿{splitAmountPerPerson}</Text>
              </View>

              {/* สถานะคนที่จ่ายแล้ว */}
              <View style={styles.splitProgressBox}>
                <Text style={styles.splitProgressText}>
                  ความคืบหน้า: จ่ายแล้ว {paidSplitsCount} จาก {splitPersonCount} คน
                </Text>
                <View style={styles.splitProgressBarBg}>
                  <View
                    style={[
                      styles.splitProgressBarFill,
                      { width: `${(paidSplitsCount / splitPersonCount) * 100}%` },
                    ]}
                  />
                </View>
              </View>

              {/* QR Code สำหรับคนที่กำลังจ่ายยอดนี้ */}
              <View style={styles.splitQrBox}>
                <QRCode
                  value={
                    restaurantPaymentInfo?.promptpay_id
                      ? generatePromptPayPayload(
                          restaurantPaymentInfo.promptpay_id,
                          splitAmountPerPerson
                        ) || `PROMPTPAY|${restaurantId}|${splitAmountPerPerson}`
                      : `PROMPTPAY|${restaurantId}|${splitAmountPerPerson}`
                  }
                  size={130}
                />
                <Text style={styles.qrPromptHint}>สแกนจ่ายยอดนี้: ฿{splitAmountPerPerson}</Text>
                {restaurantPaymentInfo?.promptpay_id ? (
                  <Text style={styles.splitPromptPayMeta}>
                    พร้อมเพย์: {formatPromptPayDisplay(restaurantPaymentInfo.promptpay_id)}
                    {restaurantPaymentInfo.promptpay_name ? ` (${restaurantPaymentInfo.promptpay_name})` : ''}
                  </Text>
                ) : null}
              </View>
            </View>

            <View style={styles.modalActionRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setSplitBillModalVisible(false)}
              >
                <Text style={styles.modalCancelBtnText}>ปิด</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalConfirmBtn}
                onPress={handlePayOneEqualSplit}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Icon name="checkmark-circle-outline" size={16} color={colors.textOnPrimary} />
                  <Text style={styles.modalConfirmBtnText}>
                    บันทึกรับเงินคนที่ {paidSplitsCount + 1}
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ========================================================= */}
      {/* MODAL 4: ยืนยันการเคลียร์โต๊ะว่าง (Confirm Clear Table Modal) */}
      {/* ========================================================= */}
      <Modal visible={!!tableToClear} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.clearWarnIconWrap}>
              <Icon name="warning-outline" size={32} color={colors.danger} />
            </View>
            <Text style={styles.modalTitle}>
              ยืนยันการเคลียร์ {tableToClear?.table?.table_number} ?
            </Text>
            <Text style={styles.modalSubtitle}>
              ต้องการปรับสถานะกลับเป็น "โต๊ะว่าง" และตัดลิงก์ QR ของลูกค้าใช่หรือไม่?
            </Text>

            {tableToClear?.tableOrders?.length > 0 ? (
              <View
                style={{
                  backgroundColor: colors.dangerSoft,
                  borderWidth: 1,
                  borderColor: colors.dangerBorder,
                  borderRadius: radius.sm,
                  padding: 12,
                  marginVertical: 8,
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: '700', color: colors.dangerDark, textAlign: 'center' }}>
                  โต๊ะนี้มีออเดอร์ค้างอยู่ {tableToClear.tableOrders.length} รอบ (รวม ฿
                  {Number(tableToClear.tableTotal || 0).toFixed(2)})
                </Text>
                <Text style={{ fontSize: 12, color: colors.dangerDark, textAlign: 'center', marginTop: 4 }}>
                  หากยืนยันเคลียร์โต๊ะ ระบบจะยกเลิกออเดอร์ที่ค้างอยู่ของโต๊ะนี้ทั้งหมด และดีดลิงก์ลูกค้าออกทันที
                </Text>
              </View>
            ) : (
              <View
                style={{
                  backgroundColor: colors.warningSoft,
                  borderWidth: 1,
                  borderColor: colors.warningBorder,
                  borderRadius: radius.sm,
                  padding: 12,
                  marginVertical: 8,
                }}
              >
                <Text style={{ fontSize: 12, color: colors.warning, textAlign: 'center' }}>
                  โต๊ะนี้ถูกสแกน QR ค้างไว้แต่ยังไม่มีการสั่งอาหาร ระบบจะคืนสถานะเป็น "ว่าง" และดีดลิงก์ออกทันที
                </Text>
              </View>
            )}

            <View style={styles.modalActionRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                disabled={clearingTable}
                onPress={() => setTableToClear(null)}
              >
                <Text style={styles.modalCancelBtnText}>ยกเลิก</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalConfirmBtn, { backgroundColor: colors.danger }]}
                disabled={clearingTable}
                onPress={handleConfirmClearTable}
              >
                {clearingTable ? (
                  <ActivityIndicator color={colors.textOnPrimary} />
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Icon name="refresh-outline" size={16} color={colors.textOnPrimary} />
                    <Text style={styles.modalConfirmBtnText}>ยืนยันเคลียร์โต๊ะ</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ========================================================= */}
      {/* MODAL 5: พรีวิวใบเสร็จรับเงิน (Receipt Slip Preview Modal) */}
      {/* ========================================================= */}
      <Modal visible={receiptModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, styles.receiptSlipCard]}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 10 }}>
              {/* Receipt Header */}
              <View style={styles.receiptHeader}>
                <View style={styles.receiptStoreBadge}>
                  <Icon name="receipt-outline" size={24} color={colors.primary} />
                </View>
                <Text style={styles.receiptStoreName}>
                  {lastCompletedReceipt?.storeName || restaurantName}
                </Text>
                <Text style={styles.receiptSubtitle}>ใบเสร็จรับเงิน / Receipt</Text>
              </View>

              <View style={styles.receiptDottedDivider} />

              {/* Meta Info */}
              <View style={styles.receiptMetaRow}>
                <Text style={styles.receiptMetaLabel}>โต๊ะ:</Text>
                <Text style={styles.receiptMetaVal}>{lastCompletedReceipt?.tableNumber || '-'}</Text>
              </View>
              <View style={styles.receiptMetaRow}>
                <Text style={styles.receiptMetaLabel}>ออเดอร์:</Text>
                <Text style={styles.receiptMetaVal}>
                  #{lastCompletedReceipt?.orderIds?.join(', #') || '-'}
                </Text>
              </View>
              <View style={styles.receiptMetaRow}>
                <Text style={styles.receiptMetaLabel}>วันที่-เวลา:</Text>
                <Text style={styles.receiptMetaVal}>{lastCompletedReceipt?.date || '-'}</Text>
              </View>
              {lastCompletedReceipt?.memberPhone ? (
                <>
                  <View style={styles.receiptMetaRow}>
                    <Text style={styles.receiptMetaLabel}>สมาชิก:</Text>
                    <Text style={[styles.receiptMetaVal, { color: colors.primary }]}>
                      {lastCompletedReceipt.memberName} ({formatPromptPayDisplay(lastCompletedReceipt.memberPhone)})
                    </Text>
                  </View>
                  <View style={styles.receiptMetaRow}>
                    <Text style={styles.receiptMetaLabel}>ประวัติใช้บริการรวม:</Text>
                    <Text style={styles.receiptMetaVal}>
                      ครั้งที่ {lastCompletedReceipt.memberVisits} • สะสม ฿
                      {Number(lastCompletedReceipt.memberTotalSpent || 0).toFixed(2)}
                    </Text>
                  </View>
                </>
              ) : null}

              <View style={styles.receiptDottedDivider} />

              {/* Itemized List */}
              <Text style={styles.receiptSectionHeader}>รายการอาหาร</Text>
              {lastCompletedReceipt?.items?.map((item, idx) => (
                <View key={idx} style={styles.receiptItemRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.receiptItemName}>{item.item_name || 'รายการอาหาร'}</Text>
                    {item.notes ? (
                      <Text style={styles.receiptItemNotes}>({item.notes})</Text>
                    ) : null}
                  </View>
                  <Text style={styles.receiptItemQty}>x{item.quantity}</Text>
                  <Text style={styles.receiptItemPrice}>
                    ฿{(item.quantity * item.price_per_item).toFixed(2)}
                  </Text>
                </View>
              ))}

              <View style={styles.receiptDottedDivider} />

              {/* Financial Summary */}
              <View style={styles.receiptSummaryRow}>
                <Text style={styles.receiptSummaryLabel}>ยอดรวม (Subtotal):</Text>
                <Text style={styles.receiptSummaryVal}>
                  ฿{Number(lastCompletedReceipt?.subtotal || 0).toFixed(2)}
                </Text>
              </View>

              {Number(lastCompletedReceipt?.serviceCharge || 0) > 0 && (
                <View style={styles.receiptSummaryRow}>
                  <Text style={styles.receiptSummaryLabel}>
                    ค่าบริการ Service Charge ({lastCompletedReceipt?.serviceChargeRate}%):
                  </Text>
                  <Text style={styles.receiptSummaryVal}>
                    ฿{Number(lastCompletedReceipt.serviceCharge).toFixed(2)}
                  </Text>
                </View>
              )}

              {Number(lastCompletedReceipt?.vat || 0) > 0 && (
                <View style={styles.receiptSummaryRow}>
                  <Text style={styles.receiptSummaryLabel}>
                    ภาษีมูลค่าเพิ่ม VAT ({lastCompletedReceipt?.vatRate}%):
                  </Text>
                  <Text style={styles.receiptSummaryVal}>
                    ฿{Number(lastCompletedReceipt.vat).toFixed(2)}
                  </Text>
                </View>
              )}

              <View style={[styles.receiptSummaryRow, styles.receiptGrandTotalRow]}>
                <Text style={styles.receiptGrandTotalLabel}>ยอดสุทธิ (Total):</Text>
                <Text style={styles.receiptGrandTotalVal}>
                  ฿{Number(lastCompletedReceipt?.grandTotal || 0).toFixed(2)}
                </Text>
              </View>

              <View style={styles.receiptDottedDivider} />

              {/* Payment Details */}
              <View style={styles.receiptMetaRow}>
                <Text style={styles.receiptMetaLabel}>วิธีชำระเงิน:</Text>
                <Text style={styles.receiptMetaVal}>
                  {lastCompletedReceipt?.paymentMethod === 'promptpay'
                    ? 'สแกน QR พร้อมเพย์'
                    : 'เงินสด (Cash)'}
                </Text>
              </View>

              {lastCompletedReceipt?.paymentMethod === 'cash' && (
                <>
                  <View style={styles.receiptMetaRow}>
                    <Text style={styles.receiptMetaLabel}>รับเงินสดมา:</Text>
                    <Text style={styles.receiptMetaVal}>
                      ฿{Number(lastCompletedReceipt?.paymentAmount || 0).toFixed(2)}
                    </Text>
                  </View>
                  <View style={styles.receiptMetaRow}>
                    <Text style={styles.receiptMetaLabel}>เงินทอน:</Text>
                    <Text style={[styles.receiptMetaVal, { color: colors.success, fontWeight: '700' }]}>
                      ฿{Number(lastCompletedReceipt?.changeAmount || 0).toFixed(2)}
                    </Text>
                  </View>
                </>
              )}

              <View style={styles.receiptDottedDivider} />

              <Text style={styles.receiptFooterText}>ขอบคุณที่ใช้บริการ</Text>
            </ScrollView>

            <View style={styles.receiptActionRow}>
              <TouchableOpacity
                style={styles.receiptPrintBtn}
                activeOpacity={0.7}
                onPress={() => {
                  if (Platform.OS === 'web' && typeof window !== 'undefined') {
                    window.print();
                  } else {
                    showNotice('พิมพ์ใบเสร็จ', 'ส่งคำสั่งพิมพ์ใบเสร็จเรียบร้อยแล้ว');
                  }
                }}
              >
                <Icon name="print-outline" size={18} color={colors.primary} />
                <Text style={styles.receiptPrintBtnText}>พิมพ์สลิป</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.receiptDoneBtn}
                activeOpacity={0.7}
                onPress={() => {
                  setReceiptModalVisible(false);
                  setLastCompletedReceipt(null);
                }}
              >
                <Icon name="checkmark-outline" size={18} color={colors.textOnPrimary} />
                <Text style={styles.receiptDoneBtnText}>เสร็จสิ้น</Text>
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
    paddingVertical: 10,
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
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.sm,
  },
  backBtnText: { color: colors.textSecondary, fontSize: fontSize.sm, fontWeight: '700', marginLeft: 2 },
  storeInfoBox: { alignItems: 'center' },
  storeTitle: { fontSize: 15, fontWeight: '700', color: colors.text, maxWidth: 160 },
  roleBadge: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  greenPulseDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary, marginRight: 4 },
  roleBadgeText: { fontSize: 10, color: colors.primary, fontWeight: '600' },
  soundBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 10, borderRadius: radius.sm },
  soundBtnOn: { backgroundColor: colors.primarySoft },
  soundBtnOff: { backgroundColor: colors.dangerSoft },
  soundBtnText: { fontSize: 11, fontWeight: '700', color: colors.primaryDeep, marginLeft: 4 },

  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    position: 'relative',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabItemActive: { borderBottomColor: colors.primary },
  tabLabel: { fontSize: fontSize.sm, color: colors.textMuted, fontWeight: '600', marginTop: 3 },
  tabLabelActive: { color: colors.primary, fontWeight: '700' },
  badgeCount: {
    position: 'absolute',
    top: 4,
    right: 14,
    backgroundColor: colors.danger,
    borderRadius: 10,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  badgeCountText: { color: colors.textOnPrimary, fontSize: 10, fontWeight: '700' },

  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl },
  loadingText: { marginTop: 12, color: colors.textMuted, fontSize: fontSize.sm + 1 },

  filterRow: { flexDirection: 'row', gap: 6, marginBottom: 12 },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterChipText: { fontSize: fontSize.sm, color: colors.textSecondary, fontWeight: '600', marginLeft: 4 },
  filterChipTextActive: { color: colors.textOnPrimary, fontWeight: '700' },

  kitchenCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 14,
    marginBottom: 12,
    borderLeftWidth: 5,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  cardPending: { borderLeftColor: '#F59E0B' },
  cardCooking: { borderLeftColor: '#3B82F6' },
  cardServed: { borderLeftColor: '#10B981' },
  kitchenCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  tableName: { fontSize: 15, fontWeight: '700', color: colors.text },
  addOnBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.dangerSoft,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  addOnBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.danger,
    marginLeft: 3,
  },
  cashierRoundTag: {
    backgroundColor: colors.infoSoft,
    borderWidth: 1,
    borderColor: colors.infoBorder,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  cashierRoundTagText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.info,
  },
  orderTime: { fontSize: 11, color: colors.textFaint, marginTop: 2 },
  statusTag: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusPendingTag: { backgroundColor: colors.warningSoft },
  statusCookingTag: { backgroundColor: colors.infoSoft },
  statusServedTag: { backgroundColor: colors.successSoft },
  statusTagText: { fontSize: 11, fontWeight: '700' },
  statusPendingText: { color: colors.warning },
  statusCookingText: { color: colors.info },
  statusServedText: { color: colors.success },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 10 },
  itemsList: { gap: 6 },
  orderItemRow: { flexDirection: 'row', alignItems: 'center' },
  orderItemName: { fontSize: fontSize.md, color: colors.text, flex: 2, fontWeight: '500' },
  orderItemQty: { fontSize: fontSize.md, fontWeight: '700', color: colors.primary, width: 36, textAlign: 'center' },
  orderItemNote: { fontSize: 11, color: colors.danger, fontStyle: 'italic', flex: 1 },
  actionBtnRow: { marginTop: 12 },
  btnStartCook: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.info,
    paddingVertical: 10,
    borderRadius: radius.sm,
  },
  btnFinishCook: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingVertical: 10,
    borderRadius: radius.sm,
  },
  btnActionText: { color: colors.textOnPrimary, fontSize: fontSize.sm + 1, fontWeight: '700', marginLeft: 6 },

  sectionHeader: { marginBottom: 12 },
  sectionTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text },
  sectionSub: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2 },
  cashierSubTabBar: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    padding: 4,
    marginBottom: 14,
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cashierSubTabBtn: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: 10,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cashierSubTabBtnActiveServe: {
    backgroundColor: colors.orangeStrong,
  },
  cashierSubTabBtnActiveBilling: {
    backgroundColor: colors.primary,
  },
  cashierSubTabText: {
    fontSize: fontSize.sm + 1,
    fontWeight: '700',
    color: colors.textSecondary,
    marginLeft: 6,
  },
  cashierSubTabTextActive: {
    color: colors.textOnPrimary,
  },
  cashierCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  cashierCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cashierTableTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text },
  cashierOrderSub: { fontSize: 11, color: colors.textFaint, marginTop: 2 },
  cashierTotalAmount: { fontSize: 18, fontWeight: '700', color: colors.primary },
  cashierRoundBox: {
    backgroundColor: colors.bg,
    borderRadius: radius.sm,
    padding: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cashierRoundBoxReady: {
    backgroundColor: '#FFF7ED',
    borderColor: '#FDBA74',
  },
  cashierRoundHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
    flexWrap: 'wrap',
    gap: 6,
  },
  cashierRoundTitle: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.text,
  },
  btnConfirmServeRound: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    backgroundColor: colors.orangeStrong,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radius.sm,
  },
  btnConfirmServeRoundText: {
    color: colors.textOnPrimary,
    fontSize: fontSize.sm + 1,
    fontWeight: '700',
    marginLeft: 6,
  },
  unservedWarningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.warningSoft,
    borderWidth: 1,
    borderColor: colors.warningBorder,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: radius.sm,
    marginBottom: 8,
  },
  unservedWarningText: {
    color: colors.warning,
    fontSize: fontSize.sm,
    fontWeight: '700',
    textAlign: 'center',
    marginLeft: 6,
  },
  allServedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: radius.sm,
    marginBottom: 8,
  },
  allServedBannerText: {
    color: colors.primaryDeep,
    fontSize: fontSize.sm,
    fontWeight: '700',
    textAlign: 'center',
    marginLeft: 6,
  },
  cashierItemRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  cashierItemName: { fontSize: fontSize.sm + 1, color: colors.textSecondary, flex: 2 },
  cashierItemQty: { fontSize: fontSize.sm + 1, color: colors.textMuted, width: 36, textAlign: 'center' },
  cashierItemPrice: { fontSize: fontSize.sm + 1, fontWeight: '600', color: colors.text },
  cashierActionRow: { flexDirection: 'row', gap: 6, marginTop: 4 },
  btnMoveTableQuick: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    paddingVertical: 10,
    borderRadius: radius.sm,
  },
  btnMoveTableQuickText: { color: colors.textSecondary, fontSize: fontSize.sm, fontWeight: '700', marginLeft: 4 },
  btnSplitBillQuick: {
    flex: 1.2,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.warningSoft,
    paddingVertical: 10,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.warningBorder,
  },
  btnSplitBillQuickText: { color: colors.warning, fontSize: fontSize.sm, fontWeight: '700', marginLeft: 4 },
  btnCheckout: {
    flex: 1.5,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingVertical: 10,
    borderRadius: radius.sm,
  },
  btnCheckoutText: { color: colors.textOnPrimary, fontSize: fontSize.sm, fontWeight: '700', marginLeft: 4 },

  tableSelectorBar: {
    padding: 10,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tableSelectorLabel: { fontSize: 11, color: colors.textMuted, fontWeight: '700', marginBottom: 6 },
  tableChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tableChipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  tableChipOccupied: { borderColor: colors.dangerBorder, backgroundColor: colors.dangerSoft },
  tableOccupiedDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.danger, marginRight: 5 },
  tableChipText: { fontSize: fontSize.sm, color: colors.textSecondary, fontWeight: '600' },
  tableChipTextSelected: { color: colors.textOnPrimary, fontWeight: '700' },
  tableChipTextOccupied: { color: colors.danger },
  menuFilterBar: { padding: 10, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  searchInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    height: 38,
    backgroundColor: colors.bg,
  },
  searchMenuInput: {
    flex: 1,
    fontSize: fontSize.sm + 1,
    color: colors.text,
    marginLeft: 6,
  },
  catChip: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: colors.surfaceMuted },
  catChipActive: { backgroundColor: colors.primary },
  catChipText: { fontSize: 11, color: colors.textSecondary, fontWeight: '600' },
  catChipTextActive: { color: colors.textOnPrimary, fontWeight: '700' },
  menuGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  menuCard: {
    width: '48%',
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    ...shadow.card,
  },
  menuImage: { width: '100%', height: 90 },
  menuImagePlaceholder: { width: '100%', height: 90, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  menuCardBody: { padding: 8 },
  menuName: { fontSize: fontSize.sm + 1, fontWeight: '700', color: colors.text },
  menuPrice: { fontSize: fontSize.sm, color: colors.primary, fontWeight: '700', marginTop: 2 },
  btnAddMenu: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 6,
    backgroundColor: colors.primarySoft,
    paddingVertical: 5,
    borderRadius: 6,
  },
  btnAddMenuText: { color: colors.primary, fontSize: 11, fontWeight: '700', marginLeft: 3 },
  cartBottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.dark,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cartBarTable: { color: colors.primaryBorder, fontSize: fontSize.sm, fontWeight: '700' },
  cartBarSummary: { color: colors.textOnPrimary, fontSize: fontSize.sm + 1 },
  btnSubmitOrder: { backgroundColor: colors.primary, paddingVertical: 10, paddingHorizontal: 18, borderRadius: radius.sm },
  btnSubmitOrderText: { color: colors.textOnPrimary, fontSize: fontSize.sm + 1, fontWeight: '700', marginLeft: 6 },

  tableLegendRow: { flexDirection: 'row', gap: 16, marginBottom: 14 },
  legendItem: { flexDirection: 'row', alignItems: 'center' },
  legendDot: { width: 10, height: 10, borderRadius: 5, marginRight: 6 },
  legendText: { fontSize: fontSize.sm, color: colors.textSecondary },
  tableGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tableBlock: {
    width: '48%',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1.5,
    ...shadow.card,
  },
  tableBlockAvailable: { borderColor: colors.primaryBorder },
  tableBlockOccupied: { borderColor: colors.dangerBorder, backgroundColor: '#FFFBFB' },
  tableBlockNumber: { fontSize: 18, fontWeight: '700', color: colors.text },
  tableCapacityRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  tableBlockCapacity: { fontSize: 11, color: colors.textMuted, marginLeft: 4 },
  tableBlockBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, marginTop: 8 },
  tableBadgeAvailable: { backgroundColor: colors.primarySoft },
  tableBadgeOccupied: { backgroundColor: colors.dangerSoft },
  tableBadgeDot: { width: 6, height: 6, borderRadius: 3, marginRight: 4 },
  tableBadgeText: { fontSize: 10, fontWeight: '700' },
  tableBadgeTextAvailable: { color: colors.primaryDark },
  tableBadgeTextOccupied: { color: colors.dangerDark },
  tableSubStatusOrdered: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.sm,
  },
  tableSubStatusOrderedText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.primaryDeep,
    textAlign: 'center',
    marginLeft: 4,
  },
  tableSubStatusBrowsing: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.warningSoft,
    borderWidth: 1,
    borderColor: colors.warningBorder,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.sm,
  },
  tableSubStatusBrowsingText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.warning,
    textAlign: 'center',
    marginLeft: 4,
  },
  btnClearIdleTable: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  btnClearIdleTableText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.danger,
    marginLeft: 4,
  },
  tableTapHint: { fontSize: 10, color: colors.textFaint, marginTop: 8 },

  emptyState: { padding: 40, alignItems: 'center', justifyContent: 'center' },
  emptyIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: colors.textSecondary, marginTop: 4 },
  emptySubtitle: { fontSize: fontSize.sm, color: colors.textFaint, textAlign: 'center', marginTop: 4 },
  emptyText: { textAlign: 'center', color: colors.textFaint, paddingVertical: 12 },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(17,24,39,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  modalCard: { width: '100%', maxWidth: 380, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.xl },
  modalHeaderCenterRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  clearWarnIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.dangerSoft,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 8,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: colors.text, textAlign: 'center' },
  modalSubtitle: { fontSize: fontSize.sm + 1, color: colors.textMuted, textAlign: 'center', marginTop: 2, marginBottom: 12 },
  modalAmountBox: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.sm,
    padding: 12,
    alignItems: 'center',
    marginBottom: 14,
  },
  modalAmountLabel: { fontSize: fontSize.sm, color: colors.primaryDark },
  modalAmountVal: { fontSize: 24, fontWeight: '700', color: colors.primary, marginTop: 2 },
  payMethodToggle: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  payMethodBtn: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceMuted,
  },
  payMethodBtnActive: { backgroundColor: colors.primary },
  payMethodBtnText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.textSecondary, marginLeft: 5 },
  promptpayBox: { alignItems: 'center', padding: 12, backgroundColor: colors.bg, borderRadius: radius.md },
  qrPromptHint: { fontSize: 11, color: colors.textMuted, marginTop: 8 },
  cashBox: { padding: 4 },
  inputLabel: { fontSize: fontSize.sm, color: colors.textSecondary, fontWeight: '700', marginBottom: 4 },
  cashInput: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.sm,
    padding: 10,
    fontSize: fontSize.lg,
    color: colors.text,
    backgroundColor: colors.surface,
    marginBottom: 8,
  },
  changeBox: { flexDirection: 'row', justifyContent: 'space-between', padding: 8, backgroundColor: colors.warningSoft, borderRadius: 6 },
  changeLabel: { fontSize: fontSize.sm + 1, fontWeight: '700', color: colors.warning },
  changeAmount: { fontSize: fontSize.lg, fontWeight: '700', color: colors.warning },
  modalActionRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  modalCancelBtn: { flex: 1, backgroundColor: colors.surfaceMuted, paddingVertical: 12, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  modalCancelBtnText: { color: colors.textSecondary, fontSize: fontSize.sm + 1, fontWeight: '700' },
  modalConfirmBtn: { flex: 2, backgroundColor: colors.primary, paddingVertical: 12, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  modalConfirmBtnText: { color: colors.textOnPrimary, fontSize: fontSize.sm + 1, fontWeight: '700', marginLeft: 5 },
  moveTargetRow: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  moveTargetRowSelected: { backgroundColor: colors.primarySoft },
  moveTargetText: { fontSize: fontSize.md, color: colors.text },
  moveTargetTextSelected: { fontWeight: '700', color: colors.primary },

  // Split Box
  splitBox: { backgroundColor: colors.bg, borderRadius: radius.md, padding: 12, marginVertical: 8, borderWidth: 1, borderColor: colors.border },
  splitBoxLabel: { fontSize: fontSize.sm, color: colors.textSecondary, fontWeight: '600', marginBottom: 6 },
  personCounterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, marginBottom: 10 },
  personCountBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  personCountText: { fontSize: 18, fontWeight: '700', color: colors.primary },
  splitPerPersonBox: { backgroundColor: colors.primarySoft, padding: 10, borderRadius: radius.sm, alignItems: 'center', marginBottom: 8 },
  splitPerPersonLabel: { fontSize: 11, color: colors.primaryDeep },
  splitPerPersonAmount: { fontSize: 20, fontWeight: '700', color: colors.primary, marginTop: 2 },
  splitProgressBox: { marginVertical: 6 },
  splitProgressText: { fontSize: 11, color: colors.textMuted, marginBottom: 4 },
  splitProgressBarBg: { height: 6, backgroundColor: colors.border, borderRadius: 3, overflow: 'hidden' },
  splitProgressBarFill: { height: '100%', backgroundColor: colors.primary, borderRadius: 3 },
  splitQrBox: { alignItems: 'center', padding: 10, backgroundColor: colors.surface, borderRadius: radius.sm, marginTop: 8 },
  splitPromptPayMeta: { fontSize: 11, color: colors.textSecondary, marginTop: 4, fontWeight: '500' },

  // Breakdown & Checkout Styles
  amountBreakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 2,
  },
  modalSubAmountLabel: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
  modalSubAmountVal: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.text,
  },
  grandTotalDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 6,
  },
  qrCardContainer: {
    padding: 12,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    ...shadow.sm,
  },
  promptpayDetailsCard: {
    marginTop: 10,
    padding: 8,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.sm,
    width: '100%',
  },
  promptpayDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  promptpayDetailLabel: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
  promptpayDetailVal: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.text,
  },
  noPromptPayWarningBox: {
    alignItems: 'center',
    padding: 14,
    backgroundColor: colors.warningSoft,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.warningBorder,
  },
  noPromptPayWarningTitle: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.warning,
    marginTop: 4,
  },
  noPromptPayWarningDesc: {
    fontSize: fontSize.xs,
    color: colors.warning,
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 16,
  },
  bankTransferBox: {
    marginTop: 10,
    padding: 8,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    width: '100%',
    alignItems: 'center',
  },
  bankTransferTitle: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  bankTransferText: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.text,
  },
  bankTransferNameText: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 1,
  },
  cashShortageWarning: {
    fontSize: fontSize.xs,
    color: colors.danger,
    marginTop: 4,
    fontWeight: '600',
  },

  // Receipt Slip Styles
  receiptSlipCard: {
    maxWidth: 420,
    width: '92%',
    maxHeight: '90%',
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
  },
  receiptHeader: {
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  receiptStoreBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  receiptStoreName: {
    fontSize: fontSize.md,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
  },
  receiptSubtitle: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  receiptDottedDivider: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    borderStyle: 'dashed',
    marginVertical: spacing.sm,
  },
  receiptMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  receiptMetaLabel: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
  receiptMetaVal: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.text,
  },
  receiptSectionHeader: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  receiptItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  receiptItemName: {
    fontSize: fontSize.xs,
    color: colors.text,
    fontWeight: '600',
  },
  receiptItemNotes: {
    fontSize: 10,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  receiptItemQty: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginHorizontal: 12,
  },
  receiptItemPrice: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.text,
  },
  receiptSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  receiptSummaryLabel: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
  receiptSummaryVal: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.text,
  },
  receiptGrandTotalRow: {
    marginTop: 4,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  receiptGrandTotalLabel: {
    fontSize: fontSize.sm,
    fontWeight: '800',
    color: colors.text,
  },
  receiptGrandTotalVal: {
    fontSize: fontSize.md,
    fontWeight: '800',
    color: colors.primary,
  },
  receiptFooterText: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 4,
  },
  receiptActionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
  receiptPrintBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
  receiptPrintBtnText: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.primary,
    marginLeft: 6,
  },
  receiptDoneBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
  },
  receiptDoneBtnText: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.textOnPrimary,
    marginLeft: 6,
  },

  // Global Member Checkout Styles
  memberCheckoutBox: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 10,
    marginBottom: 10,
  },
  memberHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  memberBoxTitle: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.text,
    marginLeft: 5,
  },
  memberSearchRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  memberPhoneInput: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: fontSize.xs,
    color: colors.text,
  },
  memberLookupBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberLookupBtnText: {
    color: colors.textOnPrimary,
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  memberLinkedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    borderRadius: radius.sm,
    padding: 8,
  },
  memberLinkedName: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.primaryDeep,
  },
  memberLinkedMeta: {
    fontSize: 11,
    color: colors.primary,
    marginTop: 2,
  },
  memberUnlinkBtn: {
    padding: 4,
  },
  memberQuickRegBox: {
    marginTop: 8,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  memberQuickRegLabel: {
    fontSize: 11,
    color: colors.warning,
    fontWeight: '600',
    marginBottom: 4,
  },
});
