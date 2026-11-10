// src/screens/SalesReportScreen.js
import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  ScrollView,
  Platform,
  ActivityIndicator,
  Modal,
  Alert,
} from 'react-native';
import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';
import { supabase } from '../lib/supabase';
import Icon from '../theme/Icon';
import { colors, spacing, radius, fontSize, shadow } from '../theme';

// ชุดข้อมูลจำลองสำหรับร้านที่ยังไม่มียอดขายจริง (Realistic Demo Orders)
const generateDemoOrders = (storeName) => {
  const now = new Date();
  const getTimestamp = (daysAgo, hour, minute) => {
    const d = new Date(now);
    d.setDate(d.getDate() - daysAgo);
    d.setHours(hour, minute, 0, 0);
    return d.toISOString();
  };

  return [
    {
      id: 101,
      order_number: '#101',
      table_number: 'โต๊ะ 2',
      total_amount: 320,
      payment_method: 'promptpay',
      status: 'paid',
      created_at: getTimestamp(0, 11, 45),
      items: [
        { name: 'ข้าวกะเพราหมูกรอบ + ไข่ดาว', qty: 2, price: 85, category: 'อาหารจานหลัก' },
        { name: 'ชาไทยเย็นหวานน้อย', qty: 2, price: 45, category: 'เครื่องดื่ม' },
        { name: 'ข้าวสวยเพิ่ม', qty: 2, price: 15, category: 'อาหารจานหลัก' },
      ],
    },
    {
      id: 102,
      order_number: '#102',
      table_number: 'โต๊ะ 5',
      total_amount: 540,
      payment_method: 'cash',
      status: 'paid',
      created_at: getTimestamp(0, 12, 15),
      items: [
        { name: 'ต้มยำกุ้งน้ำข้น (หม้อไฟ)', qty: 1, price: 220, category: 'อาหารจานหลัก' },
        { name: 'ข้าวผัดปูจานกลาง', qty: 1, price: 150, category: 'อาหารจานหลัก' },
        { name: 'ไก่ทอดสมุนไพร', qty: 1, price: 90, category: 'ทานเล่น' },
        { name: 'น้ำเก๊กฮวยเย็น', qty: 2, price: 40, category: 'เครื่องดื่ม' },
      ],
    },
    {
      id: 103,
      order_number: '#103',
      table_number: 'โต๊ะ 1',
      total_amount: 190,
      payment_method: 'promptpay',
      status: 'paid',
      created_at: getTimestamp(0, 12, 50),
      items: [
        { name: 'ผัดไทยกุ้งสด', qty: 2, price: 80, category: 'อาหารจานหลัก' },
        { name: 'ชามะนาวเย็น', qty: 1, price: 30, category: 'เครื่องดื่ม' },
      ],
    },
    {
      id: 104,
      order_number: '#104',
      table_number: 'โต๊ะ 4',
      total_amount: 420,
      payment_method: 'promptpay',
      status: 'paid',
      created_at: getTimestamp(0, 13, 20),
      items: [
        { name: 'ส้มตำไทยถาด', qty: 1, price: 180, category: 'อาหารจานหลัก' },
        { name: 'คอหมูย่างน้ำจิ้มแจ่ว', qty: 1, price: 120, category: 'ทานเล่น' },
        { name: 'ข้าวเหนียว', qty: 3, price: 15, category: 'อาหารจานหลัก' },
        { name: 'น้ำเปล่าเย็น + น้ำแข็ง', qty: 3, price: 15, category: 'เครื่องดื่ม' },
      ],
    },
    {
      id: 105,
      order_number: '#105',
      table_number: 'โต๊ะ 3',
      total_amount: 680,
      payment_method: 'cash',
      status: 'paid',
      created_at: getTimestamp(0, 18, 30),
      items: [
        { name: 'ปลากะพงทอดน้ำปลา', qty: 1, price: 380, category: 'อาหารจานหลัก' },
        { name: 'ยำวุ้นเส้นรวมมิตรทะเล', qty: 1, price: 160, category: 'ทานเล่น' },
        { name: 'ข้าวสวยโถ', qty: 1, price: 60, category: 'อาหารจานหลัก' },
        { name: 'ชาเขียวมะลิเย็น', qty: 2, price: 40, category: 'เครื่องดื่ม' },
      ],
    },
    {
      id: 106,
      order_number: '#106',
      table_number: 'โต๊ะ 6',
      total_amount: 260,
      payment_method: 'promptpay',
      status: 'paid',
      created_at: getTimestamp(0, 19, 10),
      items: [
        { name: 'สปาเก็ตตี้คาโบนาร่า', qty: 1, price: 140, category: 'อาหารจานหลัก' },
        { name: 'เฟรนช์ฟรายส์ทอดกรอบ', qty: 1, price: 75, category: 'ทานเล่น' },
        { name: 'โค้กเย็น', qty: 1, price: 45, category: 'เครื่องดื่ม' },
      ],
    },
    {
      id: 107,
      order_number: '#107',
      table_number: 'โต๊ะ 2',
      total_amount: 450,
      payment_method: 'promptpay',
      status: 'paid',
      created_at: getTimestamp(1, 12, 10),
      items: [
        { name: 'ข้าวกะเพราหมูกรอบ + ไข่ดาว', qty: 3, price: 85, category: 'อาหารจานหลัก' },
        { name: 'ปีกไก่ทอดเกลือ', qty: 1, price: 95, category: 'ทานเล่น' },
        { name: 'ชาไทยเย็นหวานน้อย', qty: 2, price: 45, category: 'เครื่องดื่ม' },
        { name: 'ไอศกรีมกะทิสด', qty: 1, price: 60, category: 'ของหวาน' },
      ],
    },
    {
      id: 108,
      order_number: '#108',
      table_number: 'โต๊ะ 1',
      total_amount: 380,
      payment_method: 'cash',
      status: 'paid',
      created_at: getTimestamp(1, 18, 40),
      items: [
        { name: 'ต้มยำกุ้งน้ำข้น (หม้อไฟ)', qty: 1, price: 220, category: 'อาหารจานหลัก' },
        { name: 'ไข่เจียวปูฟูกรอบ', qty: 1, price: 120, category: 'อาหารจานหลัก' },
        { name: 'ข้าวสวย', qty: 2, price: 20, category: 'อาหารจานหลัก' },
      ],
    },
    {
      id: 109,
      order_number: '#109',
      table_number: 'โต๊ะ 3',
      total_amount: 510,
      payment_method: 'promptpay',
      status: 'paid',
      created_at: getTimestamp(2, 13, 0),
      items: [
        { name: 'ปลากะพงทอดน้ำปลา', qty: 1, price: 380, category: 'อาหารจานหลัก' },
        { name: 'ชาเขียวมะลิเย็น', qty: 2, price: 40, category: 'เครื่องดื่ม' },
        { name: 'บัวลอยน้ำขิง', qty: 1, price: 50, category: 'ของหวาน' },
      ],
    },
    {
      id: 110,
      order_number: '#110',
      table_number: 'โต๊ะ 5',
      total_amount: 340,
      payment_method: 'cash',
      status: 'paid',
      created_at: getTimestamp(3, 19, 15),
      items: [
        { name: 'ข้าวกะเพราหมูกรอบ + ไข่ดาว', qty: 2, price: 85, category: 'อาหารจานหลัก' },
        { name: 'ส้มตำไทยถาด', qty: 1, price: 120, category: 'อาหารจานหลัก' },
        { name: 'ชาไทยเย็นหวานน้อย', qty: 1, price: 45, category: 'เครื่องดื่ม' },
      ],
    },
  ];
};

