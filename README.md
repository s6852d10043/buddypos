# BuddyPOS — ระบบจัดการร้านอาหารอัจฉริยะ (Smart Restaurant POS & QR Ordering)

ระบบจัดการร้านอาหารครบวงจร (Point of Sale & QR Table Ordering) พัฒนาด้วย **React Native (Expo SDK 54)** และ **Supabase** รองรับการใช้งานทั้งบน **Web Browser** และแอปมือถือ **Android (`.apk`)**

---

## ลิงก์ใช้งานระบบ (Production)
- **หน้าเว็บหลัก (เจ้าของร้าน / พนักงาน / ลูกค้า):** [https://buddypos-beta.vercel.app](https://buddypos-beta.vercel.app)
- **หน้าผู้ดูแลระบบกลาง (Super Admin Console):** [https://buddypos-beta.vercel.app/?mode=admin](https://buddypos-beta.vercel.app/?mode=admin)

---

## ฟีเจอร์หลักของระบบ

### 1. โหมดเจ้าของร้าน (Store Owner)
- **จัดการหลายสาขา/ร้านค้า (`HomeScreen.js`, `StoreDashboard.js`):** สร้างและแก้ไขข้อมูลร้านค้า อัปโหลดโลโก้ร้าน (แปลงเป็น `.webp` อัตโนมัติ)
- **จัดการโต๊ะและระบบพิมพ์ QR Code (`TableManagementScreen.js`):**
  - เพิ่มโต๊ะเดี่ยวหรือสร้างหลายโต๊ะพร้อมกัน พร้อมระบบป้องกันชื่อหรือเลขโต๊ะซ้ำภายในร้านเดียวกัน
  - สร้าง QR Code ประจำโต๊ะพร้อมโลโก้ร้านตรงกลาง สั่งพิมพ์ขนาดตามต้องการ (cm) หรือแชร์ลิงก์และรีเซ็ต Token โต๊ะได้ทันที
- **จัดการเมนูอาหาร (`MenuManagementScreen.js`):** เพิ่ม/แก้ไข/ลบเมนู แยกหมวดหมู่ เปิด-ปิดสถานะสินค้าหมดชั่วคราว พร้อมอัปโหลดรูปอาหาร
- **จัดการ QR พนักงาน (`StaffQrScreen.js`):** สร้างและรีเซ็ต QR Code สำหรับพนักงานเข้าเวร หากรีเซ็ตใหม่จะเตะเซสชันเก่าออกแบบ Realtime ทันที
- **ตั้งค่าการรับเงินและภาษี (`PaymentSettingsScreen.js`):** ตั้งค่า PromptPay (เบอร์โทรศัพท์ / เลขบัตรประชาชน / เลขผู้เสียภาษี), บัญชีธนาคาร, VAT (%) และ Service Charge (%)
- **รายงานยอดขายและกะการทำงาน (`SalesReportScreen.js`):** สรุปยอดขายรายวัน/สัปดาห์/เดือน/ทั้งหมด แยกตามเงินสดและโอนจ่าย ดูบิลย้อนหลังรายใบ และระบบปิดกะ (Close Shift)
- **ระบบสมาชิก (`CustomerListScreen.js`):** บันทึกและดูประวัติยอดซื้อสะสมของลูกค้าจากเบอร์โทรศัพท์

### 2. โหมดพนักงานหน้าร้าน / ห้องครัว / แคชเชียร์ (Staff Mode)
- **เข้าสู่ระบบพนักงาน (`StaffLoginScreen.js`):** สแกน QR Code ด้วยกล้อง, เลือกรูป QR จากอัลบั้มภาพ, หรือวางลิงก์ Token พร้อมจำร้านล่าสุดที่เคยเข้าทำงาน
- **หน้าหลักพนักงาน (`StaffMainScreen.js`):**
  - **แจ้งเตือนออเดอร์ใหม่ Realtime:** ระบบสั่นเตือน (`Vibration`) บนมือถือ, เสียงกระดิ่ง (`Web Audio Chime`) บนเว็บ และแบนเนอร์เด้งแจ้งเตือนด้านบนเมื่อลูกค้าสั่งอาหารเข้ามาใหม่
  - **ห้องครัว (Kitchen):** รับออเดอร์ เปลี่ยนสถานะ *รอดำเนินการ -> กำลังปรุง -> พร้อมเสิร์ฟ*
  - **แคชเชียร์ (Cashier):** ตรวจสอบรายการรอเสิร์ฟและคิดเงิน รวมบิลหลายรอบของโต๊ะเดียวกันอัตโนมัติ คำนวณ VAT / Service Charge สะสมแต้มสมาชิก สร้าง QR PromptPay ตามยอดสุทธิ และระบบ **แยกบิล (Split Bill)** ทั้งแบบหารเท่าและแยกตามรายการอาหาร
  - **รับออเดอร์หน้าร้าน (Take Order) & ผังโต๊ะ (Tables):** สั่งอาหารให้ลูกค้า ย้ายโต๊ะ รวมโต๊ะ หรือเคลียร์โต๊ะว่าง

### 3. โหมดลูกค้าสั่งอาหารผ่าน QR ประจำโต๊ะ (Customer QR Ordering)
- **สั่งอาหารไม่ต้องโหลดแอป (`CustomerOrderScreen.js`):** ลูกค้าสแกน QR Code ที่โต๊ะเพื่อเลือกเมนู ระบุหมายเหตุรายจาน ส่งออเดอร์เข้าครัว และติดตามสถานะอาหารแบบ Realtime

### 4. โหมดผู้ดูแลระบบกลาง (Super Admin)
- **จัดการระบบทั้งหมด (`SuperAdminScreen.js`):** ดูสถิติภาพรวมทั้งแพลตฟอร์ม ค้นหา/ระงับการใช้งานร้านค้าชั่วคราว (`suspended`) หรือลบร้านค้าและดูรายชื่อสมาชิกทั้งหมด

---

## โครงสร้างโปรเจกต์
```text
buddypos/
├── App.js                          # จุดเริ่มต้นของแอป, ระบบ Routing, SafeAreaProvider และ ErrorBoundary
├── app.json                        # ตั้งค่า Expo SDK 54, Android permissions, Adaptive Icon & Splash
├── eas.json                        # ตั้งค่า EAS Build สำหรับสร้างไฟล์ Android .apk
├── vercel.json                     # ตั้งค่าการ Deploy เว็บแอปบน Vercel
├── assets/                         # โลโก้แอป BuddyPOS (icon, adaptive-icon, splash-icon, favicon)
└── src/
    ├── components/
    │   └── QRScannerModal.js       # โมดอลสแกน QR Code ด้วยกล้อง
    ├── lib/
    │   └── supabase.js             # การเชื่อมต่อฐานข้อมูล Supabase
    ├── theme/
    │   ├── index.js                # ระบบสี (Emerald Green Theme), ระยะห่าง, ฟอนต์ และเงา
    │   └── Icon.js                 # คอมโพเนนต์ไอคอน Ionicons
    ├── utils/
    │   └── promptpay.js            # ระบบสร้าง EMVCo PromptPay QR Payload (CRC16) และคำนวณภาษี/ค่าบริการ
    └── screens/                    # หน้าจอทั้งหมดของระบบ (14 หน้าจอ)
```

---

## การรันโปรเจกต์เพื่อพัฒนา (Development)

```bash
# ติดตั้ง Dependencies
npm install

# รันเซิร์ฟเวอร์พัฒนาบนเว็บ (พอร์ต 8081)
npx expo start --web --port 8081

# สร้างไฟล์ Android APK ผ่าน EAS Build
npx eas-cli build -p android --profile preview
```
