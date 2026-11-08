# ขอบเขตแพ็กเกจและการติดตั้ง CLI กับ Player

Labels: wayfinder:grilling
Type: grilling
Status: resolved

## Question

CLI และ Player ต้องเปิดเผยอะไรต่อกัน ใครเป็นเจ้าของ local server และ static assets และจัด dependency/build/distribution อย่างไรให้ติดตั้ง CLI ครั้งเดียวแล้วยังใช้ view ได้ โดยแยกเป็นคนละแพ็กเกจจริง?

## Answer

ผู้ใช้ยืนยันข้อเสนอทั้งสามข้อในการสนทนา:

- แยกเป็น `@event-tape/cli` กับ `@event-tape/player` จริง โดย CLI เป็นเจ้าของ executable `event-tape`, คำสั่ง `view`/`record`, การเปิด browser และ local server ทั้งหมด
- Server ของ `view` กับ `record` ไม่จำเป็นต้องเป็น instance เดียวกัน; การบันทึกยังใช้ Recorder/Writer เดิม ไม่ย้าย core เข้าสู่ Player หรือสร้าง core ซ้ำ
- Player เป็นเว็บแอปและเป็นเจ้าของ built static assets รวมถึง assets ที่เว็บแอปต้องใช้ ไม่ใช่ React component library และไม่เปิด public component API ในขอบเขตนี้
- CLI serve assets จากแพ็กเกจ Player ที่ติดตั้งในเครื่อง ไม่โหลดจาก CDN; `view` ต้องใช้ offline ได้
- CLI ประกาศ Player เป็น runtime dependency ด้วยเวอร์ชันแน่นอนที่เข้ากัน ผู้ใช้ติดตั้ง CLI ครั้งเดียว ไม่ต้องติดตั้งหรือจับคู่ Player เอง และ Player ไม่อัปเดตแยกเองจนเปลี่ยนพฤติกรรม CLI ที่ติดตั้งแล้ว

### ข้อกำหนดสำหรับ spec/implementation

- ทิศ dependency คือ CLI → Player; Player ไม่พึ่ง CLI และไม่เป็นเจ้าของ server หรือ executable อีกต่อไป
- Player ต้องส่งมอบ assets ครบในแพ็กเกจที่ติดตั้งได้จริง และให้ CLI หา asset root ผ่านขอบเขตแพ็กเกจที่กำหนดไว้ ไม่อาศัยตำแหน่ง source ใน workspace; ชื่อ export/path ที่แน่นอนเป็นรายละเอียด implementation ไม่ใช่ decision ค้าง
- Build Player assets ก่อนแพ็ก/ตรวจการติดตั้ง CLI; ตรวจจากการติดตั้งนอก workspace ว่า CLI serve UI และ Worker ได้จริงโดยไม่เข้าถึง checkout หรือ CDN
- ย้าย executable และปรับ callers/build/install documentation ตามแพ็กเกจใหม่แบบ cutover ไม่คง executable ซ้ำใน Player

### ขอบเขตของคำตอบ

คำตอบนี้กำหนด package/distribution boundary เท่านั้น ไม่เลือก protocol, public handler API, proxy semantics หรือ record lifecycle แทน tickets เหล่านั้น