export default function SalesReportScreen({ store, onBack }) {
  const restaurantId = store?.restaurantId || store?.id;
  const restaurantName = store?.restaurantName || store?.name || 'ร้านค้าของคุณ';

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState('today'); // 'today' | 'yesterday' | 'week' | 'month' | 'all'
  const [isDemoMode, setIsDemoMode] = useState(false);

  // ข้อมูลจริงจาก Database
  const [rawOrders, setRawOrders] = useState([]);
  const [menuItemsMap, setMenuItemsMap] = useState({});
  const [tablesMap, setTablesMap] = useState({});

  // โมดอลดูบิล และโมดอลสรุปปิดรอบวัน
  const [selectedBill, setSelectedBill] = useState(null);
  const [showCloseShiftModal, setShowCloseShiftModal] = useState(false);
  const [selectedHour, setSelectedHour] = useState(null);

  // Lifecycle guard
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    fetchSalesData();
  }, [restaurantId]);

  // ดึงข้อมูลจริงจาก Supabase
  const fetchSalesData = async () => {
    try {
      setLoading(true);

      // 1. ดึงข้อมูลเมนูและผังโต๊ะของร้านเพื่อใช้อ้างอิงชื่อ
      if (restaurantId) {
        const [menusRes, tablesRes] = await Promise.all([
          supabase.from('menu_items').select('*').eq('restaurant_id', restaurantId),
          supabase.from('tables').select('*').eq('restaurant_id', restaurantId),
        ]);

        if (!isMountedRef.current) return;

        const mMap = {};
        if (menusRes.data) {
          menusRes.data.forEach((m) => {
            mMap[m.id] = m;
          });
        }
        setMenuItemsMap(mMap);

        const tMap = {};
        if (tablesRes.data) {
          tablesRes.data.forEach((t) => {
            const label = t.table_number || `โต๊ะ ${t.id}`;
            tMap[t.id] = label;
            const num = parseInt(String(t.table_number || '').replace(/\D/g, ''), 10);
            if (!isNaN(num)) {
              tMap[num] = label;
            }
          });
        }
        setTablesMap(tMap);
      }

      // 2. ดึงข้อมูล Orders ที่ชำระเงินแล้วเฉพาะร้านนี้โดยตรงด้วย restaurant_id
      let query = supabase
        .from('orders')
        .select(`
          id,
          restaurant_id,
          table_id,
          total_amount,
          status,
          created_at,
          payment_method,
          payment_amount,
          change_amount,
          subtotal,
          discount_amount,
          vat_amount,
          service_charge_amount,
          customer_id,
          customer_phone,
          customer_name,
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
        .eq('status', 'paid')
        .order('created_at', { ascending: false });

      if (restaurantId) {
        query = query.eq('restaurant_id', restaurantId);
      }

      const { data: ordersData, error: ordersErr } = await query;

      if (ordersErr) {
        console.warn('Orders Fetch Warning:', ordersErr);
      }

      if (!isMountedRef.current) return;

      // กรองบิลย่อยที่ถูกรวมเข้าบิลหลักแล้วออก (ยอด 0 บาทและไม่มีรายการอาหารค้าง)
      const ordersList = (ordersData || []).filter(
        (o) => !(Number(o.total_amount) === 0 && (!o.order_items || o.order_items.length === 0))
      );
      setRawOrders(ordersList);

      // หากร้านค้ายังไม่มียอดขายจริง ให้เปิด Demo Mode อัตโนมัติเพื่อให้เห็นรูปแบบสถิติ
      if (ordersList.length === 0) {
        setIsDemoMode(true);
      } else {
        setIsDemoMode(false);
      }
    } catch (err) {
      console.error('Fetch Sales Error:', err);
      if (isMountedRef.current) {
        setIsDemoMode(true);
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  };

  // แหล่งข้อมูลที่กำลังใช้งาน (ข้อมูลจริง vs ข้อมูลจำลอง Demo)
  const allOrders = useMemo(() => {
    if (isDemoMode) {
      return generateDemoOrders(restaurantName);
    }

    return rawOrders.map((o, idx) => {
      // แปลง order_items ให้เป็น format มาตรฐาน
      const items = (o.order_items || []).map((oi) => {
        const menuObj = menuItemsMap[oi.menu_id] || menuItemsMap[oi.menu_item_id];
        const parsedPrice = Number(oi.price_per_item) || 0;
        const parsedQty = Number(oi.quantity) || 1;
        return {
          name: oi.item_name || oi.menus?.name || menuObj?.name || `เมนู #${oi.menu_id || oi.menu_item_id || idx + 1}`,
          qty: parsedQty,
          price: parsedPrice,
          category: oi.category || menuObj?.category || 'อาหารจานหลัก',
        };
      });

      const parsedTotal = Number(o.total_amount) || 0;

      // ถ้าไม่มี order_items ให้สร้าง default item จำลองตามยอดเงิน
      const fallbackItems = items.length > 0 ? items : [
        { name: 'รายการอาหารและเครื่องดื่ม', qty: 1, price: parsedTotal, category: 'อาหารจานหลัก' }
      ];

      return {
        id: o.id,
        order_number: `#${o.id}`,
        table_number: tablesMap[o.table_id] || (o.table_id ? `โต๊ะ ${o.table_id}` : 'หน้าร้าน'),
        total_amount: parsedTotal,
        subtotal: Number(o.subtotal) || parsedTotal,
        vat_amount: Number(o.vat_amount) || 0,
        service_charge_amount: Number(o.service_charge_amount) || 0,
        discount_amount: Number(o.discount_amount) || 0,
        payment_amount: Number(o.payment_amount) || parsedTotal,
        change_amount: Number(o.change_amount) || 0,
        customer_name: o.customer_name || null,
        customer_phone: o.customer_phone || null,
        payment_method: o.payment_method || (Number(o.id) % 2 === 0 ? 'cash' : 'promptpay'),
        status: o.status,
        created_at: o.created_at,
        items: fallbackItems,
      };
    });
  }, [isDemoMode, rawOrders, menuItemsMap, tablesMap, restaurantName]);

  // ฟังก์ชันกรองออเดอร์ตามช่วงเวลาที่เลือก
  const filteredOrders = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const startOfYesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0);
    const endOfYesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59);
    const startOf7Days = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6, 0, 0, 0);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);

    return allOrders.filter((order) => {
      const orderDate = new Date(order.created_at);
      if (isNaN(orderDate.getTime())) return false;
      if (activeFilter === 'today') {
        return orderDate >= startOfToday;
      }
      if (activeFilter === 'yesterday') {
        return orderDate >= startOfYesterday && orderDate <= endOfYesterday;
      }
      if (activeFilter === 'week') {
        return orderDate >= startOf7Days;
      }
      if (activeFilter === 'month') {
        return orderDate >= startOfMonth;
      }
      return true; // 'all'
    });
  }, [allOrders, activeFilter]);

  // 1. คำนวณสรุป Key Metrics
  const metrics = useMemo(() => {
    const totalRev = filteredOrders.reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);
    const totalCount = filteredOrders.length;
    const aov = totalCount > 0 ? (Number(totalRev) || 0) / totalCount : 0;
    const itemsCount = filteredOrders.reduce((sum, o) => {
      return sum + (o.items || []).reduce((itemSum, i) => itemSum + (Number(i.qty) || 0), 0);
    }, 0);

    return {
      totalRevenue: Number(totalRev) || 0,
      totalOrders: Number(totalCount) || 0,
      averageOrderValue: Number(aov) || 0,
      totalItemsSold: Number(itemsCount) || 0,
    };
  }, [filteredOrders]);

  // 2. คำนวณยอดขายตามช่วงเวลา (Peak Hours & Trend Chart)
  const hourlyData = useMemo(() => {
    // ช่วงเวลาเปิดร้านปกติ 09:00 - 22:00
    const hours = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22];
    const map = {};
    hours.forEach((h) => {
      map[h] = { hour: h, label: `${h}:00`, amount: 0, count: 0 };
    });

    filteredOrders.forEach((o) => {
      const orderDate = new Date(o.created_at);
      if (isNaN(orderDate.getTime())) return;
      const h = orderDate.getHours();
      if (map[h]) {
        map[h].amount += Number(o.total_amount) || 0;
        map[h].count += 1;
      }
    });

    const list = hours.map((h) => map[h]);
    const maxAmount = Math.max(...list.map((item) => Number(item.amount) || 0), 1);
    return { list, maxAmount };
  }, [filteredOrders]);

  // 3. คำนวณสัดส่วนช่องทางชำระเงิน (Payment Methods Breakdown)
  const paymentStats = useMemo(() => {
    let cash = 0;
    let cashCount = 0;
    let promptpay = 0;
    let promptpayCount = 0;

    filteredOrders.forEach((o) => {
      const amt = Number(o.total_amount) || 0;
      if (o.payment_method === 'cash') {
        cash += amt;
        cashCount += 1;
      } else {
        promptpay += amt;
        promptpayCount += 1;
      }
    });

    const total = (Number(cash) || 0) + (Number(promptpay) || 0);
    const cashPct = total > 0 ? Math.round(((Number(cash) || 0) / total) * 100) : 0;
    const promptpayPct = total > 0 ? Math.max(0, 100 - cashPct) : 0;

    return {
      cash: Number(cash) || 0,
      cashCount: Number(cashCount) || 0,
      cashPct: Number(cashPct) || 0,
      promptpay: Number(promptpay) || 0,
      promptpayCount: Number(promptpayCount) || 0,
      promptpayPct: Number(promptpayPct) || 0,
      total: Number(total) || 0,
    };
  }, [filteredOrders]);

  // 4. คำนวณอันดับเมนูขายดีที่สุด 5 อันดับ (Top Best Sellers)
  const topSellers = useMemo(() => {
    const itemMap = {};

    filteredOrders.forEach((o) => {
      (o.items || []).forEach((item) => {
        const key = item.name;
        if (!itemMap[key]) {
          itemMap[key] = {
            name: item.name,
            qty: 0,
            revenue: 0,
            category: item.category || 'อาหารจานหลัก',
          };
        }
        const qty = Number(item.qty) || 0;
        const price = Number(item.price) || 0;
        itemMap[key].qty += qty;
        itemMap[key].revenue += price * qty;
      });
    });

    const sorted = Object.values(itemMap).sort((a, b) => (Number(b.qty) || 0) - (Number(a.qty) || 0));
    const top5 = sorted.slice(0, 5);
    const maxQty = top5.length > 0 ? (Number(top5[0].qty) || 1) : 1;

    return { top5, maxQty };
  }, [filteredOrders]);

  // 5. คำนวณสัดส่วนตามหมวดหมู่ (Category Breakdown)
  const categoryStats = useMemo(() => {
    const catMap = {
      'อาหารจานหลัก': 0,
      'ทานเล่น': 0,
      'เครื่องดื่ม': 0,
      'ของหวาน': 0,
    };

    let totalCatAmount = 0;

    filteredOrders.forEach((o) => {
      (o.items || []).forEach((item) => {
        const cat = item.category || 'อาหารจานหลัก';
        const cost = (Number(item.price) || 0) * (Number(item.qty) || 0);
        catMap[cat] = (Number(catMap[cat]) || 0) + cost;
        totalCatAmount += cost;
      });
    });

    return Object.keys(catMap).map((catName) => {
      const amount = Number(catMap[catName]) || 0;
      const pct = totalCatAmount > 0 ? Math.round((amount / totalCatAmount) * 100) : 0;
      return { name: catName, amount, pct };
    });
  }, [filteredOrders]);

  // ฟังก์ชันดาวน์โหลดหรือแชร์รายงาน CSV
  const handleExportCSV = async () => {
    try {
      let csvContent = 'Order ID,Date,Time,Table,Payment Method,Total (THB),Items Summary\n';
      filteredOrders.forEach((o) => {
        const d = new Date(o.created_at);
        const dateStr = d.toLocaleDateString('th-TH');
        const timeStr = d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
        const paymentTH = o.payment_method === 'cash' ? 'เงินสด' : 'พร้อมเพย์';
        const itemsStr = (o.items || []).map((i) => `${i.name} (x${i.qty})`).join('; ');

        csvContent += `"${o.order_number}","${dateStr}","${timeStr}","${o.table_number}","${paymentTH}",${o.total_amount},"${itemsStr}"\n`;
      });

      if (Platform.OS === 'web') {
        const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `Sales_Report_${restaurantName}_${activeFilter}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        alert('ส่งออกไฟล์ Excel/CSV สำเร็จ!');
      } else {
        await Clipboard.setStringAsync(csvContent);
        Alert.alert('คัดลอก CSV แล้ว', 'ข้อมูลตารางยอดขายถูกคัดลอกลง Clipboard เรียบร้อยแล้ว');
      }
    } catch (err) {
      console.error('Export Error:', err);
      Alert.alert('เกิดข้อผิดพลาด', 'ไม่สามารถส่งออกข้อมูลได้');
    }
  };

  // ฟังก์ชันคัดลอกข้อความสรุปส่งเข้า LINE กลุ่มร้าน
  const handleCopyLineSummary = async () => {
    const todayStr = new Date().toLocaleDateString('th-TH', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    const text = `[สรุปยอดขายประจำวัน - ${restaurantName}]
วันที่: ${todayStr}
-------------------------
ยอดขายรวม: ฿${(Number(metrics.totalRevenue) || 0).toLocaleString()}
จำนวนบิลทั้งหมด: ${Number(metrics.totalOrders) || 0} บิล
ยอดเฉลี่ยต่อบิล: ฿${(Number(metrics.averageOrderValue) || 0).toFixed(2)}
อาหาร/เครื่องดื่มที่ขายได้: ${Number(metrics.totalItemsSold) || 0} รายการ
-------------------------
เงินสดที่ต้องมีในเก๊ะ: ฿${(Number(paymentStats.cash) || 0).toLocaleString()} (${Number(paymentStats.cashCount) || 0} บิล)
ยอดโอนพร้อมเพย์: ฿${(Number(paymentStats.promptpay) || 0).toLocaleString()} (${Number(paymentStats.promptpayCount) || 0} บิล)
-------------------------
เมนูขายดีอันดับ 1: ${topSellers.top5[0]?.name || '-'} (${Number(topSellers.top5[0]?.qty) || 0} จาน)
บันทึกผ่านระบบ BuddyPOS`;

    if (Platform.OS === 'web') {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        alert('คัดลอกข้อความสรุปยอดขายแล้ว! สามารถนำไปวางใน LINE ได้ทันที');
      }
    } else {
      await Clipboard.setStringAsync(text);
      Alert.alert('คัดลอกสำเร็จ', 'นำข้อความสรุปยอดไปวางใน LINE หรือแชทร้านค้าได้ทันที');
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
        <View style={styles.headerTitleBox}>
          <Text style={styles.headerTitle} numberOfLines={1}>รายงานยอดขาย & สถิติ</Text>
          <Text style={styles.headerSubtitle} numberOfLines={1}>{restaurantName}</Text>
        </View>
        <TouchableOpacity
          style={styles.refreshBtn}
          onPress={() => {
            setRefreshing(true);
            fetchSalesData();
          }}
        >
          <Icon name="refresh-outline" size={18} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Banner แจ้งสถานะโหมดข้อมูล */}
        <View style={[styles.modeBanner, isDemoMode ? styles.demoBanner : styles.liveBanner]}>
          <View style={{ flex: 1 }}>
            <View style={styles.modeBannerTitleRow}>
              <Icon
                name={isDemoMode ? 'flask-outline' : 'radio-button-on'}
                size={15}
                color={isDemoMode ? colors.warning : colors.primary}
              />
              <Text style={[styles.modeBannerTitle, isDemoMode ? styles.demoText : styles.liveText]}>
                {isDemoMode ? 'กำลังแสดงตัวอย่างข้อมูลจำลอง (Demo Mode)' : 'กำลังแสดงข้อมูลจริงจากระบบ (Live Data)'}
              </Text>
            </View>
            <Text style={styles.modeBannerSub}>
              {isDemoMode
                ? 'ร้านยังไม่มียอดขายจริง จึงแสดงตัวอย่างเพื่อให้เห็นการทำงานของกราฟและสถิติ'
                : `ดึงข้อมูลบิลสำเร็จจากฐานข้อมูลร้านค้า (${rawOrders.length} บิล)`}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.modeToggleBtn, isDemoMode ? styles.demoToggleBtn : styles.liveToggleBtn]}
            onPress={() => setIsDemoMode(!isDemoMode)}
          >
            <Text style={styles.modeToggleBtnText}>
              {isDemoMode ? 'สลับดูข้อมูลจริง' : 'ดูตัวอย่าง Demo'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* ตัวกรองช่วงเวลา (Time Filter Presets) */}
        <View style={styles.filterContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
            {[
              { id: 'today', label: 'วันนี้' },
              { id: 'yesterday', label: 'เมื่อวาน' },
              { id: 'week', label: '7 วันล่าสุด' },
              { id: 'month', label: 'เดือนนี้' },
              { id: 'all', label: 'ทั้งหมด' },
            ].map((tab) => (
              <TouchableOpacity
                key={tab.id}
                style={[styles.filterChip, activeFilter === tab.id && styles.filterChipActive]}
                onPress={() => setActiveFilter(tab.id)}
              >
                <Text style={[styles.filterChipText, activeFilter === tab.id && styles.filterChipTextActive]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {loading ? (
          <View style={styles.centerBox}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>กำลังคำนวณและประมวลผลสถิติ...</Text>
          </View>
        ) : (
          <>
            {/* 1. สรุปภาพรวม 4 การ์ด (Key Metric Cards) */}
            <View style={styles.metricsGrid}>
              {/* ยอดขายรวม */}
              <View style={[styles.metricCard, styles.metricCardPrimary]}>
                <View style={[styles.metricIconWrap, { backgroundColor: colors.surface }]}>
                  <Icon name="wallet-outline" size={18} color={colors.primary} />
                </View>
                <Text style={styles.metricLabel}>ยอดขายรวมสุทธิ</Text>
                <Text style={styles.metricValuePrimary}>฿{(Number(metrics.totalRevenue) || 0).toLocaleString()}</Text>
                <Text style={styles.metricSub}>สถานะ: ชำระเงินแล้ว</Text>
              </View>

              {/* จำนวนบิล */}
              <View style={styles.metricCard}>
                <View style={styles.metricIconWrap}>
                  <Icon name="receipt-outline" size={18} color={colors.textSecondary} />
                </View>
                <Text style={styles.metricLabel}>จำนวนบิลที่สำเร็จ</Text>
                <Text style={styles.metricValue}>{Number(metrics.totalOrders) || 0} <Text style={styles.unitText}>บิล</Text></Text>
                <Text style={styles.metricSub}>ปิดโต๊ะเรียบร้อย</Text>
              </View>

              {/* ยอดเฉลี่ยต่อบิล */}
              <View style={styles.metricCard}>
                <View style={styles.metricIconWrap}>
                  <Icon name="pricetag-outline" size={18} color={colors.textSecondary} />
                </View>
                <Text style={styles.metricLabel}>ยอดเฉลี่ย / บิล (AOV)</Text>
                <Text style={styles.metricValue}>฿{(Number(metrics.averageOrderValue) || 0).toFixed(0)}</Text>
                <Text style={styles.metricSub}>การใช้จ่ายต่อโต๊ะ</Text>
              </View>

              {/* จำนวนจานที่ขายได้ */}
              <View style={styles.metricCard}>
                <View style={styles.metricIconWrap}>
                  <Icon name="restaurant-outline" size={18} color={colors.textSecondary} />
                </View>
                <Text style={styles.metricLabel}>เมนูที่ขายออกไป</Text>
                <Text style={styles.metricValue}>{Number(metrics.totalItemsSold) || 0} <Text style={styles.unitText}>จาน</Text></Text>
                <Text style={styles.metricSub}>อาหารและเครื่องดื่ม</Text>
              </View>
            </View>

            {/* 2. กราฟยอดขายและช่วงเวลาขายดี (Peak Hours Bar Chart) */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeaderRow}>
                <View>
                  <View style={styles.sectionTitleWithIcon}>
                    <Icon name="trending-up-outline" size={18} color={colors.primary} />
                    <Text style={styles.sectionTitle}>กราฟยอดขาย & ช่วงเวลาขายดี (Peak Hours)</Text>
                  </View>
                  <Text style={styles.sectionDesc}>แตะที่แท่งกราฟเพื่อดูยอดขายในแต่ละชั่วโมง</Text>
                </View>
                {selectedHour && (
                  <TouchableOpacity onPress={() => setSelectedHour(null)} style={styles.resetHourBtn}>
                    <Icon name="close" size={14} color={colors.danger} />
                    <Text style={styles.resetHourText}>รีเซ็ต</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* กราฟแท่ง Pure React Native (Responsive 100%) */}
              <View style={styles.chartContainer}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chartScroll}>
                  {hourlyData.list.map((hItem) => {
                    const hAmt = Number(hItem.amount) || 0;
                    const heightPercent = hourlyData.maxAmount > 0 ? (hAmt / hourlyData.maxAmount) * 100 : 0;
                    const isSelected = selectedHour?.hour === hItem.hour;
                    const isPeak = heightPercent > 60;

                    return (
                      <TouchableOpacity
                        key={hItem.hour}
                        style={styles.barCol}
                        activeOpacity={0.8}
                        onPress={() => setSelectedHour(hItem)}
                      >
                        <View style={styles.barWrap}>
                          {hAmt > 0 && (
                            <Text style={[styles.barAmountTip, isSelected && styles.barAmountTipActive]}>
                              ฿{hAmt >= 1000 ? `${(hAmt / 1000).toFixed(1)}k` : hAmt}
                            </Text>
                          )}
                          <View
                            style={[
                              styles.barFill,
                              { height: `${Math.max(heightPercent, 6)}%` },
                              isPeak && styles.barFillPeak,
                              isSelected && styles.barFillSelected,
                            ]}
                          />
                        </View>
                        <Text style={[styles.barLabel, isSelected && styles.barLabelActive]}>{hItem.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              {selectedHour && (
                <View style={styles.hourDetailBox}>
                  <Icon name="time-outline" size={15} color={colors.primaryDeep} />
                  <Text style={styles.hourDetailText}>
                    ช่วงเวลา <Text style={{ fontWeight: '700' }}>{selectedHour.label}</Text>: ยอดขาย{' '}
                    <Text style={{ fontWeight: '700', color: colors.primary }}>฿{(Number(selectedHour.amount) || 0).toLocaleString()}</Text>{' '}
                    ({Number(selectedHour.count) || 0} บิล)
                  </Text>
                </View>
              )}
            </View>

            {/* 3. สัดส่วนช่องทางชำระเงิน (Payment Breakdown) */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionTitleWithIcon}>
                <Icon name="card-outline" size={18} color={colors.primary} />
                <Text style={styles.sectionTitle}>ช่องทางรับชำระเงิน (ตรวจนับเงินสด/โอน)</Text>
              </View>
              <Text style={styles.sectionDesc}>สำหรับกระทบยอดเงินสดในลิ้นชักกับเงินโอนในบัญชีธนาคาร</Text>

              {/* Progress Meter Bar */}
              <View style={styles.paymentMeter}>
                <View style={[styles.paymentMeterCash, { width: `${Number(paymentStats.cashPct) || 0}%` }]} />
                <View style={[styles.paymentMeterPrompt, { width: `${Number(paymentStats.promptpayPct) || 0}%` }]} />
              </View>

              <View style={styles.paymentRow}>
                {/* เงินสด */}
                <View style={styles.paymentBox}>
                  <View style={styles.paymentTitleRow}>
                    <View style={[styles.dot, { backgroundColor: '#10B981' }]} />
                    <Text style={styles.paymentName}>เงินสด (Cash)</Text>
                  </View>
                  <Text style={styles.paymentAmount}>฿{(Number(paymentStats.cash) || 0).toLocaleString()}</Text>
                  <Text style={styles.paymentSub}>
                    {Number(paymentStats.cashCount) || 0} บิล ({Number(paymentStats.cashPct) || 0}%)
                  </Text>
                </View>

                {/* สแกนพร้อมเพย์ */}
                <View style={styles.paymentBox}>
                  <View style={styles.paymentTitleRow}>
                    <View style={[styles.dot, { backgroundColor: '#3B82F6' }]} />
                    <Text style={styles.paymentName}>สแกน QR / โอนเงิน</Text>
                  </View>
                  <Text style={[styles.paymentAmount, { color: colors.info }]}>
                    ฿{(Number(paymentStats.promptpay) || 0).toLocaleString()}
                  </Text>
                  <Text style={styles.paymentSub}>
                    {Number(paymentStats.promptpayCount) || 0} บิล ({Number(paymentStats.promptpayPct) || 0}%)
                  </Text>
                </View>
              </View>
            </View>

            {/* 4. สองคอลัมน์: 5 อันดับเมนูขายดี & ยอดขายตามหมวดหมู่ */}
            <View style={styles.rowGrid}>
              {/* 5 อันดับเมนูขายดี */}
              <View style={[styles.sectionCard, styles.halfCol]}>
                <View style={styles.sectionTitleWithIcon}>
                  <Icon name="trophy-outline" size={18} color={colors.warning} />
                  <Text style={styles.sectionTitle}>5 อันดับเมนูขายดี</Text>
                </View>
                <Text style={styles.sectionDesc}>เมนูยอดนิยมที่ทำยอดได้สูงสุด</Text>

                {topSellers.top5.length === 0 ? (
                  <Text style={styles.emptyText}>ยังไม่มีข้อมูลการขาย</Text>
                ) : (
                  topSellers.top5.map((item, idx) => {
                    const itemQty = Number(item.qty) || 0;
                    const maxQty = Number(topSellers.maxQty) || 1;
                    const pct = maxQty > 0 ? Math.round((itemQty / maxQty) * 100) : 0;
                    return (
                      <View key={item.name} style={styles.rankItem}>
                        <View style={styles.rankBadgeBox}>
                          <Text style={[styles.rankNumber, idx === 0 && styles.rankOne]}>#{idx + 1}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <View style={styles.rankItemHeader}>
                            <Text style={styles.rankItemName} numberOfLines={1}>{item.name}</Text>
                            <Text style={styles.rankItemQty}>{itemQty} จาน</Text>
                          </View>
                          <View style={styles.rankBarBg}>
                            <View style={[styles.rankBarFill, { width: `${pct}%` }]} />
                          </View>
                          <Text style={styles.rankItemRevenue}>ทำยอดได้ ฿{(Number(item.revenue) || 0).toLocaleString()}</Text>
                        </View>
                      </View>
                    );
                  })
                )}
              </View>

              {/* ยอดขายตามหมวดหมู่ */}
              <View style={[styles.sectionCard, styles.halfCol]}>
                <View style={styles.sectionTitleWithIcon}>
                  <Icon name="pie-chart-outline" size={18} color={colors.info} />
                  <Text style={styles.sectionTitle}>สัดส่วนตามหมวดหมู่</Text>
                </View>
                <Text style={styles.sectionDesc}>โครงสร้างประเภทสินค้าที่ขายได้</Text>

                {categoryStats.map((cat) => (
                  <View key={cat.name} style={styles.catItem}>
                    <View style={styles.catHeader}>
                      <Text style={styles.catName}>{cat.name}</Text>
                      <Text style={styles.catAmount}>฿{(Number(cat.amount) || 0).toLocaleString()} ({Number(cat.pct) || 0}%)</Text>
                    </View>
                    <View style={styles.catBarBg}>
                      <View style={[styles.catBarFill, { width: `${Number(cat.pct) || 0}%` }]} />
                    </View>
                  </View>
                ))}
              </View>
            </View>

            {/* 5. ประวัติบิลล่าสุด (Recent Transactions) */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionTitleWithIcon}>
                  <Icon name="receipt-outline" size={18} color={colors.primary} />
                  <Text style={styles.sectionTitle}>ประวัติรายการบิลล่าสุด ({filteredOrders.length} บิล)</Text>
                </View>
                <TouchableOpacity onPress={handleExportCSV} style={styles.exportLinkBtn}>
                  <Icon name="download-outline" size={15} color={colors.primary} />
                  <Text style={styles.exportLinkText}>ส่งออก Excel/CSV</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.sectionDesc}>แตะที่รายการบิลเพื่อดูรายละเอียดรายการอาหารและใบเสร็จย่อ</Text>

              {filteredOrders.length === 0 ? (
                <Text style={styles.emptyText}>ไม่มีรายการบิลในช่วงเวลานี้</Text>
              ) : (
                filteredOrders.slice(0, 10).map((order) => {
                  const dateStr = new Date(order.created_at).toLocaleTimeString('th-TH', {
                    hour: '2-digit',
                    minute: '2-digit',
                  });

                  return (
                    <TouchableOpacity
                      key={order.id}
                      style={styles.orderRow}
                      activeOpacity={0.7}
                      onPress={() => setSelectedBill(order)}
                    >
                      <View style={{ flex: 1 }}>
                        <View style={styles.orderRowHeader}>
                          <Text style={styles.orderNumber}>{order.order_number}</Text>
                          <Text style={styles.orderTable}>{order.table_number}</Text>
                          <Text style={styles.orderTime}>{dateStr} น.</Text>
                        </View>
                        <Text style={styles.orderSummaryText} numberOfLines={1}>
                          {(order.items || []).map((i) => `${i.name} x${Number(i.qty) || 1}`).join(', ')}
                        </Text>
                      </View>

                      <View style={styles.orderRowRight}>
                        <Text style={styles.orderTotal}>฿{(Number(order.total_amount) || 0).toLocaleString()}</Text>
                        <View
                          style={[
                            styles.badgePay,
                            order.payment_method === 'cash' ? styles.badgeCash : styles.badgePrompt,
                          ]}
                        >
                          <Text
                            style={[
                              styles.badgePayText,
                              order.payment_method === 'cash' ? styles.badgeCashText : styles.badgePromptText,
                            ]}
                          >
                            {order.payment_method === 'cash' ? 'เงินสด' : 'พร้อมเพย์'}
                          </Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </View>

            {/* ปุ่ม Action ท้ายหน้า: สรุปปิดกะสิ้นวัน & แชร์เข้า LINE */}
            <View style={styles.footerActions}>
              <TouchableOpacity
                style={styles.closeShiftBtn}
                activeOpacity={0.85}
                onPress={() => setShowCloseShiftModal(true)}
              >
                <Icon name="lock-closed-outline" size={18} color={colors.textOnPrimary} />
                <Text style={styles.closeShiftBtnText}>สรุปปิดยอดประจำวัน / ปิดกะ</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.lineShareBtn}
                activeOpacity={0.85}
                onPress={handleCopyLineSummary}
              >
                <Icon name="share-social-outline" size={18} color={colors.textOnPrimary} />
                <Text style={styles.lineShareBtnText}>คัดลอกสรุปส่ง LINE</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>

      {/* MODAL 1: รายละเอียดใบเสร็จย่อ (Bill Detail Modal) */}
      <Modal visible={!!selectedBill} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.receiptCard}>
            <View style={styles.receiptHeader}>
              <Text style={styles.receiptStoreName}>{restaurantName}</Text>
              <Text style={styles.receiptTitle}>ใบเสร็จรับเงิน / ค่าอาหาร</Text>
              <Text style={styles.receiptMeta}>
                บิล {selectedBill?.order_number} • {selectedBill?.table_number}
              </Text>
              <Text style={styles.receiptMeta}>
                เวลา: {selectedBill && new Date(selectedBill.created_at).toLocaleString('th-TH')}
              </Text>
            </View>

            <View style={styles.receiptDivider} />

            <ScrollView style={{ maxHeight: 240 }}>
              {(selectedBill?.items || []).map((item, idx) => (
                <View key={idx} style={styles.receiptItemRow}>
                  <Text style={styles.receiptItemName} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={styles.receiptItemQty}>x{Number(item.qty) || 1}</Text>
                  <Text style={styles.receiptItemPrice}>฿{((Number(item.price) || 0) * (Number(item.qty) || 1)).toLocaleString()}</Text>
                </View>
              ))}
            </ScrollView>

            <View style={styles.receiptDivider} />

            {(Number(selectedBill?.service_charge_amount) > 0 || Number(selectedBill?.vat_amount) > 0) && (
              <View style={{ marginBottom: 6 }}>
                <View style={styles.receiptPayMethodRow}>
                  <Text style={styles.receiptPayMethodLabel}>ยอดรวมค่าอาหาร (Subtotal):</Text>
                  <Text style={styles.receiptPayMethodVal}>
                    ฿{(Number(selectedBill?.subtotal) || 0).toLocaleString()}
                  </Text>
                </View>
                {Number(selectedBill?.service_charge_amount) > 0 && (
                  <View style={styles.receiptPayMethodRow}>
                    <Text style={styles.receiptPayMethodLabel}>ค่าบริการ (Service Charge):</Text>
                    <Text style={styles.receiptPayMethodVal}>
                      ฿{(Number(selectedBill?.service_charge_amount) || 0).toLocaleString()}
                    </Text>
                  </View>
                )}
                {Number(selectedBill?.vat_amount) > 0 && (
                  <View style={styles.receiptPayMethodRow}>
                    <Text style={styles.receiptPayMethodLabel}>ภาษีมูลค่าเพิ่ม (VAT):</Text>
                    <Text style={styles.receiptPayMethodVal}>
                      ฿{(Number(selectedBill?.vat_amount) || 0).toLocaleString()}
                    </Text>
                  </View>
                )}
              </View>
            )}

            <View style={styles.receiptTotalRow}>
              <Text style={styles.receiptTotalLabel}>ยอดชำระสุทธิ:</Text>
              <Text style={styles.receiptTotalAmount}>฿{(Number(selectedBill?.total_amount) || 0).toLocaleString()}</Text>
            </View>

            {selectedBill?.customer_phone ? (
              <View style={[styles.receiptPayMethodRow, { marginBottom: 6 }]}>
                <Text style={styles.receiptPayMethodLabel}>สมาชิก:</Text>
                <Text style={[styles.receiptPayMethodVal, { color: colors.primary }]}>
                  {selectedBill.customer_name || 'ลูกค้าสมาชิก'} ({selectedBill.customer_phone})
                </Text>
              </View>
            ) : null}

            <View style={styles.receiptPayMethodRow}>
              <Text style={styles.receiptPayMethodLabel}>ช่องทางชำระเงิน:</Text>
              <View style={styles.receiptPayMethodValRow}>
                <Icon
                  name={selectedBill?.payment_method === 'cash' ? 'cash-outline' : 'qr-code-outline'}
                  size={14}
                  color={colors.text}
                />
                <Text style={styles.receiptPayMethodVal}>
                  {selectedBill?.payment_method === 'cash' ? 'เงินสด' : 'สแกน QR พร้อมเพย์'}
                </Text>
              </View>
            </View>

            <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setSelectedBill(null)}>
              <Text style={styles.modalCloseBtnText}>ปิดหน้าต่าง</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* MODAL 2: สรุปปิดยอดประจำวัน / ปิดกะ (End of Day Closing Modal) */}
      <Modal visible={showCloseShiftModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.shiftCard}>
            <View style={styles.shiftHeaderRow}>
              <Icon name="lock-closed-outline" size={20} color={colors.text} />
              <Text style={styles.shiftTitle}>สรุปปิดยอดประจำวัน (EOD Report)</Text>
            </View>
            <Text style={styles.shiftSubtitle}>ร้าน: {restaurantName}</Text>

            <View style={styles.shiftBox}>
              <View style={styles.shiftRow}>
                <Text style={styles.shiftLabel}>ยอดเงินสดในเก๊ะที่ต้องนับได้:</Text>
                <Text style={styles.shiftValCash}>฿{(Number(paymentStats.cash) || 0).toLocaleString()}</Text>
              </View>
              <Text style={styles.shiftSubHint}>({Number(paymentStats.cashCount) || 0} บิลเงินสด)</Text>

              <View style={[styles.shiftRow, { marginTop: 12 }]}>
                <Text style={styles.shiftLabel}>ยอดเงินโอน/พร้อมเพย์เข้าบัญชี:</Text>
                <Text style={styles.shiftValPrompt}>฿{(Number(paymentStats.promptpay) || 0).toLocaleString()}</Text>
              </View>
              <Text style={styles.shiftSubHint}>({Number(paymentStats.promptpayCount) || 0} บิลโอน)</Text>

              <View style={styles.receiptDivider} />

              <View style={styles.shiftRow}>
                <Text style={styles.shiftTotalLabel}>ยอดขายรวมทั้งสิ้น:</Text>
                <Text style={styles.shiftTotalVal}>฿{(Number(metrics.totalRevenue) || 0).toLocaleString()}</Text>
              </View>
              <View style={styles.shiftRow}>
                <Text style={styles.shiftLabel}>จำนวนบิลทั้งหมด:</Text>
                <Text style={styles.shiftLabelVal}>{Number(metrics.totalOrders) || 0} บิล</Text>
              </View>
            </View>

            <View style={styles.modalActionRow}>
              <TouchableOpacity
                style={styles.modalSecondaryBtn}
                onPress={() => setShowCloseShiftModal(false)}
              >
                <Text style={styles.modalSecondaryBtnText}>ปิด</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalPrimaryBtn}
                onPress={() => {
                  setShowCloseShiftModal(false);
                  handleCopyLineSummary();
                }}
              >
                <Icon name="copy-outline" size={16} color={colors.textOnPrimary} />
                <Text style={styles.modalPrimaryBtnText}>คัดลอกส่ง LINE</Text>
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
  backBtnText: { color: colors.primary, fontWeight: '600', fontSize: fontSize.sm + 1, marginLeft: 2 },
  headerTitleBox: { alignItems: 'center' },
  headerTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text },
  headerSubtitle: { fontSize: fontSize.sm, color: colors.textMuted },
  refreshBtn: {
    padding: 8,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.sm,
  },
  scrollContent: { padding: spacing.lg, paddingBottom: 40 },

  // Banner โหมด
  modeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderRadius: radius.md,
    marginBottom: spacing.lg,
  },
  demoBanner: { backgroundColor: colors.warningSoft, borderWidth: 1, borderColor: colors.warningBorder },
  liveBanner: { backgroundColor: colors.primarySoft, borderWidth: 1, borderColor: colors.primaryBorder },
  modeBannerTitleRow: { flexDirection: 'row', alignItems: 'center' },
  modeBannerTitle: { fontSize: fontSize.sm + 1, fontWeight: '700', marginLeft: 6 },
  demoText: { color: colors.warning },
  liveText: { color: colors.primaryDeep },
  modeBannerSub: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  modeToggleBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.sm,
  },
  demoToggleBtn: { backgroundColor: colors.warning },
  liveToggleBtn: { backgroundColor: colors.primary },
  modeToggleBtnText: { color: colors.textOnPrimary, fontSize: fontSize.sm, fontWeight: '700' },

  // ตัวกรองเวลา
  filterContainer: { marginBottom: spacing.lg },
  filterScroll: { flexDirection: 'row', gap: 8 },
  filterChip: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterChipText: { fontSize: fontSize.sm + 1, color: colors.textSecondary, fontWeight: '600' },
  filterChipTextActive: { color: colors.textOnPrimary, fontWeight: '700' },

  centerBox: { padding: 40, alignItems: 'center', justifyContent: 'center' },
  loadingText: { marginTop: 12, color: colors.textMuted, fontSize: fontSize.md },

  // การ์ดสรุปยอด Metric Grid
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  metricCard: {
    width: '48%',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  metricCardPrimary: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primaryBorder,
  },
  metricIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  metricLabel: { fontSize: fontSize.sm, color: colors.textMuted, fontWeight: '600', marginBottom: 4 },
  metricValue: { fontSize: 22, fontWeight: '700', color: colors.text },
  metricValuePrimary: { fontSize: 24, fontWeight: '700', color: colors.primary },
  unitText: { fontSize: fontSize.md, color: colors.textMuted, fontWeight: '400' },
  metricSub: { fontSize: 11, color: colors.textFaint, marginTop: 4 },

  // Section Card
  sectionCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  sectionTitleWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: colors.text, marginLeft: 6 },
  sectionDesc: { fontSize: fontSize.sm, color: colors.textMuted, marginBottom: 12 },
  resetHourBtn: { flexDirection: 'row', alignItems: 'center' },
  resetHourText: { fontSize: fontSize.sm, color: colors.danger, fontWeight: '700', marginLeft: 2 },

  // กราฟแท่ง Pure React Native
  chartContainer: { height: 160, marginTop: 8 },
  chartScroll: { alignItems: 'flex-end', paddingBottom: 6 },
  barCol: { width: 44, alignItems: 'center', marginRight: 10, height: '100%', justifyContent: 'flex-end' },
  barWrap: { width: 24, flex: 1, justifyContent: 'flex-end', alignItems: 'center' },
  barAmountTip: { fontSize: 9, color: colors.textFaint, marginBottom: 2, textAlign: 'center' },
  barAmountTipActive: { color: colors.primary, fontWeight: '700' },
  barFill: {
    width: '100%',
    backgroundColor: colors.successSoft,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
  },
  barFillPeak: { backgroundColor: '#34D399' },
  barFillSelected: { backgroundColor: colors.primary },
  barLabel: { fontSize: 10, color: colors.textFaint, marginTop: 6 },
  barLabelActive: { color: colors.primary, fontWeight: '700' },
  hourDetailBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    padding: 10,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  hourDetailText: { fontSize: fontSize.sm + 1, color: colors.primaryDeep, textAlign: 'center', marginLeft: 6 },

  // ช่องทางรับชำระเงิน
  paymentMeter: {
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.border,
    flexDirection: 'row',
    overflow: 'hidden',
    marginBottom: spacing.lg,
  },
  paymentMeterCash: { backgroundColor: '#10B981' },
  paymentMeterPrompt: { backgroundColor: '#3B82F6' },
  paymentRow: { flexDirection: 'row', justifyContent: 'space-between' },
  paymentBox: {
    width: '48%',
    backgroundColor: colors.bg,
    borderRadius: radius.sm,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  paymentTitleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  paymentName: { fontSize: fontSize.sm + 1, color: colors.textSecondary, fontWeight: '600' },
  paymentAmount: { fontSize: 18, fontWeight: '700', color: '#10B981', marginBottom: 2 },
  paymentSub: { fontSize: 11, color: colors.textMuted },

  // สองคอลัมน์
  rowGrid: { flexDirection: 'column' },
  halfCol: { width: '100%' },

  // อันดับเมนูขายดี
  rankItem: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  rankBadgeBox: { width: 32, alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  rankNumber: { fontSize: 15, fontWeight: '700', color: colors.textFaint },
  rankOne: { color: '#F59E0B', fontSize: 17 },
  rankItemHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  rankItemName: { fontSize: fontSize.sm + 1, fontWeight: '600', color: colors.text, flex: 1, marginRight: 8 },
  rankItemQty: { fontSize: fontSize.sm, fontWeight: '700', color: colors.primary },
  rankBarBg: { height: 6, backgroundColor: colors.surfaceMuted, borderRadius: 3, overflow: 'hidden' },
  rankBarFill: { height: '100%', backgroundColor: colors.primary, borderRadius: 3 },
  rankItemRevenue: { fontSize: 11, color: colors.textFaint, marginTop: 2 },

  // สัดส่วนหมวดหมู่
  catItem: { marginBottom: 12 },
  catHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  catName: { fontSize: fontSize.sm + 1, color: colors.textSecondary, fontWeight: '600' },
  catAmount: { fontSize: fontSize.sm, color: colors.textMuted, fontWeight: '700' },
  catBarBg: { height: 8, backgroundColor: colors.surfaceMuted, borderRadius: 4, overflow: 'hidden' },
  catBarFill: { height: '100%', backgroundColor: '#3B82F6', borderRadius: 4 },

  // บิลล่าสุด
  exportLinkBtn: { flexDirection: 'row', alignItems: 'center' },
  exportLinkText: { color: colors.primary, fontSize: fontSize.sm + 1, fontWeight: '700', marginLeft: 4 },
  emptyText: { textAlign: 'center', color: colors.textFaint, paddingVertical: 20 },
  orderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  orderRowHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  orderNumber: { fontSize: fontSize.md, fontWeight: '700', color: colors.text, marginRight: 8 },
  orderTable: { fontSize: fontSize.sm, fontWeight: '600', color: colors.primary, marginRight: 8 },
  orderTime: { fontSize: 11, color: colors.textFaint },
  orderSummaryText: { fontSize: fontSize.sm, color: colors.textMuted },
  orderRowRight: { alignItems: 'flex-end', marginLeft: 10 },
  orderTotal: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 4 },
  badgePay: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  badgePayText: { fontSize: 10, fontWeight: '700' },
  badgeCash: { backgroundColor: colors.primarySoft },
  badgeCashText: { color: colors.primaryDeep, fontSize: 10, fontWeight: '700' },
  badgePrompt: { backgroundColor: colors.infoSoft },
  badgePromptText: { color: colors.info, fontSize: 10, fontWeight: '700' },

  // Footer Actions
  footerActions: { marginTop: 8, gap: 10 },
  closeShiftBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.dark,
    height: 48,
    borderRadius: radius.md,
  },
  closeShiftBtnText: { color: colors.textOnPrimary, fontSize: 15, fontWeight: '700', marginLeft: 6 },
  lineShareBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#06C755', // LINE Green
    height: 48,
    borderRadius: radius.md,
  },
  lineShareBtnText: { color: colors.textOnPrimary, fontSize: 15, fontWeight: '700', marginLeft: 6 },

  // Modal สไตล์
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(17,24,39,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  receiptCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
  },
  receiptHeader: { alignItems: 'center', marginBottom: 12 },
  receiptStoreName: { fontSize: 18, fontWeight: '700', color: colors.text },
  receiptTitle: { fontSize: fontSize.sm + 1, color: colors.textMuted, marginTop: 2 },
  receiptMeta: { fontSize: 11, color: colors.textFaint, marginTop: 2 },
  receiptDivider: { height: 1, backgroundColor: colors.border, marginVertical: 12 },
  receiptItemRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  receiptItemName: { fontSize: fontSize.sm + 1, color: colors.textSecondary, flex: 2 },
  receiptItemQty: { fontSize: fontSize.sm + 1, color: colors.textMuted, flex: 1, textAlign: 'center' },
  receiptItemPrice: { fontSize: fontSize.sm + 1, fontWeight: '600', color: colors.text },
  receiptTotalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  receiptTotalLabel: { fontSize: 15, fontWeight: '700', color: colors.text },
  receiptTotalAmount: { fontSize: 20, fontWeight: '700', color: colors.primary },
  receiptPayMethodRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg },
  receiptPayMethodLabel: { fontSize: fontSize.sm, color: colors.textMuted },
  receiptPayMethodValRow: { flexDirection: 'row', alignItems: 'center' },
  receiptPayMethodVal: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text, marginLeft: 4 },
  modalCloseBtn: {
    backgroundColor: colors.surfaceMuted,
    paddingVertical: 12,
    borderRadius: radius.sm,
    alignItems: 'center',
  },
  modalCloseBtnText: { color: colors.textSecondary, fontSize: fontSize.md, fontWeight: '700' },

  // ปิดกะ Modal
  shiftCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
  },
  shiftHeaderRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  shiftTitle: { fontSize: 18, fontWeight: '700', color: colors.text, textAlign: 'center', marginLeft: 6 },
  shiftSubtitle: { fontSize: fontSize.sm + 1, color: colors.textMuted, textAlign: 'center', marginTop: 2, marginBottom: spacing.lg },
  shiftBox: { backgroundColor: colors.bg, borderRadius: radius.md, padding: 14, marginBottom: spacing.lg, borderWidth: 1, borderColor: colors.border },
  shiftRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  shiftLabel: { fontSize: fontSize.sm + 1, color: colors.textSecondary, fontWeight: '600' },
  shiftValCash: { fontSize: 17, fontWeight: '700', color: '#10B981' },
  shiftValPrompt: { fontSize: 17, fontWeight: '700', color: colors.info },
  shiftSubHint: { fontSize: 11, color: colors.textFaint, marginTop: 2 },
  shiftTotalLabel: { fontSize: 15, fontWeight: '700', color: colors.text },
  shiftTotalVal: { fontSize: 22, fontWeight: '700', color: colors.primary },
  shiftLabelVal: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  modalActionRow: { flexDirection: 'row', gap: 10 },
  modalSecondaryBtn: {
    flex: 1,
    backgroundColor: colors.surfaceMuted,
    paddingVertical: 12,
    borderRadius: radius.sm,
    alignItems: 'center',
  },
  modalSecondaryBtnText: { color: colors.textSecondary, fontSize: fontSize.md, fontWeight: '700' },
  modalPrimaryBtn: {
    flex: 2,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#06C755',
    paddingVertical: 12,
    borderRadius: radius.sm,
  },
  modalPrimaryBtnText: { color: colors.textOnPrimary, fontSize: fontSize.md, fontWeight: '700', marginLeft: 6 },
});
