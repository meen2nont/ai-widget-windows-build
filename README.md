[ 🇹🇭 ภาษาไทย ](README.md) | [ 🇬🇧 English ](README_en.md)

# AI Widget Dashboard

AI Widget Dashboard เป็นแอปพลิเคชันยูทิลิตี้สำหรับติดตามและจัดการยอดคงเหลือ (Balance) โควต้า และสถานะการใช้งานของบริการ AI ต่างๆ เช่น **DeepSeek** และ **Ollama** อย่างสะดวกรวดเร็ว โดยมีให้ใช้งานทั้งบนระบบปฏิบัติการ macOS (Menu Bar App) และ Windows (System Tray App)

## 🌟 คุณสมบัติหลัก (Features)
- **หน้าแดชบอร์ดแบบรวมศูนย์ (Unified Popover)**: ดูข้อมูลภาพรวมของบริการ AI ทั้งหมดได้ในหน้าต่างเดียว
- **DeepSeek Integration**: ติดตามยอดคงเหลือ (Balance) ของบัญชี DeepSeek API ของคุณ
- **Ollama Cloud & Ollama Pay**: ติดตามโควต้าการใช้งาน (Session/Weekly Usage) ของ Ollama Cloud และดูข้อมูลของ Ollama Pay ผ่านระบบคลาวด์โดยตรง (ออกแบบมาเพื่อดู Usage เท่านั้น ไม่มีฟีเจอร์แชท)
- **Menu Bar / System Tray**: ฝังตัวอยู่บน Menu Bar (macOS) หรือ System Tray (Windows) ทำให้ไม่เกะกะพื้นที่หน้าจอและเข้าถึงได้ตลอดเวลา
- **ปรับแต่งการแสดงผลได้**: เลือกได้ว่าจะให้แสดงไอคอนของบริการไหน (เช่น ไอคอน DeepSeek พร้อมยอดเงิน, ไอคอน Ollama พร้อมเปอร์เซ็นต์) เป็นหลักบน Menu Bar
- **อัปเดตอัตโนมัติ**: ตั้งเวลา Refresh ข้อมูลอัตโนมัติ (เช่น ทุกๆ 5 นาที) พร้อมรองรับการเปิดตอนเปิดเครื่อง (Launch at Login)

- **Web Dashboard (Docker)**: เว็บแดชบอร์ดสไตล์พรีเมียม (Vite + React) สำหรับรันผ่าน Docker ดูโควต้าผ่านเบราว์เซอร์ พร้อมฟีเจอร์ AI Playground คุยกับ DeepSeek ได้ในตัว และระบบเข้ารหัสเก็บ API Keys แบบ **AES-256 (AES-GCM) JSON** ใน Browser LocalStorage

## 📁 โครงสร้างโปรเจกต์

โปรเจกต์นี้แบ่งแอปพลิเคชันออกเป็น 3 ส่วนหลัก:

- **`/NativeApp`**: แอปพลิเคชันสำหรับ macOS พัฒนาด้วย Swift (ใช้ SwiftUI ร่วมกับ AppKit)
- **`/WindowsApp`**: แอปพลิเคชันสำหรับ Windows พัฒนาด้วย C# และ WPF (ใช้ Hardcodet.NotifyIcon.Wpf สำหรับ System Tray)
- **`/WebDashboard`**: เว็บแดชบอร์ดสำหรับดูโควต้าและทดลอง AI พัฒนาด้วย React (Vite) + Express Proxy (Node.js) และ containerized ด้วย Docker (Port 9000)

## 🚀 การติดตั้งและการเปิดใช้งาน

### 📌 สิ่งที่ต้องมี (Prerequisites)
ก่อนเริ่มใช้งาน คุณจำเป็นต้องเตรียมสิ่งเหล่านี้ให้พร้อม:
- **Ollama Cloud API Key**: สำหรับดึงข้อมูลโควต้าและสถานะการใช้งานจาก Ollama Cloud คุณจะต้องกรอก API Key ในตัวแอป (เป็นการดึงข้อมูลผ่านระบบคลาวด์โดยตรง ไม่จำเป็นต้องรัน Local Server ในเครื่อง)
- **DeepSeek API Key**: สำหรับดึงข้อมูลยอดคงเหลือ (Balance) ของ DeepSeek คุณอาจต้องตั้งค่า API Key ในตัวแอป
- **macOS**: รองรับ macOS 12.0 ขึ้นไป (สำหรับแอปพลิเคชัน Native)
- **Windows**: รองรับ Windows 10/11 ที่มี .NET Framework/Core ตามที่กำหนด

### 🍎 สำหรับ macOS (มี 2 รูปแบบให้เลือกใช้งาน)

**รูปแบบที่ 1: ใช้งานผ่าน Native App (แนะนำ)**
แอปพลิเคชันรูปแบบนี้ทำงานได้ด้วยตัวเองเป็น Standalone Menu Bar App:
1. เปิดโฟลเดอร์โปรเจกต์ใน **Xcode**
2. เลือก Target `AIWidgetApp`
3. กด Build and Run (`Cmd + R`)
4. จะมีไอคอนปรากฏอยู่ที่แถบ Menu Bar ด้านบนขวาของหน้าจอ

**รูปแบบที่ 2: ใช้งานผ่าน SwiftBar / xbar (สำหรับสคริปต์ Python)**
ในโฟลเดอร์มีไฟล์ `antigravity_status.10s.py` ซึ่งเป็นสคริปต์ทางเลือกสำหรับคนที่ใช้ **SwiftBar** หรือ **xbar**:
1. ติดตั้งแอปพลิเคชัน [SwiftBar](https://github.com/swiftbar/SwiftBar) หรือ [xbar](https://xbarapp.com/)
2. นำไฟล์ `antigravity_status.10s.py` ไปวางในโฟลเดอร์ Plugin ของ SwiftBar/xbar
3. สคริปต์จะทำงานคู่กับ SwiftBar เพื่อแสดงสถานะบน Menu Bar ทุกๆ 10 วินาที

### 🪟 สำหรับ Windows (WindowsApp)
1. เปิดไฟล์ `AIWidgetWindowsApp.csproj` หรือไฟล์ Solution ใน **Visual Studio**
2. ติดตั้ง NuGet Packages ที่จำเป็น (ถ้ามี)
3. กด Start Debugging (`F5`)
4. แอปจะรันและแสดงไอคอนอยู่ใน System Tray บริเวณมุมขวาล่างของ Taskbar

### 🐳 สำหรับ Web Dashboard (Docker)
1. เข้าไปที่โฟลเดอร์ `WebDashboard`:
   ```bash
   cd WebDashboard
   ```
2. Build และ Run ผ่าน Docker (พร้อมเชื่อมต่อ Mount Volume สำหรับเซฟ `config.json` ถาวรบน Server):
   ```bash
   docker build -t ai-widget-dashboard .
   docker run -d --name ai-widget-dashboard -v $(pwd)/data:/app/data --restart unless-stopped -p 9000:9000 ai-widget-dashboard
   ```
3. เปิดเบราว์เซอร์ไปที่ `http://localhost:9000` (หรือ IP ของ Server) แล้วไปที่ **Settings** เพื่อตั้งค่า API Keys โดยระบบจะบันทึกเก็บเป็น JSON บน Server ทำให้ทุกอุปกรณ์เปิดมาใช้งานร่วมกันได้ทันทีโดยไม่ต้องตั้งค่าใหม่ซ้ำอีก

## ⚙️ การตั้งค่าการใช้งาน (Settings)
ภายในแอปคุณสามารถตั้งค่าต่างๆ ได้ดังนี้:
- **Refresh Interval**: กำหนดรอบเวลาในการดึงข้อมูลล่าสุด (ค่าเริ่มต้นคือ 300 วินาที / 5 นาที)
- **Menu Bar Display Mode**: เลือกให้แสดงไอคอนและข้อมูลของ DeepSeek, Ollama, หรือแบบ Default
- **Notifications**: เปิด-ปิดการแจ้งเตือนต่างๆ ของระบบ

---
*หมายเหตุ: โปรเจกต์นี้กำลังอยู่ในช่วงการพัฒนา (Development)*
